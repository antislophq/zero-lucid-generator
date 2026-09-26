import fs from 'node:fs/promises'
import path from 'node:path'
import type { LucidModel } from '@adonisjs/lucid/types/model'

import { getDefaultExportFromModulePath } from './utils.js'

export const DEFAULT_CONFIG_FILE_PATH = 'config/lucid_zero.ts'
export const DEFAULT_OUTPUT_FILE_PATH = 'zero-schema.gen.ts'
export const DEFAULT_MODELS_DIRECTORY = './app/models'

export type CliOptions = {
  configFilePath?: string
  tsconfigPath?: string
}

export type ConfigInput = {
  modelsDirectory?: string
  /**
   * Models to exclude from the generated schema.
   * Typed as a constructor array rather than `LucidModel[]` so that model
   * classes from the user's own `@adonisjs/lucid` installation are accepted
   * without a structural mismatch from duplicate copies of the package.
   */
  excludeModels?: (abstract new (...args: any[]) => any)[]
  outputPath?: string

  columnTypeOverrides?: Record<string, Record<string, string>>
}

export class Config {
  modelsDirectory: string
  excludeModels: (abstract new (...args: any[]) => any)[]
  outputFilePath: string

  columnTypeOverrides: Record<string, Record<string, string>>
  tsconfigPath: string
  
  /** Working directory used to resolve relative paths */
  cwd: string

  /** Populated by this.loadModels() */
  models: LucidModel[] = []

  constructor(configInput: ConfigInput, tsconfigPath?: string) {
    this.cwd = process.cwd()
    this.modelsDirectory = configInput.modelsDirectory ?? DEFAULT_MODELS_DIRECTORY
    this.excludeModels = configInput.excludeModels ?? []
    this.outputFilePath = path.resolve(this.cwd, configInput.outputPath ?? DEFAULT_OUTPUT_FILE_PATH)
    this.tsconfigPath = path.resolve(this.cwd, tsconfigPath ?? 'tsconfig.json')

    this.columnTypeOverrides = configInput.columnTypeOverrides ?? {}
  }

  async verify(): Promise<void> {
    if (!this.modelsDirectory) {
      throw new Error('modelsDirectory must not be empty')
    }

    // Load the models from the modelsDirectory
    await this.loadModels()

    if (this.models.length === 0) {
      throw new Error(
        `No Lucid models found in modelsDirectory. ` +
        `Each model file must have a default export that extends BaseModel.`,
      )
    }

    // Validate columnTypeOverrides against the models
    this.verifyColumnTypeOverrides()
  }

  private async loadModels(): Promise<void> {
    const modelsDirectoryAbsPath = path.resolve(this.cwd, this.modelsDirectory)

    let fileNames: string[]
    try {
      fileNames = await fs.readdir(modelsDirectoryAbsPath)
    } catch (e) {
      throw new Error(
        `Could not read modelsDirectory at ${modelsDirectoryAbsPath}. Does the directory exist?`
        + `Error: ${e}`,
      )
    }

    const tsFileNames = fileNames.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    const excludedModelNames = new Set((this.excludeModels ?? []).map((m) => m.name))

    const results = await Promise.all(
      tsFileNames.map(async (fileName) => {
        let defaultExport: unknown

        try {
          defaultExport = await getDefaultExportFromModulePath(
            path.join(modelsDirectoryAbsPath, fileName)
          )
        } catch (err) {
          console.warn(`Failed to import ${fileName}, skipping: ${String(err)}`)
          return null
        }

        if (!this.isLucidModel(defaultExport)) {
          console.info(`${fileName} does not export a Lucid model. Skipping...`)
          return null
        }

        if (excludedModelNames.has(defaultExport.name)) {
          console.info(`${defaultExport.name} is excluded. Skipping...`)
          return null
        }

        return defaultExport
      }),
    )

    this.models = results.filter((m): m is LucidModel => m !== null)
  }


  private verifyColumnTypeOverrides(): void {
    const validZeroTypes = ['string', 'number', 'boolean', 'json', 'enumeration']
    const modelNames = new Set(this.models.map((m) => m.name))

    for (const [modelName, columnOverrides] of Object.entries(this.columnTypeOverrides ?? {})) {
      // Validates that the model name is one of the models loaded
      if (!modelNames.has(modelName)) {
        throw new Error(
          `columnTypeOverrides has unknown model "${modelName}". Known models: ${[...modelNames].join(', ')}`,
        )
      }

      // Only validates the leading type name (e.g. "string" in "string.from('col').optional()")
      // — anything after the base word is passed through unchecked.
      // It's pretty dificult to validate the entire type string
      // So, leaving it here for now
      for (const [attributeName, typeString] of Object.entries(columnOverrides)) {
        const baseTypeName = typeString.match(/^([a-z]+)/)?.[1]
        if (!baseTypeName || !validZeroTypes.includes(baseTypeName)) {
          throw new Error(
            `columnTypeOverrides override for ${modelName}.${attributeName} has unrecognised type "${typeString}". Expected one of: ${validZeroTypes.join(', ')}`,
          )
        }
      }
    }
  }

  private isLucidModel(value: unknown): value is LucidModel {
    return (
      // The class itself is a constructor function
      typeof value === 'function' &&
      '$columnsDefinitions' in value &&
      value.$columnsDefinitions instanceof Map
    )
  }
}

export class ConfigLoader {
  public static async load(opts: CliOptions): Promise<Config> {
    const absoluteConfigPath = path.resolve(
      process.cwd(),
      opts.configFilePath ?? DEFAULT_CONFIG_FILE_PATH
    )

    let defaultExport: unknown

    // Import config input as a module
    try {
      defaultExport = await getDefaultExportFromModulePath(absoluteConfigPath)
    } catch (err) {
      throw new Error(
        `Failed to import config at ${absoluteConfigPath}\n` +
        `  Error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const config = new Config(defaultExport as ConfigInput, opts.tsconfigPath)
    return config
  }
}
