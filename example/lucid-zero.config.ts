import { lucidZeroConfig } from 'lucid-zero'

export default lucidZeroConfig({
  /**
   * Directory that contains your Lucid model files.
   * Every .ts file with a default export extending BaseModel is picked up.
   * Path is relative to this config file.
   */
  modelsSourcePath: './app/models',

  /**
   * Where to write the generated schema.
   * Defaults to zero-schema.gen.ts next to this config file.
   */
  output: './zero-schema.gen.ts',

  /**
   * Format the output with prettier.
   * Requires prettier to be installed in the project.
   */
  prettier: true,

  /**
   * Convert snake_case DB table names to camelCase in the Zero schema.
   * e.g. "issue_labels" → "issueLabels"
   */
  camelCase: true,

  /**
   * Override the inferred Zero type for specific columns.
   *
   * Use this when ts-morph cannot see the correct type (e.g. an opaque
   * JSON blob that has a known shape at runtime).
   *
   * Keys are model class names. Values map attribute name → Zero type string.
   */
  columnTypes: {
    Issue: {
      // metadata is typed as `unknown` in the model but has a known shape
      metadata: 'json<{ priority: number; labels: string[] }>()',
    },
    User: {
      // role is stored as a string enum
      role: 'enumeration<"admin" | "member" | "viewer">()',
    },
  },
})
