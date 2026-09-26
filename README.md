# @antislop/zero-lucid-generator

Generate [Zero](https://zero.rocicorp.dev) schemas directly from your [Lucid ORM](https://lucid.adonisjs.com) models — no manual schema duplication.

Inspired by [`drizzle-zero`](https://github.com/rocicorp/drizzle-zero) and [`prisma-zero`](https://github.com/rocicorp/prisma-zero).

---

## How it works

`@antislop/zero-lucid-generator` scans your Lucid model files, introspects their column and relation definitions at runtime, infers TypeScript types via [ts-morph](https://ts-morph.com), and writes a typed Zero schema file you can import directly into your app.

---

## Installation

```sh
npm add -D @antislop/zero-lucid-generator
```

`@antislop/zero-lucid-generator` is a dev-time generator. You only need it during development to regenerate the schema when models change.

---

## Setup

### 1. Create a config file

Create `lucid-zero.config.ts` at the root of your project:

```ts
import type { Config } from '@antislop/zero-lucid-generator'

const config: Config = {
  modelsSourcePath: './app/models',
}

export default config
```

### 2. Run the generator

```sh
npx lucid-zero generate
```

This writes `zero-schema.gen.ts` next to your config file.

### 3. Import the schema

```ts
import { schema, zql } from './zero-schema.gen.js'
```

---

## Config options

| Option | Type | Default | Description |
|---|---|---|---|
| `modelsSourcePath` | `string` | **required** | Path to your models directory, relative to the config file |
| `output` | `string` | `zero-schema.gen.ts` | Output file path, relative to the config file |
| `excludeModels` | `LucidModel[]` | `[]` | Models to exclude from the generated schema |
| `columnTypes` | `Record<string, Record<string, string>>` | `{}` | Override the inferred Zero type for specific columns |


---

## CLI options

```
lucid-zero generate [options]

Options:
  -c, --config <path>     Path to config file     (default: lucid-zero.config.ts)
  -t, --tsconfig <path>   Path to tsconfig.json   (default: tsconfig.json next to config)
```

---

## Column type inference

`@antislop/zero-lucid-generator` maps TypeScript types to Zero types automatically:

| TypeScript type | Zero type |
|---|---|
| `string` | `string()` |
| `number` | `number()` |
| `boolean` | `boolean()` |
| `DateTime` / `Date` | `number()` (Unix ms) |
| `object` / `unknown` / `any` | `json()` |
| `T \| null` or `T \| undefined` | `.optional()` |

When inference isn't accurate — for example a JSON column with a known shape — use `columnTypes`:

```ts
import type { Config } from '@antislop/zero-lucid-generator'
import Session from "#models/session";

const config: Config = {
  modelsSourcePath: './app/models',
  columnTypes: {
    Issue: {
      // metadata is typed as `unknown` but has a known shape
      metadata: 'json<{ priority: number; labels: string[] }>()',
    },
    User: {
      // role is stored as a string enum
      role: 'enumeration<"admin" | "member" | "viewer">()',
    },
  },
  excludeModels: [Session],
}

export default config
```

Valid Zero base types: `string`, `number`, `boolean`, `json`, `enumeration`.

---

## Example output

```ts
// zero-schema.gen.ts (auto-generated — do not edit)

import {
  createBuilder,
  createSchema,
  number,
  relationships,
  string,
  table,
} from "@rocicorp/zero";

export const users = table("users")
  .columns({
    id: number(),
    name: string(),
    email: string(),
  })
  .primaryKey("id");

export const posts = table("posts")
  .columns({
    id: number(),
    userId: number().from('user_id'),
    title: string(),
    body: string().optional(),
  })
  .primaryKey("id");

export const usersRelationships = relationships(users, ({ many }) => ({
  posts: many({
    sourceField: ["id"],
    destField: ["userId"],
    destSchema: posts,
  }),
}));

export const schema = createSchema({
  tables: [users, posts],
  relationships: [usersRelationships],
});

export type Schema = typeof schema;

export const zql = createBuilder(schema);
```

## Supported relation types

| Lucid relation | Zero mapping |
|---|---|
| `hasOne` | `one(...)` |
| `hasMany` | `many(...)` |
| `belongsTo` | `one(...)` |
| `manyToMany` | `many([...chain])` via pivot table |
| `hasManyThrough` | `many([...chain])` |

Relations pointing to a model not found in `modelsSourcePath` are skipped with a warning.

---

## Automating regeneration

Add a script to `package.json` to regenerate whenever models change:

```json
{
  "scripts": {
    "zero:generate": "lucid-zero generate",
    "postinstall": "npm run zero:generate"
  }
}
```
