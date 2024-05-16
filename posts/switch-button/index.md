---
title: Let's build a great switch button
date: 2024-05-14
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
Another technique is to wrap the base element within a custom element that adds the expected behaviour to the child target but it adds unnecessary DOM nodes.

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
* we emit the custom event only when the user interacts with the element (not when the attribute changes): if the attribute (or property) changes, it must be the result of an external component's action that already knows the new switch state as it wants to force the value. 
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

The good thing about inheriting from the button element is that it directly gets all of the button's default behaviour, notably in terms of accessibility: form element, focusable, keyboard support for <kbd>Space</kbd> and <kdb>Enter</kbd>, disabling support, default button styling, etc.  

## styling

You can easily style the switch button with CSS, using the ``[is=ui-switch]`` selector together with [nested CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting/Using_CSS_nesting) to encapsulate its rules and manage the specificity correctly.   
For this example, we use the ``::before`` and ``::after`` pseudo-elements to add ``on`` and ``off`` labels (I have always found confusing not to have the current state) and to draw the *thumb*.

```css
[is="ui-switch"] {
    --control-color: black;
    --height: 1.5em;
    --_inset: 2px;
    
    user-select: none;
    
    aspect-ratio: 2 / 1;
    height: var(--height);
    
    border: var(--_inset) solid currentColor;
    border-radius: calc(var(--height) * 2);
    
    color: var(--control-color);
    background-color: inherit;
    
    position: relative;
    isolation: isolate;
}
```

This gives the default layout of the component. ``user-select`` prevents the label from being selectable, size and theme colours can be controlled with css variables.
We set the position to ``relative`` to be able to position the thumb.

Let's add the thumb and the label in their default state (when the switch is off):

```css
[is=ui-switch] {

    /* ... */
    
    /* thumb */
    &::before {
        --_thumb-size: 1em;
        content: "";
        
        aspect-ratio: 1;
        width: var(--_thumb-size);
        border-radius: 100%;
        
        background: var(--control-color);
        
        inset: 0;
        position: absolute;
        margin-block: auto;
        margin-inline-start: var(--_inset);
        
        transition: margin 0.3s ease-out;
    }

    /* label */
    &::after {
        content: "off";
        position: absolute;
        left: calc(100% + 2 * var(--_inset));
    }
}
```

We give the thumb a perfect circular shape and match the colour to the css variable. For the thumb position we can use a combo 
of ``inset`` and ``margin``. We then overwrite the ``left`` position with an internal ``_inset`` offset. 
We could have just used the css ``inset`` property and changed the ``margin-inline-start`` property to move the thumb around, but we want it to be animated and this is not possible on margin with values like ``auto`` (we need numbers).
This is what the transition is for.

For the label we set the content of the pseudo element ``::after`` to ``off`` and give it the right position.

Finally, when the switch is checked (and therfore has the ``checked`` attribute - or ``aria-checked=true``):

```css
[is=ui-switch] {
    &[checked] {
        &::before {
            margin-inline-start: calc(100% - var(--_thumb-size) - var(--_inset));
        }

        &::after {
            content: "on";
        }
    }
}
```
We only have to change the ``margin-inline-position`` and the transition will be activated.

You can see the result in the following CodePen. I have added a variant to show that the look and feel can easily be changed

<p class="codepen" data-height="300" data-default-tab="html,result" data-slug-hash="yLWBaNd" data-preview="true" data-user="lorenzofox3" style="height: 300px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2px solid; margin: 1em 0; padding: 1em;">
  <span>See the Pen <a href="https://codepen.io/lorenzofox3/pen/yLWBaNd">
  switch-button</a> by RENARD (<a href="https://codepen.io/lorenzofox3">@lorenzofox3</a>)
  on <a href="https://codepen.io">CodePen</a>.</span>
</p>
<script async src="https://cpwebassets.codepen.io/assets/embed/ei.js"></script>

We have left the focus style untouched, so it follows the same design as regular buttons.

## Conclusion

In this short tutorial, we have seen how to enhance a built-in element with web components. Even if Safari does not support it, a polyfill is available, and this technique offers many 
advantages in terms of progressive enhancement, resulting in a lightweight yet very portable component.

