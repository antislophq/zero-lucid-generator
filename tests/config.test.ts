import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Config } from '../src/config.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('columnTypeOverrides', () => {
  it('defaults to an empty object', () => {
    expect(new Config({}).columnTypeOverrides).toEqual({})
  })

  it('accepts per-model column overrides', () => {
    const columnTypeOverrides = { Issue: { metadata: 'json()' } }
    const config = new Config({ columnTypeOverrides })

    expect(config.columnTypeOverrides).toEqual(columnTypeOverrides)
  })
})

describe('outputPath', () => {
  it('defaults to zero-schema.gen.ts next to the config file', () => {
    const configDir = path.resolve('example')
    const config = new Config({}, configDir)

    expect(config.outputFilePath).toBe(path.join(configDir, 'zero-schema.gen.ts'))
  })

  it('resolves a custom path relative to the config directory', () => {
    const configDir = path.resolve('example')
    const config = new Config({ outputPath: './generated/schema.ts' }, configDir)

    expect(config.outputFilePath).toBe(path.join(configDir, 'generated/schema.ts'))
  })

  it('preserves an absolute output path', () => {
    const outputPath = path.resolve('generated/schema.ts')
    const config = new Config({ outputPath }, path.resolve('example'))

    expect(config.outputFilePath).toBe(outputPath)
  })
})

describe('modelsDirectory', () => {
  it('defaults to ./app/models when omitted', () => {
    expect(new Config({}).modelsDirectory).toBe('./app/models')
  })

  it.each([undefined, './custom/models'])('resolves %s relative to the config directory', async (modelsDirectory) => {
    const configDir = path.resolve('example')
    const config = new Config({ modelsDirectory }, configDir)
    const readdir = vi.spyOn(fs, 'readdir').mockResolvedValue([])

    await expect(config.verify()).rejects.toThrow('No Lucid models found in modelsDirectory')
    expect(readdir).toHaveBeenCalledWith(path.resolve(configDir, modelsDirectory ?? './app/models'))
  })

  it('rejects an explicitly empty directory', async () => {
    await expect(new Config({ modelsDirectory: '' }).verify()).rejects.toThrow('modelsDirectory must not be empty')
  })
})
