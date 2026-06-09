type Prettier = {
  format(source: string, options?: Record<string, unknown>): Promise<string>
  resolveConfig(filePath: string): Promise<Record<string, unknown> | null>
}

/**
 * Attempt to load prettier from the user's project (not ours).
 * Returns null if prettier is not installed — formatting is then skipped.
 */
export async function loadPrettier(): Promise<Prettier | null> {
  try {
    const id = 'prettier'
    return (await import(id)) as unknown as Prettier
  } catch {
    // not installed globally
  }

  try {
    const { createRequire } = await import('node:module')
    const req = createRequire(process.cwd() + '/package.json')
    const prettierPath = req.resolve('prettier')
    const { pathToFileURL } = await import('node:url')
    return (await import(pathToFileURL(prettierPath).href)) as unknown as Prettier
  } catch {
    return null
  }
}

/**
 * Format a TypeScript string with prettier if available.
 * Silently returns the original string if prettier is not found.
 */
export async function formatSchema(content: string, filePath: string): Promise<string> {
  const prettier = await loadPrettier()

  if (!prettier) {
    console.warn('lucid-zero: prettier not found — skipping formatting')
    return content
  }

  try {
    const options = await prettier.resolveConfig(filePath)
    return await prettier.format(content, { ...options, parser: 'typescript' })
  } catch {
    console.warn('lucid-zero: prettier formatting failed — skipping')
    return content
  }
}
