---
title: Template engine with streaming capability - part 1/2
date: 2024-04-04
description: Let's build an HTML template engine with streaming capabilities 
---

<div class="intro"> 
<p class="wide">
Browsers can render HTML on the fly as chunks of text arrive. This is called HTML streaming, and it is not new. 
I recently read Chris Haynes' article explaining how you can <a href="https://lamplightdev.com/blog/2024/01/10/streaming-html-out-of-order-without-javascript/">stream HTML out of order (OOO) without JavaScript</a>. 
This opens up a lot of possibilities and new patterns at low cost. However, I have not found much in the way of simple yet efficient template engine libraries with streaming support. Let's build one!
</p>
</div>

## Streaming HTML

Conceptually, streaming HTML is simple: it consists in building a sequence of text strings. 
While some parts of the sequences are static, others are dynamic, derived from contextual data. 
There is a helpful Javascript built-in construct for implementing such sequences: [tagged templates](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) 

Consider the following example:

```js
const Greet = ({ name }) => html`<p>hello ${name}</p>`;

Greet({name: 'Lorenzofx'});
```

We can build up the following sequence:

```js
['<p>hello ', 'Lorenzofox', '</p>'];
```

The first and the last item are static whereas the second is a dynamic one. 

## Tagged templates

To implement the ``html`` tagged template (or any tagged template), you have to define a function whose signature is:

```js
function html(templateParts, ...values) {
    // code
}
```

``templatesParts`` is an array of the static strings and ``values`` is the list of variables to interpolate. ``templateParts`` size is **always** equal to the size of ``values`` list, plus one. 
What ``html`` does or returns is then left to your imagination. 

## html function

### Specifications

