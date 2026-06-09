/**
 * Maps TypeScript property type names (as strings, read from the TS AST)
 * to their Zero type function call strings.
 *
 * Lucid models carry no column type info at runtime — types only exist
 * in TypeScript source. The schema-mapper reads the TS type annotation
 * of each @column() property and looks it up here.
 */
export const tsTypeToZeroType: Record<string, string> = {
  string: 'string()',
  number: 'number()',
  boolean: 'boolean()',
  // Lucid date columns are typed as Luxon DateTime
  DateTime: 'number()',
  // Plain JS Date falls back to number (epoch ms)
  Date: 'number()',
  // Catch-all for object/unknown shapes
  object: 'json()',
  unknown: 'json()',
  any: 'json()',
}

/**
 * Returns the Zero type string for a given TypeScript type name.
 * Falls back to json() for unrecognised types.
 */
export function mapTsTypeToZero(tsType: string): string {
  // Strip nullability wrappers like "string | null" → "string"
  const base = tsType
    .split('|')
    .map((t) => t.trim())
    .find((t) => t !== 'null' && t !== 'undefined')

  if (!base) return 'json()'

  return tsTypeToZeroType[base] ?? 'json()'
}

/**
 * Infer whether a TypeScript type string is optional (i.e. includes null
 * or undefined in a union).
 */
export function isTsTypeOptional(tsType: string): boolean {
  return tsType.includes('null') || tsType.includes('undefined')
}
