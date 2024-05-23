---
title: How to avoid mixing business and technical concerns
description: Showcase how tu use dependency injection to avoid mixing concerns
date: 2024-05-23
---

<div class="intro"> 
<p class="wide">
When implementing business cases, you don't want to have to deal with database transactions, low-level telemetry and other technical details. 
In this series, we will build a small framework around dependency injection to make sure business and technical concerns are separated.  
</p>
</div>

## Introduction example

Suppose you have to implement a command that transfers money from one bank account to another. The code can look like
this:

```typescript
import assert from 'node:assert';

export type BankAccount = {
    bankAccountId: string;
    balance: number;
};

export type BankAccountService = {
    findOne({bankAccountId}: { bankAccountId: string; }): Promise<BankAccount | undefined>;
    updateBalance({bankAccountId, balance}: BankAccount): Promise<void>;
};

export const createTransferMoneyCommand =
    ({bankAccountService}: { bankAccountService: BankAccountService }) =>
        async ({from, to, amount}: { from: string; to: string; amount: number; }) => {
       
            const [fromAccount, toAccount] = await Promise.all(
                [from, to].map((bankAccountId) =>
                    bankAccountService.findOne({bankAccountId})
                )
            );
            assert(fromAccount, 'origin account does not exist');
            assert(toAccount, 'target account does not exist');

            // ... some other business rules

            const newToBalance = fromAccount.balance + amount;
            const newFromBalance = fromAccount.balance - amount;

            return Promise.all([
                bankAccountService.updateBalance({
                    bankAccountId: fromAccount.bankAccountId,
                    balance: newFromBalance
                }),
                bankAccountService.updateBalance({
                    bankAccountId: toAccount.bankAccountId,
                    balance: newToBalance
                })
            ]);
        };
```

Interestingly, the command does not know anything about its dependencies (``bankAccountService``). On the contrary, it 
*exports* the contract they must fulfil.  
At this point, the ``bankAccountService`` could be anything from a stub, to service that talks to a database, to a
component that uses a remote protocol to call third party service.

Let's see a possible implementation of the ``bankAccountService``:

```typescript
import {DBClient, SQL} from '../db';
import {BankAccount, BankAccountService} from './transfer-money.command';

export const createBankAccountRepository = ({db}: {
    db: DBClient;
}): BankAccountService => {
    return {
        async findOne({bankAccountId}: { bankAccountId: string }) {
            const rows = await db.query<BankAccount>(SQL`
SELECT
  bank_account_id as "bankAccountId",
  balance as "balance"
FROM
  bank_accounts
WHERE
  bank_account_id = ${bankAccountId};`);
            return rows.at(0);
        },
        async updateBalance({
                                bankAccountId,
                                balance
                            }: {
            bankAccountId: string;
            balance: number;
        }) {
            await db.query(SQL`
UPDATE
    bank_accounts
SET
    balance=${balance}
WHERE
    bank_account_id=${bankAccountId}
;`);
        }
    };
};
```

This is a *repository* that relies on a low-level client database using SQL as the query language.
This time, the repository imports types from its dependency and makes explicit the command contract it satisfies (this
is not mandatory, as the type checker will throw an error anyway if we don't pass a proper ``BankAccountService`` to the
command factory).
There is no need to be as abstract as in the command: this is already a low-level component, although you could, for
example, swap a Postgres implementation for a MySql implementation.

The database client could be a simple wrapper around ``node-pg`` for now:

```typescript
import {PoolClient, Pool, PoolConfig} from 'pg';
import {SQLStatement} from 'sql-template-strings';

export type DBClient = {
    query<Row>(statement: SQLStatement | string): Promise<Array<Row>>;
};

const createClient = ({client}: { client: Pick<PoolClient, 'query'>; }) => {
    return {
        async query(query: SQLStatement | string) {
            const {rows} = await client.query(query);
            return rows;
        }
    };
};

export const createDB = ({pgConf}: { pgConf: PoolConfig; }) => {
    const pool = new Pool(pgConf);
    return createClient({client: pool});
};
```

