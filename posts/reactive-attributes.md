---
title: Reactive attributes and micro tasks 
#date: 2024-03-04
description: Improvement on the coroutine to web component conversion function, adding reactive attributes  
---

In the [previous article](./posts/component-as-infinite-loop), we finished by providing a function to convert a coroutine into a custom element. 
In this post we will iterate by adding _optimised_ reactive attributes to our component definition, using the hidden gem [queueMicrotask](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide).

## On component interfaces

Custom elements let you declare observable attributes (thus limited to string values) and react to any change. This seems limiting compared to the rich data properties you have with frameworks like Vuejs, React and so on.
However, You have to keep in mind that, with these frameworks, the component models live in memory within yet another abstraction on top of the Document Object Model that the browser deals with. Custom elements can be serialised (i.e. expressed as an HTML string) just like any regular built-in element.
This implies, for example, that you don't need any specific tooling/runtime other than an HTML template engine to create these components as part of an HTML fragment on the server side.

Anyway, we will see later how to define rich reactive properties. But again, these properties would require a programmatic access to the related DOM node rather than a simple declarative approach.
