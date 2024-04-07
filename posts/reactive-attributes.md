---
title: Batch component updates with micro tasks 
date: 2024-03-11
description: Improvement on the coroutine to web component conversion function, adding reactive attributes  
---

<div class="intro">
<p class="wide">
In the <a href="/posts/component-as-infinite-loop" rel="prev">previous article</a>, we finished by providing a function to convert a generator into a custom element.
In this post we will iterate by adding reactive attributes to our component definition, and ensuring that updates are performed in batch, using the hidden gem <a href="https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide">queueMicrotask</a>.
</p>
</div>

## On component interfaces

Custom elements let you declare observable attributes (thus limited to string values) and react to any change. This seems limiting compared to the rich data properties you have with frameworks like Vuejs, React and so on.
However, You have to keep in mind that, with these frameworks, the component models live in memory within yet another abstraction on top of the Document Object Model that the browser deals with. Custom elements, on the other hand, can be serialised (i.e. expressed as a plain HTML string) just like any regular built-in element.
This implies, for example, that you don't need any specific tooling/runtime to add these components as part of an HTML fragment on the server side.

Anyway, we will see later how to define rich reactive properties. But again, these properties would require a programmatic access to the related DOM node.

## Basic implementation

Have a look at the following code:

```js
const componentify = (gen, {observedAttributes = []} = {}) => class extends HTMLElement {
    #loop;

    static get observedAttributes(){
        return [...observedAttributes]
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue && this.isConnected) {
            this.render();
        }
    }

    constructor() {
        super();
        this.#loop = gen.bind(this)({
            $host: this
        });
        this.render = this.render.bind(this);
        this.#loop.next();
    }

    connectedCallback() {
        this.render();
    }

    disconnectedCallback() {
        this.#loop.return();
    }

    render(state = {}) {
        this.#loop.next({
            attributes: getAttributes(this),
            ...state
        });
    }

}

const getAttributes = (el) =>
    Object.fromEntries(
        el.getAttributeNames().map((name) => [name, el.getAttribute(name)]),
    );

export const define = (tag, gen, options) => {
    customElements.define(tag, componentify(gen, options), options );
};
```

In comparison with the previous article, we have extracted the function that turns a generator into a class. We also now inject the attributes into the loop (``getAttributes``). This is not mandatory, as the host is injected into the generator anyway, but I find it more convenient to have this data as a POJO.

More interesting for us: the ``define`` (and ``componentify``) takes a third optional argument, which allows us to declare a list of attributes to watch. The static ``observedAttributes`` getter is the way to declare to the engine which attributes we want to observe. Whenever one of the observed attributes changes, the ``attributeChangedCallback`` is called. We handle this by calling the ``render`` function, unless the value has not actually changed or the component is not yet connected (because we will render it anyway when it is mounted).

We are now able to define components with reactive attributes:

```js
const template = document.createElement('template');
template.innerHTML = `
        <span>_</span> +
        <span>_</span> =
        <output>?</output>
`;

define('basic-sum', function* ({$host}) {
    $host.replaceChildren(template.content.cloneNode(true));
    const [aEl, bEl] = Array.from($host.querySelectorAll('span'));
    const output = $host.querySelector('output');

    while (true) {
        const {attributes} = yield;
        const {a, b} = attributes;

        aEl.textContent = Number(a);
        bEl.textContent = Number(b);
        output.textContent = Number(a) + Number(b);
    }
}, {
    observedAttributes: ['a', 'b']
});

// <basic-sum a="42" b="58"></basic-sum>
```

And if you change either attribute ``a`` or attribute ``b``, the calculation result will be updated!

## Many updates at the same time

What happens if you update both attributes in the same call stack ? (You can first add a ``console.log`` statement inside the ``render`` function)

```js
document.querySelector('basic-sum').addEventListener('click', ({currentTarget}) => {
    currentTarget.setAttribute('a', Math.round(Math.random() * 100));
    currentTarget.setAttribute('b', Math.round(Math.random() * 100));
});
```

The ``render`` function is called **twice** (once for each attribute). This is not necessarily a big deal, especially for attributes and simple components like the one we just wrote.  
But, as we saw in the previous article, you can split the update logic into a stack of independent controllers, thanks to higher order functions. Imagine the fictive controller below where every change on the ``$scope`` variable triggers an update:

```js
const createBookListController = ({ $scope }) => {
    // initial state
    $scope.isLoading = false;
    $scope.books = [];
    $scope.error = undefined;

    return {
        async search({ query }) {
            try {
                $scope.isLoading = true;
                $scope.books = [];
                $scope.error = undefined;
                $scope.books= await searchService.search({ query });
            } catch (err) {
                $scope.error = err;
            } finally {
                $scope.isLoading = false;
            }
        },
    };
};
```

The initialisation would already trigger three updates. Then, when you have finished loading the books, you render the whole book list twice: once when you effectively assign ``books`` but also another time when you change the loading status.
To solve this issue, you could reach for more fine-grained construction like [signals](https://dev.to/this-is-learning/the-evolution-of-signals-in-javascript-8ob) or observables (etc.), but it comes with all the ceremony they require. Would it not be easier to batch all the changes that occur in the same call stack ?

## Tasks and Micro tasks

[The MDN documentation](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide) will explain better than I can do what **microtasks** are and how they differ from **tasks**. But in a nutshell: a microtask is a piece of code that is executed when there is nothing left to execute within a task and before the control is given back to the Javascript Event Loop. A (synchronous) call stack is executed inside the same task, so deferring the rendering code at the end of the call stack would simply mean executing that code inside a micro task. Here comes [queueMicrotask](https://developer.mozilla.org/en-US/docs/Web/API/queueMicrotask):     

```js
const componentify = (gen, {observedAttributes = []} = {}) => class extends HTMLElement {
    // ...
    #updateStack = [];

    render(state = {}) {
        const currentPendingUpdateCount = this.#updateStack.length;
        this.#updateStack.push(state);
        if (!currentPendingUpdateCount) {
            window.queueMicrotask(() => {
                console.log('rendering');
                const arg = {
                    attributes: getAttributes(this),
                    ...Object.assign(...this.#updateStack),
                };
                this.#loop.next(arg);
                this.#updateStack.length = 0;
            });
        }
    }

    disconnectedCallback() {
        window.queueMicrotask(() => {
            if (this.isConnected === false) {
                this.#loop.return();
            }
        });
    }
    
};
```

We add an internal ``updateStack``. Now whenever ``render`` (should we rename it for ``update`` ? ) is called, we add the requested update to the stack. If there is not yet any pending update, we enqueue the call to the internal loop (the actual rendering) in the micro task queue. 
That's it: the updates occurring within the same context (same call stack) are batched together.

Note that some updates may conflict with each other. The resolution algorithm is quite simple: the last call takes precedence (following how ``Object.assign`` works).

For another reason, we also run the component teardown code inside a microtask. Attentive readers will have noticed that when a component is unmounted it becomes _dead_ as we have exited the rendering loop. This is fine, if you are not trying to reuse the corresponding DOM node later. But sometimes, you just want to move the node around in the DOM tree (for example, when rearranging list items). This disconnects and reconnects the node in the same call stack. By using a microtask, you prevent the component from leaving its rendering loop.  

## Caveats and points of attention

You can technically enqueue a microtask from a microtask, never giving control back to the Javascript Event Loop. This could lead to the locking of the main thread if you are careless (calling a render inside the rendering loop).
It also means that concurrent calls to ``render`` will no longer throw an error as they will be batched together. However, the order is still guaranteed.

Another side effect is that if you want to assess the result of an update, you will have to do it on the next task of the Event Loop. This is not a problem but can cause confusion in test files: 

```js
import {test} from 'zora';
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('basic-sum computes the result when attributes are updated', async ({eq}) => {
    const el = document.createElement('basic-sum');
    el.setAttribute('a', 42);
    el.setAttribute('b', 58);

    debug.appendChild(el);

    const output = el.querySelector('output');

    eq(output.textContent, '100') // will fail;

    await nextTick();

    eq(output.textContent, '100') // will pass;

    el.setAttribute('a', 2);

    eq(output.textContent, '60') // will fail;

    await nextTick();

    eq(output.textContent, '60') // will pass;
});
```

## Conclusion

We have improved our component definition by adding reactivity through attributes. We used microtasks to optimise and batch the updates that occur in the same context. This is a powerful (and little known) tool, although it has some drawbacks.
The next step will be to see how we can build a set of controllers: higher order functions that are dedicated to encapsulating the state and update logic. 