## Low coupling and boilerplate

The command is not coupled to any particular dependency, yet there is no magic: you need to glue all the pieces
together at some point:

```typescript
const createBankAccountModule = ({pgConf}) => {
    const db = createDB({pgConf});
    const bankAccountService = createBankAccountRepository({db});
    const transferMoney = createTransferMoneyCommand({bankAccoutSerice});
    return {
        transferMoney
    };
};

const pgConf = {}; // coming from env etc
const {transferMoney} = createBankAccountModule({pgConf});
transfertMoney({from: 'account1', to: 'account2', amount: 2_000});
```

Even if the sequence of instantiation statements looks daunting, I personally find such a code very insightful:
you have in a single place all the connections between the various components and how they relate to each other.

### Dependency Injection container

An alternative is to use a dependency injection container which gives you the ability to explicit all the components in
a declarative way, while losing the explicit relationship between them in the process.

Let's use [dismoi](https://github.com/lorenzofox3/dismoi)(a library I wrote) for this. You define the components as a map whose keys are the injection tokens (usually their names) and whose values are the factory functions to instantiate them.
You can possibly bind the missing dependencies on the late (or override some already provided if needed):

```typescript
import {createProvider} from 'dismoi';

const createBankAccounModule = createProvider({
    injectables: {
        transferMoney: createTransferMoneyCommand,
        bankAccountService: createBankAccountRepository,
        db: createDB
    },
    api: ['transferMoney'] // what will be exposed
});

const pgConf = {}; // coming from env etc
const {transferMoney} = createBankAccounModule({pgConf});
```

## Data consistency and technical concerns

