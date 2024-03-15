---
title: Controllers on top of coroutine components
#date: 2024-03-04
description: Exploration on how to build controllers on top of coroutine web components
---

We have previously described [a way of modelling custom elements as coroutines (generator functions)](./posts/component-as-infinite-loop). 
We then made sure that they could <a href="./posts/reactive-attributes" rel="prev">be updated efficiently</a>. 
In this post, we will look at different patterns for controlling how (and when) the components are updated: these are what I call **controllers**.   

## Reactive properties

We have already implemented reactive attributes in the core function. This can sometimes feel limiting, and every framework provides a way to pass rich data through a component tree; while triggering the updates whenever that data changes.

Most of the controllers will be higher order functions that take some configuration parameters as input and return a new function that takes a generator and returns a generator. 
Sometimes, if there is no need for configuration, the controller will simply be a function that takes a generator and returns a generator.

```ts
type Controller = (Generator) => Generator | <Options>(options: Options) => (Generator) => Generator;
```

For reactive properties, it is as simple as:

```js
export const withReactiveProps = (props) => (gen) =>
  function* ({ $host, ...rest }) {
    const properties = {} || rest.properties;
    const { render } = $host;

    $host.render = (update = {}) =>
      render({
        ...properties,
        ...update,
      });

    Object.defineProperties(
      $host,
      Object.fromEntries(
        props.map((propName) => {
          properties[propName] = $host[propName];
          return [
            propName,
            {
              enumerable: true,
              get() {
                return properties[propName];
              },
              set(value) {
                properties[propName] = value;
                $host.render();
              },
            },
          ];
        }),
      ),
    );

    yield* gen({ $host, ...rest });
  };
```

The higher order function takes the list of properties to observe as input and creates a meta object ``properties`` to hold the values. This meta object can also be injected if you need to share it between multiple controllers.

The next part is interesting: we override the host's rendering function. The reason for this is that our components can be composed with several controllers, each implementing its own update logic. If another triggers an update, we still want the properties to be injected into the rendering loop, under the ``properties`` namespace here.

Finally, we build the reactivity on the meta object using [property descriptors](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty). This allows us to implement our own setters: whenever the property is set, we request an update.
Note that we don't have to bother with batching the updates, as it is <a href="./posts/reactive-attributes" rel="prev">already done in the core function</a>.

We can then delegate to the input generator using ``yield*``

### Usage

We can now compose our component with this controller and it will react to the property assignment. However, this requires programmatic access (which is usually done by a declarative view engine like [lit-html](https://www.npmjs.com/package/lit-html), etc).

```js
const observeName = withReactiveProps(['name']);

define('hello-world', observeName(function* ({$host}) {
    while (true) {
        const {properties} = yield;
        $host.textContent = `hello ${properties.name ?? 'you'}`;
    }
}));

// ...

helloWorldEl.name = 'Lorenzofox'; //asignement 
```

## Angularjs like controllers

Back in the angularjs days, blah blah
