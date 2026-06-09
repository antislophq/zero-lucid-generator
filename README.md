# lucid-zero

Generate [Zero](https://zero.rocicorp.dev) schemas directly from your [Lucid ORM](https://lucid.adonisjs.com) models — no manual schema duplication.

Inspired by [`drizzle-zero`](https://github.com/rocicorp/drizzle-zero) and [`prisma-zero`](https://github.com/rocicorp/prisma-zero).

---

## How it works

`lucid-zero` scans your Lucid model files, introspects their column and relation definitions at runtime, infers TypeScript types via [ts-morph](https://ts-morph.com), and writes a typed Zero schema file you can import directly into your app.

---

## Installation

```sh
pnpm add lucid-zero
```

`lucid-zero` is a dev-time generator. You only need it in your project during development to regenerate the schema when models change.

---

## Setup

### 1. Create a config file

Create `lucid-zero.config.ts` at the root of your project:

```ts
import { lucidZeroConfig } from 'lucid-zero'

export default lucidZeroConfig({
  modelsSourcePath: './app/models',
})
```

### 2. Run the generator

```sh
pnpm lucid-zero generate
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
| `output` | `string` | `zero-schema.gen.ts` | Output file path |
| `prettier` | `boolean` | `false` | Format the output with prettier (must be installed) |
| `camelCase` | `boolean` | `false` | Convert `snake_case` DB table names to `camelCase` in the Zero schema |
| `columnTypes` | `Record<string, Record<string, string>>` | — | Override the Zero type for specific columns (see below) |

---

## CLI options

```
lucid-zero generate [options]

Options:
  -c, --config <path>     Path to config file          (default: lucid-zero.config.ts)
  -o, --output <path>     Output file path             (default: zero-schema.gen.ts)
  -t, --tsconfig <path>   Path to tsconfig.json        (default: ./tsconfig.json)
  -f, --format            Format output with prettier
```

---

## Column type overrides

`lucid-zero` infers Zero types from your TypeScript annotations:

| TypeScript type | Zero type |
|---|---|
| `string` | `string()` |
| `number` | `number()` |
| `boolean` | `boolean()` |
| `DateTime` / `Date` | `number()` (Unix ms) |
| `object` / `unknown` / `any` | `json()` |
| nullable (`\| null`) | `.optional()` |

When inference isn't accurate — for example a JSON column with a known shape — use `columnTypes`:

```ts
import { lucidZeroConfig } from 'lucid-zero'

export default lucidZeroConfig({
  modelsSourcePath: './app/models',
  columnTypes: {
    Issue: {
      metadata: 'json<{ priority: number; labels: string[] }>()',
    },
  },
})
```

Valid Zero base types: `string`, `number`, `boolean`, `json`, `enumeration`.

---

## Example output

Given a `User` model with a `hasMany` relation to `Post`:

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

export const userTable = table("users")
  .columns({
    id: number(),
    name: string(),
    email: string(),
  })
  .primaryKey("id");

export const postTable = table("posts")
  .columns({
    id: number(),
    userId: number(),
    title: string(),
    body: string().optional(),
  })
  .primaryKey("id");

export const userTableRelationships = relationships(userTable, ({ many }) => ({
  posts: many({
    sourceField: ["id"],
    destField: ["userId"],
    destSchema: postTable,
  }),
}));

export const schema = createSchema({
  tables: [userTable, postTable],
  relationships: [userTableRelationships],
});

export type Schema = typeof schema;

export const zql = createBuilder(schema);
```

---

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

## Regenerating the schema

Re-run the generator whenever you add or change a model:

```sh
pnpm lucid-zero generate
```

You can add this to your build or pre-commit step to keep the schema in sync.
