import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Config, ResolvedConfig } from '../types.js'

export const DEFAULT_CONFIG_FILE = 'lucid-zero.config.ts'
export const DEFAULT_OUTPUT_FILE = 'zero-schema.gen.ts'

/**
 * Scans a directory for .ts files, imports each one, and returns all
 * files whose default export looks like a Lucid model class.
 *
 * A Lucid model class has a static $columnsDefinitions Map on it.
 */
async function loadModelsFromDirectory(absoluteModelsPath: string): Promise<LucidModel[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(absoluteModelsPath)
  } catch {
    throw new Error(
      `lucid-zero: Could not read modelsSourcePath at ${absoluteModelsPath}. Does the directory exist?`,
    )
  }

  const { tsImport } = await import('tsx/esm/api')
  const models: LucidModel[] = []

  for (const entry of entries) {
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue

    const absoluteFilePath = path.join(absoluteModelsPath, entry)
    const fileUrl = url.pathToFileURL(absoluteFilePath).href

    let importedModule: unknown
    try {
      importedModule = await tsImport(fileUrl, { parentURL: import.meta.url })
    } catch {
      // Not every .ts file in the models directory has to be a model —
      // skip files that fail to import
      continue
    }

    const defaultExport = (importedModule as Record<string, unknown>)?.default
    if (!isLucidModel(defaultExport)) continue

    models.push(defaultExport)
  }

  return models
}

/**
 * Checks if a value is a Lucid model class by looking for the static
 * $columnsDefinitions Map that every booted Lucid model has.
 */
function isLucidModel(value: unknown): value is LucidModel {
  return (
    typeof value === 'function' &&
    '$columnsDefinitions' in value &&
    value.$columnsDefinitions instanceof Map
  )
}

/**
 * Returns the config file path if it exists in cwd, otherwise null.
 */
export async function findDefaultConfigFile(): Promise<string | null> {
  const absoluteConfigPath = path.resolve(process.cwd(), DEFAULT_CONFIG_FILE)
  try {
    await fs.access(absoluteConfigPath)
    return DEFAULT_CONFIG_FILE
  } catch {
    return null
  }
}

/**
 * Dynamically imports a lucid-zero.config.ts file, discovers models from
 * modelsSourcePath, validates the config, and returns a ResolvedConfig.
 */
export async function loadConfigFile(configFilePath: string): Promise<ResolvedConfig> {
  const absoluteConfigPath = path.resolve(process.cwd(), configFilePath)

  try {
    await fs.access(absoluteConfigPath)
  } catch {
    throw new Error(`lucid-zero: Config file not found at ${absoluteConfigPath}`)
  }

  let importedModule: unknown
  try {
    const { tsImport } = await import('tsx/esm/api')
    const configFileUrl = url.pathToFileURL(absoluteConfigPath).href
    importedModule = await tsImport(configFileUrl, { parentURL: import.meta.url })
  } catch (err) {
    throw new Error(
      `lucid-zero: Failed to import config file at ${absoluteConfigPath}\n` +
        `  Make sure your package.json has "type": "module".\n` +
        `  Original error: ${String(err)}`,
    )
  }

  const config: Config = (importedModule as Record<string, unknown>)?.default as Config

  if (!config) {
    throw new Error(
      `lucid-zero: Config file must have a default export.\n  File: ${absoluteConfigPath}`,
    )
  }

  if (!config.modelsSourcePath) {
    throw new Error(
      `lucid-zero: Config must include a "modelsSourcePath".\n  File: ${absoluteConfigPath}`,
    )
  }

  const configDir = path.dirname(absoluteConfigPath)
  const absoluteModelsPath = path.resolve(configDir, config.modelsSourcePath)

  const models = await loadModelsFromDirectory(absoluteModelsPath)

  if (models.length === 0) {
    throw new Error(
      `lucid-zero: No Lucid models found in ${absoluteModelsPath}. ` +
        `Each model file must have a default export that extends BaseModel.`,
    )
  }

  const validZeroTypes = ['string', 'number', 'boolean', 'json', 'enumeration']
  const modelNames = new Set(models.map((m) => m.name))

  for (const [modelName, columnOverrides] of Object.entries(config.columnTypes ?? {})) {
    if (!modelNames.has(modelName)) {
      throw new Error(
        `lucid-zero: columnTypes has unknown model "${modelName}". Known models: ${[...modelNames].join(', ')}`,
      )
    }

    for (const [attributeName, typeString] of Object.entries(columnOverrides)) {
      const baseTypeName = typeString.match(/^([a-z]+)/)?.[1]
      if (!baseTypeName || !validZeroTypes.includes(baseTypeName)) {
        throw new Error(
          `lucid-zero: columnTypes override for ${modelName}.${attributeName} has unrecognised type "${typeString}". Expected one of: ${validZeroTypes.join(', ')}`,
        )
      }
    }
  }

  return { ...config, models }
}