We want our ``html`` function to generate a sequence with the following rules for the interpolated values:
* Literals are escaped by default, to avoid [XSS attacks](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#output-encoding).
* Templates can interpolate other templates, to give a great ability of composition.
* Templates can interpolate arrays. Arrays can be of strings, templates or other arrays. Strings in an array are not escaped.
* Templates can interpolate Promises. The resolved value can be anything like an array can contain.

The [actual library](https://github.com/lorenzofox3/tpl-stream/) has actually more extensive specifications, but they are not relevant to this article.

### Implementation

To build a sequence we will use a [generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*)(you probably know that I am a big fan of generators). We will do something close to [TDD(Test Driven Development)](https://en.wikipedia.org/wiki/Test-driven_development) to see the evolution of our implementation.

#### Interpolate literals

```js
import {test} from 'zora';

const stringify = iterable => [...iterable].join('');

test('literals are intepolated as strings', ({eq}) => {
    eq(stringify(html`<p>${'hello'}</p>`), '<p>hello</p>');
    eq(stringify(html`<p>${42}</p>`), '<p>42</p>');
    eq(stringify(html`<p aria-hidden="${true}">blah</p>`), '<p aria-hidden="true">blah</p>');
    eq(stringify(html`<p>${undefined}</p>`), '<p>undefined</p>');
});

function *html(templateParts, ...values){
    const [first, ...rest] = templateParts;
    yield first;
    for (const [templatePart, value] of zip(rest, values)){
        yield String(value);
        yield templatePart;
    }
}
```

First, we take out the first template part, so that we know that both arrays ``rest`` and ``values`` have exactly the same number of items.
We can then _zip_ them together to form pairs.

``zip`` is a common function whose implementation looks like:

```js
const zip = (a, b) => a.map((item, i) => [item, b[i]]);
```

We can then iterate over the pairs, yield each element one by one and ensure that the interpolated value is a string.

#### Escape literals

```js
test('Strings are HTML escpaed when interpolated', ({eq}) => {
    eq(stringify(
        html`<p>${'<script>window.alert("pwned")</script>'}</p>`), 
        '<p>&lt;script&gt;window.alert(&quot;pwned&quot;)&lt;/script&gt;</p>');
    eq(stringify(
        html`<p attr="${"/><script></script>"}"></p>`), 
        '<p attr="/&gt;&lt;script&gt;&lt;/script&gt;"></p>');
});

const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

const htmlEntities = /[&<>"']/g;
const escape = (value) => {
    if (/[&<>"']/.test(value)) {
        return value.replace(htmlEntities, (char) => escapeMap[char]);
    }

    return value;
};

function *html(templateParts, ...values){
    const [first, ...rest] = templateParts;
    yield first;
    for (const [templatePart, value] of zip(rest, values)){
        yield escape(String(value));
        yield templatePart;
    }
}
```

The ``escape`` function encodes a set of specific characters into their entity equivalent to make sure that a malicious string cannot be injected.

#### Compose templates

```js
test(`templates can be composed together`, ({ eq }) => {
    eq(
        stringify(
        html`<p>foo ${html`<span>${42}</span>`}</p>`),
        '<p>foo <span>42</span></p>',
    );
});

function* html(templateParts, ...values) {
    const [first, ...rest] = templateParts;
    yield first;
    for (const [templatePart, value] of zip(rest, values)) {
        if (value?.[Symbol.iterator] && typeof value !== 'string') {
            yield* value;
        } else {
            yield escape(String(value));
        }
        yield templatePart;
    }
}
```
The main difference is that we now check the _type_ of the interpolated value. Generators are iterables, so that they implement ``[Symbol.iterator]``. This means that a template will check this condition. Strings are also iterables, but we don't want to 
iterate over every character of the string: hence the second check. If both checks pass, we simply delegate the control to the iterable ``value`` using ``yield*`` operator.

This has the side effect of implementing the rules on arrays as well. At this point, an array can contain nested arrays, templates, or types that we can't technically support. But we won't go any deeper, because recursivity can be a bit tricky to implement with tagged templates. 
We leave that job to the upcoming ``render`` function

#### Thenable (Promises)

```js
test(`html yield Promise like as they are`, ({ eq }) => {
    const promise = Promise.resolve(42);
    const thenable = {
        then() {
            return 42;
        }
    };
    eq(
        [...html`<div>${promise}</div><p>${thenable}</p>`],
        ['<div>', promise, '</div><p>', thenable, '</p>'],
    );
});

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
```

Anything that can be awaited implement ``then``. If this check passes we just yield the "Promise like" value to the ``render`` function:
there is nothing we can do at this point, and the strategy for handling asynchronous structures may vary form renderer to renderer.
One renderer could choose to pause the stream and wait for the Promise to resolve. Other could insert a placeholder and, later when the Promise has resolved, append some code to replace that placeholder with the actual value (this technique can be used for out of order streaming). 

## render function

Now that we have a sequence that has already been partially converted into bits of strings, we can convert that sequence into a proper stream. This will also be the time
to handle late-arriving values (such as what promises resolve to), and eventually reject unsupported chunks.

There is a one-to-one relationship between a stream and an async generator. Again, we will use the latter to take advantage of recursivity, delegation, etc.

```js
async function* _render(template) {
    for (const chunk of template) {
        if (typeof chunk === 'string') {
            yield chunk;
        } else if (chunk?.then) {
            yield* _render(await chunk);
        } else if (chunk?.[Symbol.iterator]) {
            yield* _render(chunk);
        }   else {
            throw new Error('Unsupported chunk');
        }
    }
}

export function render(template) {
    return ReadableStream.from(_render(template));
}

export async function renderAsString(template) {
    const buffer = [];
    for await (const chunk of render(template)){
        buffer.push(chunk);
    }
    
    return buffer.join('');
}
```

Let's focus on the ``_render`` generator (the other functions will just convert it into other data structures). It takes an iterable (like a template!) as a parameter and iterates over its sequence.
By this point, all the literals should already have been converted to strings, and that is our first check. 

If it hits a Promise, we are now in an asynchronous context and can wait for it to resolve. We can then recursively delegate to the generator.

In the third check, we convert nested arrays or templates(and arrays) that could have been resolved by a Promise. Finally, we throw an error for any other chunk type: this prevents,
for example, to have arrays with number elements or any other invalid literal elements.

All in all, the code is concise and fairly easy to follow, but...

## Performance evaluation

To evaluate the performance of our library, we will use a _real-world_ application: we will build a blog like the one you are reading at the moment, using [fastify](https://fastify.dev/) for the backend, with different template engines.
[pug](https://pugjs.org), the library I would have used by default; and [ejs](https://ejs.co/), which seems to be quite popular with 13M download every week, will be our baselines.

<figure>
<img src="https://github.com/lorenzofox3/tpl-stream/assets/2402022/cc021ce7-5405-4690-8d9b-43904fb05c45" alt="screen shot of the blog application" />
<figcaption>screenshot of the test application</figcaption>
</figure>

### Code base with our library

The interesting thing about our library is that we can combine templates together using all the scripting abilities of Javascript.

```js
// layout.js
import {html} from 'tpl-stream'
import {Navigation} from './navigation.js'

export const Page = ({ title, content }) => html`
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <link href="/public/main.css" rel="stylesheet" type="text/css" />
      <link rel="icon" href="./public/favicon.ico" />
      <title>${title}</title>
    </head>
    <body>
      <header id="main-header">
        <img id="logo" alt="blog logo" src="/public/logo.webp" />
        <h1>${title}</h1>
        ${Navigation({ currentPage: '/blog' })}
      </header>
      <main>
        <p>
          Hi! I am Laurent and this is my dev blog. This is where I collect what
          I learn, what I experiment and what I find interesting.
        </p>
        ${content}
      </main>
      <footer><p>© Laurent RENARD. All Rights Reserved.</p></footer>
    </body>
  </html>
`;
```

where ``Navigation`` is 

```js
// navigation.js
import {html} from 'tpl-stream'


const links = [
    { href: '/', name: 'Home' },
    { href: '/blog', name: 'Blog' },
    { href: '/about', name: 'About' },
];

const NavigationLink = ({ name, href, ...rest }) =>
    html`<li><a href="${href}" ${rest}}>${name}</a></li>`;

const Navigation = ({ currentPage = '/' }) =>
    html`<nav>
    <ul>
      ${links.map((linkDef) =>
        NavigationLink({
            ...linkDef,
            ['aria-current']: currentPage === linkDef.href ? 'page' : false,
        }),
    )}
    </ul>
  </nav>`;
```

You will have noticed in ``NavigationLink`` that this version of ``html`` can interpolate objects: each key-value pair becomes an attribute if the value is not equal to ``false``
(we left this feature out of this article to keep it more concise).

The content that will be rendered in the layout comes from:

```js
import { html } from 'tpl-stream';

const BlogPost = ({
  title,
  author,
  description,
  publicationDate,
  permalink,
}) => html`
  <article class="post-preview">
    <h3>${title}</h3>
    <p class="meta">
      Published by ${author} on <time>${formatDate(publicationDate)}</time>
    </p>
    <p>${description}</p>
    <a rel="bookmark" href="${permalink}">Read full article</a>
  </article>
`;

export const Blog = ({ posts }) =>
  html`<section>
    <h2>Latest articles</h2>
    ${posts.map(BlogPost)}
  </section>`;
```

So that the request handler looks like:

```js
import {render} from 'tpl-stream';
//... 

return render(
    Page({
        title: 'Blog',
        content: getPosts().then((posts) => Blog({ posts })),
    }),
);

//...
```

The posts are loaded with the code below, to fake a database latency and make it more realistic:

```js
const LATENCY = env.DB_LATENCY || 10;

export async function getPosts() {
  const latency = Math.round(Math.random() * LATENCY); // between 0 and 10ms of latency
  await setTimeout(latency);
  return [...postList];
}
```

### Load test

We use [autocannon](https://github.com/mcollina/autocannon) to perform the load test and see how many requests per second the server can handle.
We get the following results (median requests per second): 

| tpl-stream | pug | ejs |
|------------|-----|-----|
| 238        | 1632| 670 |

This is pretty bad and gets worst the more complicated the page is. Nothing to worry about, we will fix the performance issues in the next article.

## Conclusion

In this article we have learned what HTML streaming is. We have built a templating engine that supports streaming, with a straightforward implementation (less than 100 SLOC). 
The API gives us a lot of flexibility, and it is fairly easy and pleasant to work with. Unfortunately, our naive implementation performs poorly compared to the baselines made with popular libraries from the ecosystem. 
In the next post we will fix these performance issues, and hopefully learn a few things along the way.



