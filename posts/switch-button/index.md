---
title: Let's build a great switch button
description: Go through on how to build a switch button with web component, by progressively enhancing the built in button
---

<div class="intro"> 
<p class="wide">
<a href="https://www.w3.org/WAI/ARIA/apg/patterns/switch/">Switch buttons</a> (and alike) are very popular UI widgets. Semantically, they should behave like regular buttons, but with a binary state. Let's see how we can progressively enhance the good old button with web components to get the expected behaviour.
</p>
</div>

## Extend built in button

When creating custom elements, you can extend the HTMLElement class and build a brand new element, or you can extend a built-in HTML element. This is a great way to enhance regular HTML elements.
The downside is that Apple has stated that they [won’t implement this part of the spec](https://github.com/WICG/webcomponents/issues/509#issuecomment-230700060). Nevertheless, you can use a [polyfill](https://github.com/WebReflection/custom-elements-builtin) to work around Safari’s issues. 
Another technique is to wrap the base element within a custom element that adds the expected behaviour to the child target.

```js
class UISwitchButton extends HTMLButtonElement {
    connectedCallback() {
        console.log('connected');
    }
}

customElements.define('ui-switch', UISwitchButton, {extends: 'button'});

// in the html <button is=ui-switch></button>
```

That's it, you have defined a new more specific button. If for some reason, Javascript is not available, or you are on Safari with no polyfill, the element will behave as a regular button.

## Component API

You don't necessarily have programmatic access to the HTML element, and it is a better choice to think of its API in terms of attributes. In our case, we only need a ``checked`` attribute to describe its binary state.
You can also add a property (``checked``) that reflects on this attribute, for programmatic access. To communicate a state change, the button can fire a [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent) (e.g. ``switch-toggled``):

```js
class UISwitchButton extends HTMLButtonElement {
    static get observedAttributes() {
        return ["checked"];
    }

    get checked() {
        return this.hasAttribute("checked");
    }

    set checked(value) {
        this.toggleAttribute("checked", Boolean(value));
    }

    constructor() {
        super();
        this.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this.checked = !this.checked;
            this.dispatchEvent(
                new CustomEvent("switch-toggled", {
                    bubbles: true
                })
            );
        });
    }

    connectedCallback() {
        this.setAttribute("role", "switch");
        this.setAttribute("type", "button");
        this.attributeChangedCallback("checked", null, this.checked);

        // updgrade property
        const {checked} = this;
        delete this.checked;
        this.checked = checked;
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (newValue !== oldValue) {
            this.setAttribute("aria-checked", this.checked);
        }
    }
}
```

There are a few important things to note:
* we emit the custom event only when the user interacts with the element (not when the attribute changes): if the attribute (or property) changes, it must be the result of an external component that already knows the new switch state because it wants to force the value. 
* If this event fires, it means we are already in the context of the switch button and we can therefore stop the propagation of the origin click event to narrow the API surface of our component. 
* in the ``connected`` lifecycle callback we need to manually trigger the ``attributeChangedCallback``: the ``checked`` attribute defines the value of ``aria-checked``, but the absence of ``checked`` does not trigger the ``attributeChangedCallback`` when the component is mounted, and the value of ``aria-checked`` will not be set.
* for some edge case we need to _upgrade_ the ``checked`` property. The problem occurs when the element is being created manually while the custom element has not yet been defined:
```js
// we  create the element before it is defined
const el = document.createElement("button", { is: "ui-switch" });
el.setAttribute("is", "ui-switch");
el.checked = true;
document.querySelector("body").append(el);
customElements.define("ui-switch", UISwitchButton, { extends: "button" });
```

In many cases you don't need to be so rigorous, but these are good practices anyway. You can find more good practices on [web.dev](https://web.dev/articles/custom-elements-best-practices).

The good thing about inheriting from the button element is that it directly gets all of the button's default behaviour, notably  in terms of accessibility: form element, focusable, keyboard support for <kbd>Space</kbd> and <kdb>Enter</kbd>, default button styling, etc.  

## styling

You can easily style the switch button with CSS, using the ``[is=ui-switch]`` selector together with [nested CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting/Using_CSS_nesting) to encapsulate its rules and manage the specificity correctly.   
For this example, we use the ``::before`` and ``::after`` pseudo-elements to add ``on`` and ``off`` labels. 



