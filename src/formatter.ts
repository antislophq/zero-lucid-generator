import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

function resolveOxfmtBin(): string | null {
  try {
    const req = createRequire(process.cwd() + '/package.json')
    const pkgMain = req.resolve('oxfmt')
    return pkgMain.replace(/dist\/index\.js$/, 'bin/oxfmt')
  } catch {
    return null
  }
}

export class Formatter {
  /**
   * Formats `code` by piping it through the oxfmt CLI with `--stdin-filepath`
   * set to the output file's absolute path. This lets oxfmt walk up the
   * directory tree and discover `.oxfmtrc.json` / `oxfmt.config.ts` in the
   * user's project.
   */
  static async format(code: string, outputFilePath: string): Promise<string> {
    const bin = resolveOxfmtBin()

    if (!bin) {
      console.warn('lucid-zero: oxfmt not found — skipping formatting')
      return code
    }

    // The oxfmt Node.js API (format()) doesn't automatically discover .oxfmtrc.json
    const result = spawnSync(
      process.execPath,
      [bin, `--stdin-filepath=${outputFilePath}`],
      {
        input: code,
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    )

    if (result.status !== 0) {
      console.warn(`lucid-zero: oxfmt formatting failed — skipping\n${result.stderr ?? ''}`)
      return code
    }

    return result.stdout
  }
}
