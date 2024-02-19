# Coroutines and web components

In the [previous article](./coroutine) we learned what coroutines are and saw some patterns they can help implement.
In this article, we will see how coroutines can be used to model web components in a different way, and why you might like it.

## Rendering loop

Among other things, coroutines have a few properties that we will use in this short essay:
* They are primarily **functions** and can benefit from the whole functional arsenal of Javascript (composition, higher order function, delegation, etc.).
* They are **stateful**.
* You can inject pretty much any kind of data when they are paused. For example, an infinite loop within the body of the routine can be considered as a public API function.
* You cannot, by design, call the ``next`` function concurrently

## Introduction example

Consider the following generator: 

```Javascript
function* someComponent({$host}) {
    while (true) {
        const {content = ''} = yield;
        $host.textContent = content;
    }
}
```

It takes a ``$host`` DOM element and has a rendering loop. You can wrap this generator with a function that produces a ``render`` function:

```Javascript
const createComponent = (generator) => ({$host}) => {
    const gen = generator({$host});
    gen.next(); // we initiate the component by entering inside the rendering loop
    return (state = {}) => gen.next(state);
};

const HelloWorldComponent = createComponent(function* ({$host}) {
    while (true) {
        const {name = ''} = yield;
        $host.textContent = `hello ${name}`;
    }
});

// div is some DOM element
const render = HelloWorldComponent({
    $host: div
});

render({name: 'Laurent'});
render({name: 'Bernadette'});
```

## The power of functions

For now, the rendering loop is a piece of imperative code, but it can use any rendering library you want (react and so on).
The first point above says that functions (and therefore coroutines) are very versatile in Javascript. We could easily go back to a known paradigm if we wanted to. For example, we use [lit-html](./todo) to have a declarative view instead of a bunch of imperative code:

```Javascript
import {render, html} from 'lit-element';

const HelloWorldComponent = createComponent(function* ({$host}) {
    while (true) {
        const {name=''} = yield
        const template = html`<p>hello ${name}</p>`;
        render($host, template);
    }
});
```

you can draw the template into a function: 

```Javascript
import {html} from 'lit-element';

const template = ({name = ''} = {}) => html`<p>hello ${name}</p>`;
```

And compose with a new combinator: 

```Javascript
import {render} from 'lit-element';

const withView = (templateFn) => function* ({$host}) {
    while (true) {
        render($host, templateFn(yield));
    }
};

const HelloWorldComponent = createComponent(withView(template));
```
All right, our component is now a simple function of the state (`` ({name}) => html\`<p>hello ${name}</p>\` ``), and we are on familiar ground.

## Maintaining a state

Having an infinite rendering loop to model our component can actually be more interesting than it seems at first: you can have a state in the closure of that loop. 

If we first modify the higher-level ``createComponent`` function a little to bind the ``render`` function to the host element:

```Javascript
const createComponent = (generator) => ({$host}) => {
    const gen = generator({$host});
    gen.next();
    $host.render = (state = {}) => gen.next(state);
    return $host;
};
```

We can now make the component trigger its own rendering:

```Javascript
const CountClick = createComponent(function *({$host}){
   let clickCount = 0;
   
   $host.addEventListener('click', () => {
       clickCount+=1;
       $host.render();
   });
   
   while(true) {
       $host.textContent = `I have been clicked ${clickCount} time(s)`
       yield;
   }
});
```

In frameworks like React, where you only have access to the equivalent of what is inside the loop, you rely on the framework extension points (the hooks in the case of React) to build this sort of mechanism, and have very little control over rendering scheduling.

## More function combinators to reduce the coupling. 

The component embeds its view and some logic at the same time. Again, we can easily uncouple them so we could reuse either the view or the logic:
It only requires us to take advantage of third properties of coroutine we mentioned in introduction, and a simple delegation mechanism inherent to generators

```Javascript
const countClickable = (view) => function *({$host}) {
    let clickCount = 0;

    $host.addEventListener('click', () => {
        clickCount+=1;
        $host.render({count: clickCount});
    });
    
    yield* view({$host}); 
}
```

This sort of mixin is responsible to maintain the state and to trigger the rendering of any _view_. The rendering is let to the view thanks to **delegation** while the state is passed whenever the view coroutine is paused and requires a new rendering:

```Javascript
const CountClick = createComponent(countClickable(function* ({$host}) {
    while (true) {
        const {count = 0} = yield;
        $host.textContent = `I have been clicked ${count} time(s)`;
    }
}));
```

We will see more combinators and patterns in future articles

## Web components and lifecycle mapping

