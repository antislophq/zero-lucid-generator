#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { ConfigLoader, DEFAULT_CONFIG_FILE_PATH } from './config.js'
import SchemaTransformer from './schema-transformer.js'
import CodeGenerator from './code-generator.js'

const program = new Command()

program
  .name('lucid-zero')
  .description('Generate Zero schemas from Lucid ORM model definitions')


// Specify a type for opts
export type CliOptions = {
  configFilePath?: string
  tsconfigPath?: string
}

program
  .command('generate')
  .description('Generate a Zero schema from your Lucid models')
  .option('-c, --config <path>', `Path to config file (default: ${DEFAULT_CONFIG_FILE_PATH})`)
  .option('-t, --tsconfig <path>', `Path to tsconfig file (default: tsconfig.json)`)
  .action(async (opts: { config?: string; tsconfig?: string }) => {
    await run({ configFilePath: opts.config, tsconfigPath: opts.tsconfig })
  })

// Run unconditionally; this is a script
program.parse()


async function run(options: CliOptions) {
  try {
    const config = await ConfigLoader.load(options)
    await config.verify()

    // Transform to an intermediate representation
    const schemaTransformer = new SchemaTransformer(config, options.tsconfigPath)
    const transformedSchema = schemaTransformer.transform()

    // Generate the output file
    const codeGenerator = new CodeGenerator(config, transformedSchema)
    await codeGenerator.generateToOutputFile()

  } catch(e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`lucid-zero: ${message}`)
    process.exit(1)
  }
}


export { Config as ConfigInput } from './config.js'