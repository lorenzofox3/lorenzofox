---
title: Schema first design
date: 2024-12-07
description: Describes how to use a JSON schema to define the API of a software component and improve both the development cycle and the quality of the code. 
---

<div class="intro"> 
<p class="wide">
There are several development methodologies that focus on first defining a contract (or an expected behaviour), for the software component under development: (<a href="https://swagger.io/resources/articles/adopting-an-api-first-approach/">API first design</a>, <a href="https://en.wikipedia.org/wiki/Test-driven_development">test-driven development</a>, etc.). In this article, we will see how using a <a href="https://json-schema.org/">JSON schema</a> to define your API can bring consistency to your software and improve its overall quality.
</p>
</div>

## API schema

[JSON Schema](https://json-schema.org/) is a popular way of defining data structures. The format can be easily parsed and used to automate the generation of validation logic, test cases, documentation and so on; you will never be short of tools no matter what technology you use.

Taking the example of the [previous post](/posts/separation-of-concerns), let's see what our API's schema could be:

```ts
import {JSONSchema} from 'json-schema-to-ts';

const schema = {
    $id: 'bank-accounts.schema.json',
    title: 'bank accounts service',
    description: 'The bank accounts service definition',
    type: 'object',
    properties: {
        commands: {
            type: 'object',
            properties: {
                transferMoney: {
                    type: 'object',
                    properties: {
                        input: {
                            type: 'object',
                            properties: {
                                from: {
                                    $ref: 'bank-accounts.schema.json#/definitions/bankAccountId'
                                },
                                to: {
                                    $ref: 'bank-accounts.schema.json#/definitions/bankAccountId'
                                },
                                amount: {
                                    $ref: 'bank-accounts.schema.json#/definitions/amount'
                                }
                            },
                            additionalProperties: false,
                            required: ['from', 'to', 'amount']
                        }
                    },
                    required: ['input'],
                    additionalProperties: false
                }
            },
            required: ['transferMoney'],
            additionalProperties: false
        }
    },
    required: ['commands'],
    additionalProperties: false,
    definitions: {
        bankAccountId: {type: 'string', description: 'The unique identifier of a bank account'},
        amount: {type: 'integer', description: 'A monetary amount, in cents'}
    }
} as const satisfies JSONSchema;
```

I invite you to go through the [JSON schema documentation](https://json-schema.org) for more details on the syntax. But, even without that knowledge, you can 
understand the overall schema definition with some fields being informative(description, title, etc.) and others being declarative of the data contracts.  

The syntax seems a bit verbose, but it brings a lot of flexibility and power as we will soon see. You could anyway avoid some boilerplate by generating the schema on the fly based on a record of command name/command input schema, for example.

### Runtime behaviour

Now that we have a definition of the contract, we can easily implement data validation. In the Node.js ecosystem, there are several libraries for building validation on top of JSON schemas, one of the most popular being [ajv](https://ajv.js.org/). Since we want our module contract to be fully defined by the schema, we can modify the ``defineModule`` of the framework built in the previous article to enforce this new policy.
The new implementation could be
```js
import _ from 'lodash';
import {createProvider} from 'dismoi';
import assert from 'node:assert'
import Ajv from 'ajv';

const ajv = new Ajv();

export const defineModule = ({commands, schema, injectables}) => {
    ajv.addSchema(schema);
    const commandListFromSchema = Object.keys(schema.properties.commands.properties);
    const commandListFromImplementation = Object.keys(commands);
    const symmetricDifference = new Set(commandListFromImplementation).symmetricDifference(new Set(commandListFromSchema));
    assert(symmetricDifference.size === 0, `discrepancy between schema and implementation: [${[...symmetricDifference]}]`)

    const commandWithValidation = _.mapValues(commands, (commandFactory, commandName) => {
        const inputSchema = schema.properties.commands.properties[commandName].properties.input;
        return withValidationDecorator(commandFactory, inputSchema)
    });

    const _injectables = {
        ...injectables,
        ..._.mapValues(commandWithValidation, withinTransactionDecorator)
    };

    return createProvider({injectables: _injectables, api: Object.keys(commands)});
};
```

Now, the function ``defineModule`` takes a schema as a parameter. We start by adding the schema to the ``ajv`` singleton so that we can reference the main schema in the ``$ref`` clauses (in practice, this, should be done slightly differently if you want to be able to reference completely different schemas,e.g. coming from different modules).
We then use the new ``symmetricDifference`` of javascript ``Set`` to ensure that the schema is consistent with the provided implementation. This is not ideal in the sense that the error is thrown at runtime, but it is not necessarily a problem if you add a simple test to your suite that checks that you can define the module. We will soon see how you can have this signal directly when you code, using Typescript.  
What's left is to map the command input schema and the command factory together with the new ``withValidationDecorator`` decorator.

```js
function withValidationDecorator(commandFactory, schema) {
    const validate = ajv.compile(schema);
    return (deps) => {
        const command = commandFactory(deps);
        return (input) => {
            const isValid = validate(input);
            if(!isValid){
                throw new Error('Invalid command input', {cause: validate.errors});
            }
            return command(input);
        }

    }
}
```

Nothing fancy here. We can then compose with the former ``withinTransactionDecorator`` decorator and we now have: 
1. Our API fully defined by a json schema 
2. The API can't change without the schema being updated and vice versa, which somehow enforces keeping the documentation inline with the behaviour.
3. All our commands run inside a transaction (see previous post)

That's great, but let's see how we can improve the developer experience even further by using Typescript

### Developer experience

In the Javascript ecosystem, [Typescript](https://www.typescriptlang.org/), which brings static typing to Javascript, has also become a popular tool for describing data structures and enforcing their consistency throughout the software stack. However, types disappear at runtime and are less useful when it comes to building runtime logic (i.e. actually validating a data input passed to a function, for example).
For these reasons, developers sometimes tend to duplicate the data structure definition to accommodate different use cases, or rely on libraries that are more specialised and less versatile than a *dumb* serialisable format like json.

The good news, is that you can use libraries to infer types from a JSON schema. If you paid attention to the schema definiton in the introduction, you should have noticed that it ``satisfies`` a JSON schema. This gives you auto-completion when writing your schema, and makes sure you don't have any syntax errors.
We can also use the ``FromSchema`` from the same [json-schema-to-ts library](https://github.com/thomasaribart/json-schema-to-ts) to infer the definition of the commands.

```typescript
import {JSONSchema, FromSchema} from 'json-schema-to-ts';

type CommandsDef<Schema extends JSONSchema> = FromSchema<Schema> extends {
    commands: infer Commands
} ? Commands : never;
```

In the same way, we can go further and express the command signature (assuming for the moment, the output is always ``void``): 

```ts
type CommandInput<Schema extends JSONSchema, Name extends keyof CommandsDef<Schema>> = CommandsDef<Schema>[Name] extends {
    input: infer Input
} ? Input : never;

type CommandFn<Schema extends JSONSchema, Name extends keyof CommandsDef<Schema>> = 
    (input: CommandInput<Schema, Name>) => Promise<void>
```

As you can see in the animation below, you can now explicitly say that a function is an implementation of the command defined by the schema, and you will get a compilation error if you change either the function signature, or the schema without reflecting the change in a compatible way.

<figure>
    <video controls>
    <source src="/posts/schema-first-design/transfer-money-devx.mp4" />
    </video>
    <figcaption>Dev experience with type inference</figcaption>
</figure>

