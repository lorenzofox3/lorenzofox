---
title: Domain oriented plugin architecture
date: 2025-08-25
description: We build a plugin architecture to handle project advancement  
---

<div class="intro"> 
<p class="wide">
Plugin architectures are useful for building extensible systems. The core tool sets a frame while providing extension points, or <em>hooks</em>. This architecture is quite common in JavaScript tooling (e.g. bundlers, linters, dev servers, etc.), but in this post we will see how to set it up to solve a business-oriented problem rather than a technical one.
</p>
</div>

## The problem

Imagine you are developing software to manage construction projects. 
Each phase has its own specific requirements and needs its own expertise. 
First, you need to hire a team of workers, then find the materials from a list of providers, draw up plans, and so on. 
These milestones can be broken down into several tasks. 
At any time, you may wish to check the overall progress and obtain metrics on task completion. 
You are on the team responsible for developing the software for the project management part. 
Orchestrating the different modules is not an easy task in organisational or technical terms:
for example, you lack the knowledge to determine the status of a given task. 
However, thanks to a plugin architecture, you will be able to provide a robust framework that allows other teams to incorporate their logic into your project management code.

## Data model

From a project management perspective, the specifics of a given task are irrelevant. 
What matters is the ability to identify and group tasks logically, and to determine general progress. 
Let's translate that into an abstract <code>DefinedTask</code> type.

```typescript
// tasks/types.ts
export type TaskStatus = 'todo' | 'done' | 'skipped';

export type DefinedTask<
    TaskType extends string,
    Milestone extends string,
    Data,
> = {
    type: TaskType;
    projectId: string;
    milestone: Milestone;
    data: Data;
    status: TaskStatus;
};

// extension point
export interface TaskRegistry {}

export type Task = TaskRegistry[keyof TaskRegistry];

export type TaskType = Task['type'];

export type Milestone = Task['milestone'];
```

This type has three moving parts that are not relevant to project management logic and can be filled in as desired. 
The <code>TaskRegistry</code> acts as a placeholder that other modules will be able to extend thanks to declaration merging. 
The rest is a set of useful types that can be derived from the registry.

All the modules should now be able to define their own tasks:

```typescript
// worker-team/types.ts
import type { DefinedTask } from '../tasks/types.ts';

type WorkerType = 'carpenter' | 'plumber' | 'electricians'

export type WorkerTeamTasks =
  | DefinedTask<'hire_team', 'worker_team', Record<WorkerType, boolean>>
  | DefinedTask<'train_team', 'worker_team', { timeSpent: number }>;

declare module '../tasks/types.ts' {
  interface TaskRegistry {
    workerTeam: WorkerTeamTasks;
  }
}

// suppliers/types.ts
import type { DefinedTask } from '../tasks/types.ts';

type SKU = string;
type SupplierId = string;

export type SupplierTasks =
    | DefinedTask<
    'find_suppliers',
    'supplier',
    Record<SKU, SupplierId>
>
    | DefinedTask<'verify_suppliers', 'supplier', Record<SupplierId, boolean>>;

declare module '../tasks/types.ts' {
    interface TaskRegistry {
        provideMaterials: ProvideMaterialsTasks;
    }
}
```

Each domain team uses type declaration merging and interface merging on the registry to extend task definition. 
This means that if the project management team defines a service for their use cases on tasks, the API will reflect the way in which the tasks have been defined by the consuming modules.
Below is an example using a basic file system database:

```typescript
// tasks/task-service.ts
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

import type { Task, TaskType } from './types.ts';
import { mapValues } from '../utils.ts';

const DATA_FILE_PATH = new URL('./data.json', import.meta.url).pathname;

export const createTaskService = () => {
    return {
        async findOne<T extends TaskType>({
                                              projectId,
                                              type,
                                          }: {
            type: T;
            projectId: string;
        }): Promise<Extract<Task, { type: T }> | undefined> {
            const { default: data } = await import(DATA_FILE_PATH, {
                with: { type: 'json' },
            });

            return data[projectId]?.[type];
        },

        async save({ task }: { task: Task }) {
            const { default: data } = await import(DATA_FILE_PATH, {
                with: {
                    type: 'json',
                },
            });

            const { projectId, type, ...rest } = task;
            await writeFile(
                DATA_FILE_PATH,
                JSON.stringify(
                    {
                        ...data,
                        [projectId]: {
                            ...(data[projectId] ?? {}),
                            [type]: {
                                projectId,
                                type,
                                ...rest,
                            },
                        },
                    },
                    null,
                    2,
                ),
            );
        },

        async getProjectAdvancement({ projectId }: { projectId: string }) {
            const { default: data } = await import(DATA_FILE_PATH, {
                with: { type: 'json' },
            });

            const projectTasks: Record<TaskType, Task> = data[projectId] ?? {};
            const byMilestone = Object.groupBy(
                Object.values(projectTasks),
                ({ milestone }) => milestone,
            );

            return mapValues(byMilestone, (tasks) => ({
                total: tasks.length,
                completed: tasks.length
                    ? tasks.filter(({ status }) => status === 'done')
                    : 0,
            }));
        },
    };
};

```

If you use this service, it will able to infer the task type based on its identifier.

<figure>
    <video controls>
    <source src="/posts/plugin-architecture/task_type.mp4" />
    </video>
    <figcaption>Task type inference</figcaption>
</figure>