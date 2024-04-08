---
title: Template engine with streaming capability - part 2/2
date: 2024-04-10
description: Post about how to improve the performance of a streaming HTML template engine  
---

<div class="intro"> 
<p class="wide">
In <a href="/posts/html-streaming-part-1" rel="prev">the previous article</a> we built a template engine that supports streaming. Unfortunately, it did not perform very well when 
rendering a test page (a blog home page) compared to other popular libraries. In this article, we will look at several techniques that will lead us to a more efficient implementation.
</p>
</div>

## Refresher

Here are the relevant parts of the code we will improve. For more details, please refer to the [first part](/posts/html-streaming-part-1).

```js
// tagged template: ex: html`<p>hello ${name}</p>`
function* html(templateParts, ...values) {
  const [first, ...rest] = templateParts;
  yield first;
  for (const [templatePart, value] of zip(rest, values)) {
    if (value?.[Symbol.iterator] && typeof value !== 'string') {
      yield* value;
    } else if (value?.then) {
      yield value;
    } else {
      yield escape(String(value));
    }
    yield templatePart;
  }
}

// the rendering function: const stream = _render(html`<p>hello ${name}</p>`)
async function* _render(template) {
  for (const chunk of template) {
    if (typeof chunk === 'string') {
      yield chunk;
    } else if (chunk?.then) {
      yield* _render(await chunk);
    } else if (chunk?.[Symbol.iterator]) {
      yield* _render(chunk);
    } else {
      throw new Error('Unsupported chunk');
    }
  }
}
```

## Diagnostic

If you generate a [flame graph](https://nodejs.org/en/learn/diagnostics/flame-graphs) of the load test, you will get the following figure:

<figure>
    <img src="/posts/html-streaming-part-2/flame-graph.png" alt="flame graph of the load test">
    <figcaption>Flame graph of the load test</figcaption>
</figure>

You can see that the process actually spends very little time in the application code (in blue). Most of the CPU is used in the v8 code, and particularly in the code dealing with 
the task/micro-task queues. 

To be honest, I am not entirely sure how to interpret this graph. But if you track the memory allocation, or simply add a log whenever a chunk is emitted by the ``_render`` async generator, you will see that a lot of Promises are being created.
In practice, rendering the page once generates 87 chunks (and as many Promises) whereas there is only one Promise to wait for in order to fetch all the data (the one that gets the post list).

Let's see our we can reduce this amount and check whether it improves the performances of the template engine.

## Just In Time compilation (JIT)

If you take the basic template: 

```js
const Greet = ({name}) => html`<p>hello ${name}</p>`;
```

The sequence generated will be equivalent to the one created by

```js
function *Greet({name}) {
    yield `<p>`;
    yield escape(String(name));
    yield `</p>`;
}
```

which has three items and eventually as many asynchronous chunks. That is a shame as we could simply generate one item with:

```js
function *Greet({name}) {
    yield `<p>${escape(String(name))}</p>`;
}
```

What if we could create the template ``Greet`` function on the fly ? Actually, yes we **can**. The process of compiling code while the program is already running is called [just-in-time compilation](https://en.wikipedia.org/wiki/Just-in-time_compilation) (JIT).

For a basic function, you can simply use the [Function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/Function) constructor and pass the list of bindings (parameters) together with the actual source code of the function:

```js
const sum = new Function('a', 'b', 'return a + b');

console.log(sum(2, 6));
// Expected output: 8
```

You can do the same with generator functions, although the constructor is not global:

```js
const { constructor: GeneratorFunction } = function* () {};
```

And then compile the template functions:

```js

const templateCache = new WeakMap();

function html(templateParts, ...values) {
    if (!templateCache.has(templateParts)) {
        templateCache.set(templateParts, compile(templateParts, ...values));
    }

    return templateCache.get(templateParts)(...values);
}

const compile = (templateParts, ...values) => {
  const src = buildSource(templateParts, ...values);
  const args = [
    'utils',
    Array.from({ length: values.length }, (_, i) => 'arg' + i),
  ];
  const gen = new GeneratorFunction(...args, src);
  return (...values) => gen({ escape }, ...values);
};
```

We use a ``WeakMap`` to cache the compiled functions to ensure that each template is compiled once and only once.

The compiled functions have as many parameters as there are values to interpolate, and we create a binding named ``arg{index}`` for each of them. 
In addition to these parameters, the first argument will be an object of some utility functions (like ``escape``) so that we can use them in the source code we are about to generate:

```js
const buildSource = (templateParts, ...values) => {
  const [first, ...rest] = templateParts;
  const tuples = zip(rest, values);
  return (
    tuples.reduce((src, [tplPart, value], i) => {
      if (value?.[Symbol.iterator] && typeof value !== 'string') {
        return src + `;yield *arg${i};yield \`${tplPart}\``;
      }

      if (isAsync(value)) {
        return src + `;yield arg${i}; yield \`${tplPart}\``;
      }

      return src + `+utils.escape(String(arg${i})) + \`${tplPart}\``;
    }, `yield \`${first}\``) + ';'
  );
};
```

The source code is a simple concatenation of strings until we hit an iterable or async value. In this case, we complete the concatenation (see the semicolon prefix) and we yield the non-literal value.

This change already improves performance significantly: the server is now able to handle 823(instead of 238) requests per second and the library already outperforms the [ejs template engine](https://ejs.co/).

On the other hand, we now log only 15 chunks.

## Avoid Promise overhead

blah Coroutines






