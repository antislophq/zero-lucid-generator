#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { Command } from 'commander'
import { DEFAULT_CONFIG_FILE, DEFAULT_OUTPUT_FILE, findDefaultConfigFile, loadConfigFile } from './config.js'
import { formatSchema } from './shared.js'
import { transformSchema } from '../schema-mapper.js'
import { generateCode } from '../code-generator.js'

async function run(opts: {
  config?: string
  output?: string
  tsconfig?: string
  format?: boolean
}) {
  // ── Resolve config file ──────────────────────────────────────
  const configFilePath = opts.config ?? (await findDefaultConfigFile())

  if (!configFilePath) {
    console.error(
      `❌ lucid-zero: No config file found.\n` +
        `  Create a ${DEFAULT_CONFIG_FILE} in your project root, or pass --config <path>.`,
    )
    process.exit(1)
  }

  console.log(`⚙️  lucid-zero: Loading config from ${configFilePath}`)

  const config = await loadConfigFile(configFilePath!)

  if (opts.format !== undefined) config.prettier = opts.format

  // ── Transform ─────────────────────────────────────────────────
  console.log(`⚙️  lucid-zero: Processing ${config.models.length} model(s)...`)

  const schema = transformSchema(config, opts.tsconfig)

  if (schema.models.length === 0) {
    console.error(`❌ lucid-zero: No models were processed. Check your config.`)
    process.exit(1)
  }

  // ── Generate code ─────────────────────────────────────────────
  let output = generateCode(schema)

  // ── Format ────────────────────────────────────────────────────
  const outputFilePath = path.resolve(process.cwd(), opts.output ?? config.output ?? DEFAULT_OUTPUT_FILE)

  if (config.prettier) {
    output = await formatSchema(output, outputFilePath)
  }

  // ── Write ─────────────────────────────────────────────────────
  await fs.writeFile(outputFilePath, output, 'utf-8')
  console.log(`✅ lucid-zero: Schema written to ${outputFilePath}`)
}

// ── CLI definition ────────────────────────────────────────────────

const program = new Command()

program
  .name('lucid-zero')
  .description('Generate Zero schemas from Lucid ORM model definitions')

program
  .command('generate')
  .description('Generate a Zero schema from your Lucid models')
  .option('-c, --config <path>', `Path to config file (default: ${DEFAULT_CONFIG_FILE})`)
  .option('-o, --output <path>', `Output file path (default: ${DEFAULT_OUTPUT_FILE})`)
  .option('-t, --tsconfig <path>', 'Path to tsconfig.json (default: ./tsconfig.json)')
  .option('-f, --format', 'Format output with prettier', false)
  .action(async (opts) => {
    await run({
      config: opts.config,
      output: opts.output,
      tsconfig: opts.tsconfig,
      format: opts.format,
    })
  })

program.parse()
