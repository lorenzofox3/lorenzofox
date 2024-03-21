---
title: Let's build a UI framework
#date: 2024-03-18
description: We will use the various parts around the coroutines we have talked about so far, and we will build a new UI framework from it. 
---

<div class="intro">
    <p class="wide">
We have now at our disposal a way to <a href="./posts/component-as-infinite-loop/">turn coroutines into web components</a>. We also have a set of higher order functions to <a href="./posts/component-as-infinite-loop">manage how a component updates</a>.
It is great time to put these small bricks together in an expressive yet simple new UI Framework.
    </p>
</div>

## Introduction

The usefulness (and attractiveness) of a framework is definitely more than its codebase: documentation, tools, online content, popularity in the job market and so on.
But when I think about its codebase and its API, I see the expression of the human organisation that uses it.

As Reginald “Raganwald” Braithwaite explains it in [this very enlightening post](https://raganwald.com/2016/12/15/what-higher-order-functions-can-teach-us-about-libraries-and-frameworks.html), when you have a set of small specialised functions, each of them becomes easy to reason about and a versatile tool. 
You can then create **relations** between these functions (e.g. with higher order functions) and have a large number of ways to combine them. In other words: functions give you a lot of _expressiveness_.

However, this expressiveness may conflict with the **perceived complexity**. The complexity has shifted to the number of connections you can make between these functions. You have to narrow down the set of possibilities you can create by setting up a **framework**.

In the end, beyond the personal preferences and biases (which are the expression of a human organisation), this code:

```js
const productComponent = compose([withProps(['product']), withController(productController), withView]);
define('my-comp', productComponent(({html}) => (state) => html`...`));
```

is not necessarily more complex than: 

```js
// vuejs option API like
export default ({
    name: 'my-comp',
    props: ['product'],
    methods: productController,
    template: `<div>...</div>`
});
```
Yet, the former seems to have no limits (other than the rules of function composition) and can be daunting, while the latter offers a more limited set of options, which tends to look easier to manage.
By the way, the function ``productComponent`` is already some sort of framework.

## Framework under construction

Let's now go through the process of building the API we want, by tailoring the various small, specialised function we have built in the previous articles.

### target

In my previous company, blah blah