What happens if one of the balance updates fails and the other does not? We have corrupted data in the database.
In such a command, we want either all writes to be committed or none. This is called atomicity, and it is the A
of [ACID](https://en.wikipedia.org/wiki/ACID).
Luckily for us, our database (postgres) supports atomic transactions. Let's see how we can modify our database client to
use database transactions.

```typescript
export type CommandFn = ({db}: { db: DBClient }) => any;

export type DBClient = {
    query<Row>(statement: SQLStatement | string): Promise<Array<Row>>;
    withinTransaction<Fn extends CommandFn>({fn}: { fn: Fn; }): Promise<ReturnType<Fn>>;
};
```

The new database client interface has a ``withinTransaction`` function that takes a function as input. This function
receives a db client instance as parameter, and the instance will be bound to the current transaction context.
The implementation could be:

```typescript
import {Pool, PoolClient, PoolConfig} from 'pg';
import {SQLStatement} from 'sql-template-strings';

const createClient = ({client}: {
    client: Pick<PoolClient, 'query'>;
}) => {
    const db: DBClient = {
        async query(query: SQLStatement | string) {
            const {rows} = await client.query(query);
            return rows;
        },
        withinTransaction({fn}: { fn: CommandFn }) {
            return fn({db});
        }
    };

    return db;
};

export const createDB = ({pgConf}: { pgConf: PoolConfig; }): DBClient => {
    const pool = new Pool(pgConf);

    return {
        ...createClient({client: pool}),
        async withinTransaction({fn}: { fn: CommandFn }) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await fn({db: createClient({client})});
                await client.query('COMMIT');
                return result;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }
    };
};
```

The exposed pool wrapper implements the ``withinTransaction`` function as a wrapper.
It creates an internal database client dedicated to the transaction, and wraps the execution of the provided ``fn``
function within ``BEGIN``/``COMMIT`` clauses handling errors with ``ROLLBACK``.
The private client wrapper implements the same interface but does nothing with ``withinTransaction``: there is no nested
transaction and calling ``withinTransaction`` from inside a running transaction will only pass the
current transaction context.

We can now use database transactions inside our command:

```typescript
import {createBankAccountRepository} from './bank-account.repository';

// ...

export const createTransferMoneyCommand =
    ({db}: { DBClient }) => async (input) => {
        // ...

        await db.withinTransaction({
            fn: async(({db}) => {
                const bankAccountService = createBankAccountRepository({db});
                // atomic updates with default isolation settings
                return Promise.all([
                    bankAccountService.updateBalance({
                        bankAccountId: fromAccount.bankAccountId,
                        balance: newFromBalance,
                    }),
                    bankAccountService.updateBalance({
                        bankAccountId: toAccount.bankAccountId,
                        balance: newToBalance,
                    }),
                ]);
            })
        });
    };
```

But this comes at a high cost. We have introduced a strong coupling between the command and the repository: the command has to know the concrete implementation of
``BankAccountService``, where to import it from, how to instantiate it (class ? factory ? etc.), and depends on the low-level component ``db``.

In a perfect world we want the product engineer to be able to write the business code as he did in the first place, without having to worry about technical details such database transactions and so one. 

## Leverage the dependency injection

The DI container we are using has the nice feature of injecting itself as a dependency in all injectable factories (under the ``provideSymbol`` injection token). 
We can use this to build a decorator around the command factory to ensure that the command and the entire dependency graph are instantiated within the same database transaction:

```javascript
// (from now, I remove all the TS noise so example are easier to read)

import {provideSymbol} from 'dismoi';

export const withinTransactionDecorator =
    // takes a factory ...
    (commandFactory) =>
        // ... and returns a factory 
        ({db, [provideSymbol]: provide}) => {
            // here db is the pool
            return (commandInput) => db.withinTransaction({
                    fn: ({db}) => {
                        // here db is a client bound to the transaction
                        // we can therefore instantiate all the dependency graph at this point
                        const deps = provide({db});
                        const command = commandFactory(deps);
                        // and execute the command
                        return command(commandInput);
                    }
                });
        };
```

You can use the decorator when registering the command to the DI container

```typescript
const createModule = createProvider({
    injectables: {
        transferMoney: withinTransactionDecorator(createTransferMoneyCommand),
        bankAccountService: createBankAccountRepository,
        db: createDB
    },
    api: ['transferMoney'],
});
```
If you look at the [trace](https://opentelemetry.io/docs/concepts/signals/traces/)(we will get to this in a future post) of the command execution, 
you will see that all the database requests are running in the same transaction:

<figure>
    <img src="/posts/separation-of-concerns/trace-ok.png" alt="trace diagram">
    <figcaption>Trace diagram when command succeeds</figcaption>
</figure>

And if one of the writes happens to fail, the whole transaction is aborted

<figure>
    <img src="/posts/separation-of-concerns/trace-not-ok.png" alt="trace diagram">
    <figcaption>Trace diagram when command fails</figcaption>
</figure>

And that's it, atomic database transactions are no longer a concern when writing the command: they will be handled automatically in an implicit way.

## Going further

We can go a little further and build a small framework around the functions we have defined so far. 
We want all commands to be atomic by default, so that product engineers are not burdened with these technical details.

```javascript
import _ from 'lodash';
import {createProvider} from 'dismoi';

const defineModule = ({commands, injectables}) => {
    
    const _injectables = {
        ...injectables,
        ..._.mapValues(commands, withinTransactionDecorator)
    };
    
    return createProvider({injectables: _injectables, api: Object.keys(commands)});  
}; 

const createBankAccountModule =  defineModule({
    commands: {
        transferMoney: createTransferMoneyCommand
    },
    injectables: {
        bankAccountService: createBankAccountRepository
    }
});

const {transferMoney} = createBankAccountModule({
    db: {} // db coming from somewhere
})

// Note: we left the db pool as an external dependency
// as it will likely be shared among a set of different modules
```

This API is more explicit about our opinions: we have the notion of commands, DI is more of a detail. On the other hand, 
atomicity is guaranteed by default but does not leak into the business code (the command).



