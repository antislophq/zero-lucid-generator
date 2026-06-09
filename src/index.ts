/**
 * Public API for lucid-zero.
 *
 * Users import this in their lucid-zero.config.ts to define their config
 * with type safety.
 */
export type { Config, ZeroModel, ZeroTypeMapping, ZeroRelationship, TransformedSchema } from './types.js'

/**
 * Helper to define a typed config object with autocompletion.
 *
 * @example
 * import { lucidZeroConfig } from 'lucid-zero'
 *
 * export default lucidZeroConfig({
 *   modelsSourcePath: './app/models',
 *   prettier: true,
 * })
 */
export function lucidZeroConfig(config: import('./types.js').Config): import('./types.js').Config {
  return config
}
