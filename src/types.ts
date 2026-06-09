import type { LucidModel } from '@adonisjs/lucid/types/model'

// ----------------------------------------------------------------
// User-facing config (lucid-zero.config.ts)
// ----------------------------------------------------------------

export type Config = {
  /**
   * Path to the directory containing your Lucid model files.
   * All .ts files in this directory are scanned for Lucid models.
   * Relative to the location of lucid-zero.config.ts.
   *
   * @example './app/models'
   */
  modelsSourcePath: string

  /**
   * Models to exclude from the generated schema.
   *
   * @example
   * excludeModels: [Session, UserIdentity]
   */
  excludeModels?: LucidModel[]

  /**
   * Output file path. Defaults to ./zero-schema.gen.ts
   */
  output?: string

  /**
   * Run prettier on the generated file. Requires prettier to be installed.
   */
  prettier?: boolean

  /**
   * Convert DB table names to camelCase in the Zero schema.
   */
  camelCase?: boolean

  /**
   * Override the Zero type for specific columns when ts-morph cannot infer
   * it correctly — e.g. for JSON columns with a specific shape.
   *
   * Keys are model class names. Values map attribute name → Zero type string.
   *
   * @example
   * columnTypes: {
   *   User: { metadata: 'json<{ name: string; age: number }>()' }
   * }
   */
  columnTypes?: Record<string, Record<string, string>>
}

// ----------------------------------------------------------------
// Internal config — resolved fields added by loadConfigFile
// ----------------------------------------------------------------

export type ResolvedConfig = Config & {
  /** Loaded Lucid model classes discovered from modelsSourcePath. */
  models: LucidModel[]
}

// ----------------------------------------------------------------
// Intermediate representation (output of schema-mapper)
// ----------------------------------------------------------------

export type ZeroTypeMapping = {
  /** Zero type expression, e.g. "string()", "number()", "json<Foo>()" */
  type: string
  isOptional: boolean
  /** Set when the DB column name differs from the attribute name */
  mappedName: string | null
}

export type ZeroRelationshipLink = {
  sourceField: string[]
  destField: string[]
  destSchema: string
}

export type ZeroRelationship =
  | {
      type: 'one' | 'many'
      sourceField: string[]
      destField: string[]
      destSchema: string
    }
  | {
      type: 'many'
      chain: ZeroRelationshipLink[]
    }

export type ZeroModel = {
  /** Zero table name (possibly camelCased, e.g. "issueLabel") */
  tableName: string
  /** Actual DB table name — set when it differs from tableName */
  originalTableName: string | null
  /** Model class name, e.g. "User" */
  modelName: string
  /** Const name in generated file, e.g. "userTable" */
  zeroTableName: string
  columns: Record<string, ZeroTypeMapping>
  relationships: Record<string, ZeroRelationship>
  primaryKey: string[]
}

export type TransformedSchema = {
  models: ZeroModel[]
}
