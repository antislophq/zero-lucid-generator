import fs from 'node:fs/promises'
import path from 'node:path'
import type { LucidModel } from '@adonisjs/lucid/types/model'

import { getDefaultExportFromModulePath } from './utils.js'

export const DEFAULT_CONFIG_FILE_PATH = 'lucid-zero.config.ts'
export const DEFAULT_OUTPUT_FILE_PATH = 'zero-schema.gen.ts'

export type CliOptions = {
  configFilePath?: string
  tsconfigPath?: string
}

export type ConfigInput = {
  modelsSourcePath: string
  /**
   * Models to exclude from the generated schema.
   * Typed as a constructor array rather than `LucidModel[]` so that model
   * classes from the user's own `@adonisjs/lucid` installation are accepted
   * without a structural mismatch from duplicate copies of the package.
   */
  excludeModels?: (abstract new (...args: any[]) => any)[]
  output?: string
  prettier?: boolean
  columnTypes?: Record<string, Record<string, string>>
}

export class Config {
  modelsSourcePath: string
  excludeModels: (abstract new (...args: any[]) => any)[]
  outputFilePath: string
  formatOutputFile: boolean
  columnTypes: Record<string, Record<string, string>>
  tsconfigPath: string
  
  /** Directory containing the config file — used to resolve relative paths */
  configDir: string

  /** Populated by this.loadModels() */
  models: LucidModel[] = []

  constructor(configInput: ConfigInput, configDir: string = process.cwd(), tsconfigPath?: string) {
    this.configDir = configDir
    this.modelsSourcePath = configInput.modelsSourcePath
    this.excludeModels = configInput.excludeModels ?? []
    this.outputFilePath = path.resolve(configDir, configInput.output ?? DEFAULT_OUTPUT_FILE_PATH)
    this.tsconfigPath = tsconfigPath ?? path.resolve(configDir, 'tsconfig.json')
    this.formatOutputFile = configInput.prettier ?? false
    this.columnTypes = configInput.columnTypes ?? {}
  }

  async verify(): Promise<void> {
    if (!this.modelsSourcePath) {
      throw new Error('lucid-zero: modelsSourcePath is required')
    }

    // Load the models from the modelsSourcePath
    await this.loadModels()

    if (this.models.length === 0) {
      throw new Error(
        `lucid-zero: No Lucid models found in modelsSourcePath. ` +
        `Each model file must have a default export that extends BaseModel.`,
      )
    }

    // Validate columnTypes against the models
    this.verifyColumnTypes()
  }

  private async loadModels(): Promise<void> {
    const modelsSourceAbsPath = path.resolve(this.configDir, this.modelsSourcePath)

    let fileNames: string[]
    try {
      fileNames = await fs.readdir(modelsSourceAbsPath)
    } catch (e) {
      throw new Error(
        `lucid-zero: Could not read modelsSourcePath at ${modelsSourceAbsPath}. Does the directory exist?`
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
            path.join(modelsSourceAbsPath, fileName)
          )
        } catch (err) {
          console.warn(`lucid-zero: Failed to import ${fileName}, skipping: ${String(err)}`)
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


  private verifyColumnTypes(): void {
    const validZeroTypes = ['string', 'number', 'boolean', 'json', 'enumeration']
    const modelNames = new Set(this.models.map((m) => m.name))

    for (const [modelName, columnOverrides] of Object.entries(this.columnTypes ?? {})) {
      // Validates that the model name is one of the models loaded
      if (!modelNames.has(modelName)) {
        throw new Error(
          `lucid-zero: columnTypes has unknown model "${modelName}". Known models: ${[...modelNames].join(', ')}`,
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
            `lucid-zero: columnTypes override for ${modelName}.${attributeName} has unrecognised type "${typeString}". Expected one of: ${validZeroTypes.join(', ')}`,
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
        `lucid-zero: Failed to import config at ${absoluteConfigPath}\n` +
        `  Error: ${String(err)}`,
      )
    }

    // Build config from config input, passing the config file's directory so
    // relative paths (modelsSourcePath, output) resolve against it rather than CWD.
    const config = new Config(defaultExport as ConfigInput, path.dirname(absoluteConfigPath), opts.tsconfigPath)
    return config
  }
}
