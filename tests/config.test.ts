import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Config, ConfigLoader } from '../src/config.js'
import { getDefaultExportFromModulePath } from '../src/utils.js'

vi.mock('../src/utils.js', () => ({
  getDefaultExportFromModulePath: vi.fn(),
}))

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

describe('ConfigLoader', () => {
  it.each([undefined, './nested/config.ts', '/other/config.ts'])('resolves project paths from cwd with config %s', async (configFilePath) => {
    vi.mocked(getDefaultExportFromModulePath).mockResolvedValue({})
    const readdir = vi.spyOn(fs, 'readdir').mockResolvedValue([])

    const config = await ConfigLoader.load({ configFilePath })

    expect(getDefaultExportFromModulePath).toHaveBeenCalledWith(
      path.resolve(configFilePath ?? 'config/lucid_zero.ts'),
    )
    expect(config.outputFilePath).toBe(path.resolve('zero-schema.gen.ts'))
    expect(config.tsconfigPath).toBe(path.resolve('tsconfig.json'))
    await expect(config.verify()).rejects.toThrow('No Lucid models found in modelsDirectory')
    expect(readdir).toHaveBeenCalledWith(path.resolve('app/models'))
  })

  it.each(['./custom/tsconfig.json', '/other/tsconfig.json'])('resolves tsconfig %s from cwd', async (tsconfigPath) => {
    vi.mocked(getDefaultExportFromModulePath).mockResolvedValue({})
    const config = await ConfigLoader.load({ configFilePath: './nested/config.ts', tsconfigPath })

    expect(config.tsconfigPath).toBe(path.resolve(tsconfigPath))
  })
})

describe('outputPath', () => {
  it('defaults to zero-schema.gen.ts in cwd', () => {
    const config = new Config({})

    expect(config.outputFilePath).toBe(path.resolve('zero-schema.gen.ts'))
  })

  it('resolves a custom path relative to cwd', () => {
    const config = new Config({ outputPath: './generated/schema.ts' })

    expect(config.outputFilePath).toBe(path.resolve('generated/schema.ts'))
  })

  it('preserves an absolute output path', () => {
    const outputPath = path.resolve('generated/schema.ts')
    const config = new Config({ outputPath })

    expect(config.outputFilePath).toBe(outputPath)
  })
})

describe('modelsDirectory', () => {
  it('defaults to ./app/models when omitted', () => {
    expect(new Config({}).modelsDirectory).toBe('./app/models')
  })

  it.each([undefined, './custom/models', '/absolute/models'])('resolves %s relative to cwd', async (modelsDirectory) => {
    const config = new Config({ modelsDirectory })
    const readdir = vi.spyOn(fs, 'readdir').mockResolvedValue([])

    await expect(config.verify()).rejects.toThrow('No Lucid models found in modelsDirectory')
    expect(readdir).toHaveBeenCalledWith(path.resolve(modelsDirectory ?? './app/models'))
  })

  it('rejects an explicitly empty directory', async () => {
    await expect(new Config({ modelsDirectory: '' }).verify()).rejects.toThrow('modelsDirectory must not be empty')
  })
})
