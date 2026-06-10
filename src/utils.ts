import url from 'node:url'
import fs from 'node:fs/promises'

export function toCamelCase(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}


export async function getDefaultExportFromModulePath(modulePath: string): Promise<unknown> {
  try {
    await fs.access(modulePath)
  } catch {
    throw new Error(`Module not found at ${modulePath}`)
  }

  const { tsImport } = await import('tsx/esm/api')
  const moduleUrl = url.pathToFileURL(modulePath).href
  const module = await tsImport(moduleUrl, { parentURL: import.meta.url })
  const defaultExport = module.default

  if (!defaultExport) {
    throw new Error(`Module at ${modulePath} does not have a default export`)
  }

  return defaultExport
}