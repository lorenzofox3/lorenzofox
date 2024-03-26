---
title: Let's build a UI framework - part 2/2
#date: 2024-03-18
description: We will use the various parts around the coroutines we have talked about so far, and we will build a new UI framework from it. 
---

<div class="intro">
    <p class="wide">
<a href="./posts/lets-build-a-framework-part-1" rel="prev">Our framework</a> seems complete and well thought. We went through the process of building <em>on top of</em> solid foundations. This is how most of software is written nowadays, yet 
we suffered a the common bias and added unnecessary complexity. Here we are going to see how removing components can actually be better. 
</div>

## Solving problem by removing layers

We, as human beings, have a tendency to [solve problems by adding layers and complexity](https://www.nature.com/articles/d41586-021-00592-0), even when the most rational approach would be to remove parts of the puzzle. 
That's exactly what we have been doing so far: combining the bits we had to build a higher level of abstraction.  

Even though this was satisfying, we could have reduced the complexity by simply discarding pieces of code we had written prior to the exercise. There is some evidence that our current solution is not optimal:
1. We added some code only to ensure compatibility between interfaces.
2. The ``withController`` higher order function fails its purpose in the sense that it can't have access to property values set after the component is mounted.
3. Although we have a reference to the view model, we still pass the ``getViewModel`` function to the ``withView`` higher order function. There is no particular reason to rely on the injection into the rendering loop since we can pass the view model directly to the generator.
4. ``withController`` uses a proxy, but at this point, we know the shape of the view model.

Let's go back to the beginning by creating the view model based on the ``data`` function:

```js
const withData =
  ({ data }) =>
  (gen) =>
    function* ({ $host, ...rest }) {
      const viewModelValues = data();
      const viewModel = Object.defineProperties(
        {},
        Object.fromEntries(
          Object.keys(viewModelValues).map((key) => [
            key,
            {
              enumerable: true,
              get() {
                return viewModelValues[key];
              },
              set(newValue) {
                viewModelValues[key] = newValue;
                $host.render();
              }
            }
          ])
        )
      );
      yield* gen({
        ...rest,
        $host,
        viewModel
      });
    };
```

It creates the view model based on the return value of the ``data`` function. This time, we use property descriptors instead of a proxy as we know the shape of the expected view model.
Finally, we delegate the control to the next generator while providing the view model.

The next one defines the computed:

```js
const withComputed =
  ({ computed }) =>
  (gen) =>
    function* ({ viewModel, ...rest }) {
      Object.defineProperties(
        viewModel,
        mapValues(
          (method) => ({
            enumerable: true,
            get() {
              return method(viewModel);
            },
          }),
          computed
        )
      );
      yield* gen({
        ...rest,
        viewModel,
      });
    };
```
Not much has changed here.

The last missing part of the view model comes from the properties:

```js
withProps =
  ({ props }) =>
  (gen) =>
    function* ({ $host, viewModel, ...rest }) {
      Object.defineProperties(
        $host,
        Object.fromEntries(
          props.map((propName) => {
            viewModel[propName] = $host[propName];
            return [
              propName,
              {
                enumerable: true,
                get() {
                  return viewModel[propName];
                },
                set(value) {
                  viewModel[propName] = value;
                  $host.render();
                }
              }
            ];
          })
        )
      );

      yield* gen({
        ...rest,
        $host,
        viewModel
      });
    };
```

Once again, no changes here, except that the meta object is directly ``viewModel``

We did not need to override the host ``render`` function because we pass directly a reference to ``viewModel`` to the next generator.

The last step is to build the component from the ``mounted``, the ``controller`` and the ``template`` functions:

```js
import { render as litRender } from 'lit-html';

const component = ({ template, mounted, controller: controllerFn }) =>
  function* ({ $host, viewModel }) {
    // constructing...
    yield;

    const controller = controllerFn({ viewModel });

    // on mount
    mounted({ viewModel, controller });

    while (true) {
      litRender(template({ viewModel, controller }), $host);
      yield;
    }
  };
```

When the component yields, there is no need to inject data as the view model is already passed when the generator is instantiated. 
Another interesting point is that we have completely discarded the ``withController`` higher order function. We can instantiate the controller just after the component is mounted: this means it will see the ``step`` property while being instantiated!

Putting all together:

```js
const defineComponent = ({
  tag,
  props,
  data,
  computed,
  mounted,
  controller,
  template,
}) => {
  const withViewModel = compose([
    withData({ data }),
    withComputed({ computed }),
    withProps({ props }),
  ]);

  define(
    tag,
    withViewModel(
      component({
        template,
        mounted,
        controller,
      })
    )
  );
};
```

This is much simpler than our first solution.

You can find all the code in [this stackblitz](https://stackblitz.com/edit/vitejs-vite-ynjvdt?file=framework%2Findex.js) along with the Vuejs version.

The bundle generated is four to five times lighter than the Vuejs version. The framework itself is not even 200 lines of code (beside lit-html) yet offers most of the Vuejs features (we don't yet have quite the same experience of development).     

## In defence of reinventing the wheel

fasfd

## Conclusion





