---
title: Let's build a UI framework - part 1/2
date: 2024-03-26
description: We will use the various parts around the coroutines we have talked about so far, and we will build a new UI framework from it. 
---

<div class="intro">
    <p class="wide">
We have now at our disposal a way to <a href="./posts/component-as-infinite-loop/">turn coroutines into web components</a>. We also have a set of higher order functions to <a href="./posts/component-as-infinite-loop">manage how a component updates</a>.
It is great time to put these small bricks together in an expressive yet simple new UI Framework.
    </p>
</div>

## Introduction

The usefulness (and attractiveness) of a framework is definitely more than its codebase: documentation, tools, online
content, popularity in the job market and so on.
But when I think about its codebase and its API, I see the expression of the human organisation that uses it.

As Reginald “Raganwald” Braithwaite explains it
in [this very enlightening post](https://raganwald.com/2016/12/15/what-higher-order-functions-can-teach-us-about-libraries-and-frameworks.html),
when you have a set of small specialised functions, each of them becomes easy to reason about and a versatile tool.
You can then create **relations** between these functions (e.g. with higher order functions) and have a large number of
ways to combine them. In other words: functions give you a lot of _expressiveness_.

However, this expressiveness may conflict with the **perceived complexity**. The complexity has shifted to the number of
connections you can make between these functions. You have to narrow down the set of possibilities you can create by
setting up a **framework**.

In the end, beyond the personal preferences and biases (which are also the expression of a human organisation), this
code:

```js
const productComponent = compose([
    withProps(['product']),
    withController(productController),
    withTemplate
]);
define('my-comp', productComponent(({html}) => {
    return (state) => html`<div>...</div>`;
}));
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

Yet, the former seems to have no limits (other than the rules of function composition) and can be daunting to use, while
the latter offers a more limited set of options, which tends to look easier to manage.

## Framework under construction

Our organisation finds the second API easier to organise the codebase.
Let's now go through the process of building the API we want, by tailoring the various small and specialised functions
that we have built in the previous articles.

### target

In my previous company, the application we were building had a page that consisted of a list of steps. The user had to
go through this list and fill some information to complete each step. We used [Vuejs](https://vuejs.org/) to build our
user interfaces, and a step component looked like this:

template part:

```html
<h1>{{ step.title }}</h1>
<p>Welcome {{ step.user.name }}</p>
<p v-if="isLoading">loading...</p>
<template v-else>
    <p v-if="isDone">Perfect, everything is done</p>
    <form ref="form" v-else autocomplete="off" novalidate @submit.prevent="completeStep">
        <label>
            <span>prop1: </span>
            <input name="prop1" type="text" v-model="stepData.prop1" required>
        </label>
        <label>
            <span>prop2: </span>
            <input name="prop1" type="text" v-model="stepData.prop2" required>
        </label>
        <button :disabled="isSubmitting" type="submit">
            Submit
        </button>
    </form>
</template>
```

script part

```js
import {service} from '../app/step.service.js';

export default {
    name: 'Step',
    props: {
        step: undefined
    },
    data() {
        return {
            status: 'todo',
            isLoading: true,
            isSubmitting: false,
            stepData: {}
        };
    },
    computed: {
        isDone() {
            return this.status === 'done';
        },
        stepId() {
            return this.step?.stepId;
        },
        userId() {
            return this.step?.user?.userId;
        }
    },
    mounted() {
        this.fetchState();
    },
    methods: {
        async fetchState() {
            try {
                this.isLoading = true;
                const {status, stepData} = await service.fetchState({stepId: this.stepId, userId: this.userId});
                this.status = status;
                this.stepData = stepData;
            } finally {
                this.isLoading = false;
            }
        },
        async completeStep() {

            if (!this.$refs.form.reportValidity()) {
                return;
            }

            try {
                this.isSubmitting = true;
                await service.completeStep({stepId: this.stepId, userId: this.userId, stepData: this.stepData});
                this.status = 'done';
            } finally {
                this.isSubmitting = false;
            }
        }
    }
};
```

If you look at this snippet, you can easily understand that the component is initially in loading mode while fetching
the data (when it is mounted).
It fetches the data through a ``service`` which needs some parameters passed by a parent component thanks to
the ``step`` prop.

``step`` props looks like this:

```js
const step = {
    stepId: 'my-step',
    title: 'A given step',
    user: {
        userId: 'my-user-id',
        name: 'Lorenzofox'
    }
};
```

where some part of the data is used in the template, and some other part is used as parameters when calling the service.

When the fetch is complete, the step is either ``done``, and there is nothing left to do; or it is still ``todo``, in
which case the user must fill out and submit the form.

``data`` refers to a set of internal reactive properties that the template and other parts of the component can use (
under ``this``), while ``computed`` are read-only properties derived from ``data`` (or ``props``).
``methods`` contains the logic and is what I call the `controller`. ``props``, ``data`` and ``computed`` are what I call
the view model.

### mental model conversion

How could we build this component within the coroutine model ?

We can first have a controller as defined in [the previous article](./posts/controllers):

```js
export const createStepController = ({$scope, $host}) => {
    $scope.status = 'todo';
    $scope.isDone = false;
    $scope.isLoading = true;
    $scope.isSubmitting = false;
    $scope.stepData = {};

    return {
        async fetchState() {
            const {stepId, user: {userId}} = $host.step;
            try {
                $scope.isLoading = true;
                const {status, stepData} = await service.fetchState({stepId, userId});
                $scope.status = status;
                $scope.stepData = stepData;
                $scope.isDone = status === 'done';
            } finally {
                $scope.isLoading = false;
            }
        },
        async completeStep({stepData}) {
            const {stepId, user: {userId}} = $host.step;
            try {
                $scope.isSubmitting = true;
                await service.completeStep({stepId, userId, stepData});
                $scope.stepData = stepData;
                $scope.status = 'done';
                $scope.isDone = false;
            } finally {
                $scope.isSubmitting = false;
            }
        }
    };
};
```

What the controller returns is quite similar to the ``methods`` section of the Vuejs component while ``$scope`` would be
the equivalent of ``data`` and ``computed``.
However, we have not yet the notion of ``computed`` and we have to remember to compute ``isDone`` whenever ``status``
changes.

The ``props`` are accessible on the ``$host`` and can easily be defined using the ``withProps`` controller.
However, you should have noticed that we have to delay the calls to the getter on ``$host`` in each method: this is
because, if you remember,
the controller is instantiated when the component is being constructed, while the property is set after it is mounted.
We will assume that it is not a problem for now.

Now let's build the component itself with a generator function:

```js
import {render, html} from 'lit-html';

export function *Step({$host, controller}) {

    // constructed
    let state = yield;

    controller.fetchState();

    while (true) {
        const templateEntry = template({...getViewModel(state), onSubmit});
        render(templateEntry, $root);
        state = yield;
    }

    function onSubmit(ev) {
        ev.preventDefault();
        const {target: form} = ev;
        if (!form.reportValidity()) {
            return;
        }

        controller.completeStep({
            userId,
            stepId,
            stepData: Object.fromEntries(new FormData(form).entries())
        });
    }
};

const getViewModel = ({properties, $scope}) => ({
    ...properties,
    ...$scope
});

const template = ({isSubmitting, isLoading, isDone, stepData, step, onSubmit}) => {
    return html`...`;
};
```

We first wait for the component to mount before calling the controller to fetch data (like the ``mounted`` hook in the vue example).
All the injected namespaces are merged into a single ``viewModel`` and used as input to a ``template`` function, which is nothing more than the template part of the vue example, but with lit-html.

We can now glue all the pieces together:

```js
const stepComponent = compose([withController(createStepController), withProps(['step'])]);
define('app-step', stepComponent(Step));

// and to boot the app

import {html, render} from 'lit-html';

const step = {
    stepId: 'my-step',
    title: 'A given step',
    user: {
        userId: 'my-user-id',
        name: 'Lorenzofox'
    }
};

render(html`
    <app-step debug .step=${step}></app-step>`, document.getElementById('app'));
```

### Abstract away the implementation details

The next step is to abstract away the coroutine-based mental model and expose a single function that defines the components using the targeted API: 

```js
defineComponent({
    tag: 'my-comp',
    // data
    data: () => ({
        prop1: 'value1'
    }),
    // computed
    computed:{
        derived(viewModel){
            viewModel.foo + 42
        }
    },
    // lifecycles
    mounted({viewModel, controller}) {
        controller.fetchData();
    },
    controller({viewModel}){
        return {
            async fetchData(){
                //
            }
        }
    },
    template({viewModel, controller}){
        return html`...`
    }
})
```

This is basically the same component definition as the vue API, except that we have functions of ``viewModel`` and ``controller`` instead of relying on the ``this`` component instance. Again, this is just part of our organisation preferences.

We can first transform the ``Step`` generator, so it follows an abstract structure: 

```js
import {render} from 'lit-html';

export const withView = ({mounted, template, getViewModel}) => function*({$host, controller}){
    let viewModel = getViewModel(yield);
    mounted({viewModel, controller});
    while(true){
        render(template({viewModel, controller}), $host);
        viewModel = getViewModel(yield);
    }
};
```

We can now write the ``Step`` function with this abstract ``withView`` function

```js
export const Step = withView({
    mounted({controller}){
        controller.fetchState();
    },
    template({controller, viewModel}) {
        const {isLoading /* ... */} = viewModel;
        return html`...`;
        
        function onSubmit(ev) {
            // ...
            controller.completeStep(/* .. */);
        }
    },
    getViewModel({properties, $scope}) {
        return {
            ...properties,
            ...$scope
        }
    }
});
```

It would also be better to normalise the controller itself: 

```js
import {service} from './step.service.js';

export const controller = ({viewModel}) => {
    return {
        async fetchState() {
            const {stepId, user: {userId}} = viewModel.step;
            try {
                viewModel.isLoading = true;
                const {status, stepData} = await service.fetchState({stepId, userId});
                viewModel.status = status;
                viewModel.stepData = stepData;
            } finally {
                viewModel.isLoading = false;
            }
        },
        async completeStep({stepData}) {
            const {stepId, user: {userId}} = viewModel.step;
            try {
                viewModel.isSubmitting = true;
                await service.completeStep({stepId, userId, stepData});
                viewModel.status = 'done';
            } finally {
                viewModel.isSubmitting = false;
            }
        }
    };
};
```

It is now a function of ``viewModel`` (no more ``$scope``). For the same reason as before, we still have to read ``step`` (which comes from the properties) on the view model as late as possible.
For the computed (``isDone``), we assume it is handled somewhere else, in the ``defineComponent`` function. 

Finally, ``defineComponent`` will put all the parts together.  

```js
export const defineComponent =({ 
    tag,
    props,
    data,
    computed,
    mounted,
    controller,
    template
}) => {
    const viewModel = buildViewModel({computed, data});
    const pipeline = compose([
        withInjectables({
            properties: viewModel, 
            $scope: viewModel,
            viewModel
        }),
        withProps(props),
        withController(({$scope}) => controller({viewModel: $scope}))
    ]);
    define(tag, pipeline(withView({mounted, template, getViewModel: () => viewModel})));
};

const buildViewModel = ({computed, data}) => {
    const viewModel = data();
    return Object.defineProperties(viewModel, mapValues((computedFn) => ({
      enumarable: true,
      get(){
          return computedFn(viewModel);
      }  
    }), computed));
};

const withInjectables = (injectables) => (gen) => function *(args) {
    yield* gen({
        ...injectables,
        ...args
    });
};
```

If you remember: ``withController`` and ``withProps`` can have their meta object injected. We first build this meta object within ``buildViewModel`` using the provided ``data`` function. We then add the ``computed`` on this meta object thanks to property descriptors: 
these properties are simple getters(readonly), functions of the view model.

We use yet another higher order function ``withInjectables`` to ensure that the view model is injected into the other controllers under the correct name parameter. 

We need to adjust the parameter passed to the controller function of ``withController`` because it has injected a variable named ``$scope``, whereas we have normalised the controller function signature to ``viewModel``.  
We could have directly used the ``viewModel`` variable from the closure but [``withController`` passes a Proxy](./posts/controllers) to add reactivity: hence the remapping of this parameter.

Finally, we can use our newly created ``withView`` function, passing a ``getViewModel`` function which always returns the reference of the view model.

Great! 

## Conclusion

Thanks to a small set of specialised functions, we were able to create a completely different API based on the component representation our organisation is familiar with.   
The process was actually very simple, and again shows the full power of functions and composition. Generators have disappeared and are now an implementation detail, but they have proved their versatility in building higher level APIs. 

We can actually <a href="./posts/lets-build-a-framework-part-2" rel="next">do way better</a>.





