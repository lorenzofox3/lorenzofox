---
title: Coroutines in Javascript
date: 2024-02-24
description: Introduction to coroutines in Javascript, using generator functions 
---

<div class="intro">
<p class="wide">
    A <a href="https://en.wikipedia.org/wiki/Coroutine">coroutine</a> is a function whose execution can be suspended and resumed, possibly passing some data. They happen to be useful for implementing various patterns involving cooperation between different tasks/functions such as asynchronous flows for example.
</p>
</div>

## In javascript

In Javascript you can implement (sort of) coroutines using generator functions. You may have already used generator functions to implement iterators and sequences. 

```js
function *integers(){
    let n = 0;
    while(true){
        yield ++n;
    }
}

const sequence = integers();

console.log(sequence.next().value); // > 1
console.log(sequence.next().value); // > 2
console.log(sequence.next().value); // > 3
console.log(sequence.next().value); // > 4
```

The ``while(true)`` is interesting (and totally fine) here because it testifies that the generator is being evaluated lazily. What actually happens when you call the ``next`` function is that the generator is executed until the next ``yield`` statement. Whatever the result of the expression on the right side of the ``yield`` is, it becomes the ``value`` of the iterator result and the generator function is paused.

What we don't usually know is that you can pass data to the ``next`` function when you resume the execution of the routine, which has the effect of assigning that data to any variable on the "left" side of the statement:

```js
function *generator() {
    while(true){
        const action = yield;
        console.log(action)
    }
}

const routine = generator();
routine.next();
routine.next('increment'); // > 'increment'
routine.next('go-left'); // > 'go-left
```

The first call to ``next`` obviously cannot receive any data as the routine has not been paused yet. 

## Bidirectional example

Although you will often use the generator as either a producer or a sink of data, you can use it in both directions at the same time. Beware, it can be confusing and complex to manage, but it comes in handy to implement some patterns.

See the following "Redux" like state machine:

```js
function* EventLoop({reducer, state}) {
    while (true) {
        const action = yield state; // wow !
        state = reducer(state, action);
    }
}

const createEventLoop = ({reducer, state}) => {
    const eventLoop = EventLoop({reducer, state});
    eventLoop.next();
    return (action) => eventLoop.next(action).value;
};

const createSubscribable = () => {
    const eventName = 'state-changed';
    const eventTarget = new EventTarget();
    
    const notify = () => eventTarget.dispatchEvent(new CustomEvent(eventName));
    const subscribe = (listener) => {
        eventTarget.addEventListener(eventName, listener);
        return () => unsubscribe(listener);
    };
    const unsubscribe = (listener) =>
        eventTarget.removeEventListener(eventName, listener);

    return {
        unsubscribe,
        subscribe,
        notify
    };
};

const createStore = ({reducer, initialState}) => {
    let state = initialState;

    const {notify, ...subscribable} = createSubscribable();

    const dispatch = createEventLoop({reducer, state});

    return {
        ...subscribable,
        getState() {
            return structuredClone(state);
        },
        dispatch(action) {
            state = dispatch(action);
            notify();
        }
    };
};

const store = createStore(
    {
        reducer: (state, action) => {
            switch (action.type) {
                case 'increment':
                    return {
                        ...state,
                        count: state.count + 1,
                    };
                case 'decrement':
                    return {
                        ...state,
                        count: state.count - 1,
                    };
                default:
                    return state;
            }
        },
        initialState: {
            count: 0,
        }
    }
);

store.subscribe(() => console.log(store.getState()));

store.dispatch({
    type: 'increment'
}); // log { count: 1 }
store.dispatch({
    type: 'increment'
}); // log { count: 2 }
store.dispatch({
    type: 'decrement'
}); // log { count: 1 }
```
The interesting part for us is the ``EventLoop`` routine which, when paused, yields the current state and, when resumed, receives the next action to process.
The ``createEventLoop`` function hides the fact that we are using a coroutine to implement the state machine, making it a detail of the implementation. However, thanks to the coroutine, the overall solution remains concise and quite simple. 

## Async flow example

In the previous example we saw how we could model an event loop with a coroutine. In the following example, we will see a different kind of "cooperative multitasking", building an asynchronous workflow with the same semantics as the regular ``async`` function ( with the ``await`` keyword).

```js 
const co = (genFn) => (...args) => {
  const gen = genFn(...args);
    
  // no data to next as the routine has not been paused yet
  return next();

  function next(data) {
    const { value, done } = gen.next(data);

    if (done) {
      return value;
    }

    // non promise value
    if (value?.then === undefined) {
      return next(value);
    }

    // we resume the routine assigning the resolved value to "yield"  
    return value.then(next);
  }

};

const fn = co(function* (arg) {
  let value = yield asyncTask(arg);
  value = yield otherAsyncTask(value);
  return value;
});

fn(42).then(console.log);
```

The idea behind is quite simple: our main asynchronous function is paused whenever it delegates a task to another function. If that function is itself asynchronous, we wait for the pending Promise to resolve and then resume the main routine with the resolved value.
This is very similar to the ``async`` function, except that you replace the built-in ``await`` keyword with ``yield``.

## <span>Going further</span>

It is important to note that a generator has more than just the ``next`` function. ``return`` and ``throw`` can indeed help to create different flows.
In <a href="/posts/component-as-infinite-loop" rel="next">a future article</a>, we will see how we can use a coroutine to model a UI component as an event loop, where each iteration represents a content rendering. 


