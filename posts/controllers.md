---
title: Controllers on top of coroutine components
date: 2024-03-18
description: Exploration on how to build controllers on top of coroutine web components
---

<div class="intro">
    <p class="wide">
We have previously described <a href="./posts/component-as-infinite-loop">a way of modelling custom elements as coroutines</a> (generator functions). 
We then made sure that they could <a href="./posts/reactive-attributes" rel="prev">be updated efficiently</a>. 
In this post, we will look at different patterns for controlling how (and when) the components are updated: these are what I call <em>controllers</em>.
    </p>
</div>

## Definition

Most of the controllers will be higher order functions that take some configuration parameters as input and return a new function that takes a generator and returns a generator.
Sometimes, if there is no need for configuration, the controller will simply be a function that takes a generator and returns a generator.

```ts
type Controller = (Generator) => Generator | <Options>(options: Options) => (Generator) => Generator;
```

## Reactive properties

We have already implemented reactive attributes in the core function. This can sometimes feel limiting, and every framework provides a way to pass rich data through a component tree; while triggering the updates whenever that data changes.

Let's see what a reactive properties controller might look like:

```js
export const withReactiveProps = (props) => (gen) =>
  function* ({ $host, ...rest }) {
    const properties = rest.properties || {};
    const { render } = $host;

    $host.render = (update = {}) =>
      render({
        properties : {
            ...properties
        },
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

We can then delegate to the input generator using ``yield*``. 

Note that the reactive properties is a list of property names. You could go a bit further and also support some sort of configuration object where you specify how to parse the data, whether it should reflect on a given attribute, etc.

### Usage

We can now compose our component with this controller, and it will react to the property assignment. However, this requires programmatic access (which is usually done by a declarative view engine like [lit-html](https://www.npmjs.com/package/lit-html), etc.).

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

## Data model controllers

Back in the days of [Angularjs](https://angularjs.org/), you could attach a _controller_ to parts of a DOM tree. The controller was
responsible for the data model (a variable named ``$scope``) and some behaviour (functions) to mutate the data model. 
The data model was exposed to the view template, and any change to the data model would be reflected in the DOM.
This was nice, because it was easy to test the controller, since it didn't reference the DOM in any way: the logic and the view were correctly separated.

Our version is slightly different:

```js
export const createCountController = ({$scope, $host}) => {
    const step = $host.hasAttribute('step') ? Number($host.getAttribute('step')) : 1;
    $scope.count = 0;
    
    return {
        increment(){
            $scope = $scope + step;
        },
        decrement(){
            $scope = $scope - step;
        }
    }
}
```

We still have the data model (``$scope``) but the behaviour (or controller API) is returned by the factory function. The host is also injected, so you can use properties/attributes to configure the controller.
Any change will cause the bound generator to advance while the ``$scope`` is injected into the rendering loop:

```js
const template = document.createElement('template');
template.innerHTML = `<button>decrement</button><span></span><button>increment</button>`;

const withCountController = withController(createCountController); 

export const component = withCountController(function *({ $host, controller}) {
    $host.replaceChildren(template.content.cloneNode(true));
    const [decrementEl, incrementEl] = $host.querySelectorAll('button');
    const countEl = $host.querySelector('span');
    
    decrementEl.addEventListener('click', controller.decrement);
    incrementEl.addEventListener('click', controller.increment);
    
    while(true) {
        const { $scope } = yield;
        countEl.textContent = $scope.count;
    }
})
```

### Implementation

Let's see how to implement this type of controller and how to bind it to a custom element:

```js
export const withController = (controllerFn) => (gen) =>
  function* (deps) {
    const $scope = deps.$scope || {};
    const { $host } = deps;

    const ctrl = {
      getState() {
        return structuredClone($scope);
      },
      ...controllerFn({
        ...deps,
        // inject a proxy on $scope, so whenever a setter is called the view is refreshed
        $scope: new Proxy($scope, {
          set(obj, prop, value) {
            obj[prop] = value;
            // no need to render if the view is not connected
            if ($host.isConnected) {
              $host.render();
            }
            return true;
          },
        }),
      }),
    };

    // override render fn
    const { render } = $host;
    $host.render = (args = {}) =>
      render({
        ...args,
        $scope: ctrl.getState(),
      });

    // inject controller in the view
    yield* gen({
      ...deps,
      controller: ctrl,
    });
  };
```

This is very similar to the reactive properties controller. 
1. The controller uses the passed meta object ``$scope`` , or it creates it.
2. The actual controller (what will be injected into the generator) is instantiated. A function to clone the current scope is added. Here we don't know the shape of ``$scope`` in advance, so we can't use property descriptors and have to use a proxy instead (with the same logic behind it).
3. It overrides the host's rendering function for the same reasons as above.
4. When the created routine delegates to the underlying generator, it passes the controller.

And that's it!

## Subscription based controller

In some architectural patterns, you have singleton instances in charge of maintaining their entities. They usually expose commands (functions)
and notify anyone interested through events. This is the case of the [redux store we built in the very first article of the series](./posts/coroutine).

```js
import {store} from './path/to/store.js';

export const withReduxStore = (gen) => function* ({$host, ...rest}) {
    
    const {render} = $host;
    
    $host.render = (update = {}) => {
        render({
            ...update,
            state: store.getState()
        })
    };
    
    const unsubscribe = store.subscribe(() => $host.render());
    
    try {
        yield* gen({$host, ...rest, store});
    } finally {
        unsubscribe();
    }
}; 
```

Same logic as before. We just had to unsubscribe from the store in the ``finally`` clause, when the component is unmounted.

## Conclusion

All the controllers are simple and short functions that we can easily bind to a generator. Combining them is as easy as applying function composition and the sky is the limit! 
This gives us a wide variety of solutions when it comes to building the architecture of our next applications.
But with this diversity comes the risk of inconsistency, especially in large teams whose members may have different levels of experience.
In the next article, we'll make choices and let patterns emerge: we'll build our own UI framework (rebuilding the Vuejs Option API)...


