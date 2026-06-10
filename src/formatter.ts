type PrettierInstance = {
  format(source: string, options?: Record<string, unknown>): Promise<string>
  resolveConfig(filePath: string): Promise<Record<string, unknown> | null>
}

export class Formatter {
  private static async loadPrettier(): Promise<PrettierInstance | null> {
    let prettier: PrettierInstance

    try {
      const { createRequire } = await import('node:module')
      const req = createRequire(process.cwd() + '/package.json')
      const prettierPath = req.resolve('prettier')
      const { pathToFileURL } = await import('node:url')
      prettier = (await import(pathToFileURL(prettierPath).href)) as unknown as PrettierInstance
      return prettier
    } catch {
      return null
    }
  }

  static async format(code: string): Promise<string> {
    const prettier = await Formatter.loadPrettier()

    if (!prettier) {
      console.warn('lucid-zero: prettier not found — skipping formatting')
      return code
    }

    try {
      const options = await prettier.resolveConfig(process.cwd())
      return await prettier.format(code, { ...options, parser: 'typescript' })
    } catch {
      console.warn('lucid-zero: prettier formatting failed — skipping')
      return code
    }
  }
}
