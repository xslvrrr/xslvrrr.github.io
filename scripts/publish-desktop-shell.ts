/**
 * Copies the built desktop UI into `public/desktop-shell/` so the deployed web application
 * serves the exact same shell the packaged desktop host downloads at runtime.
 *
 * Installed desktop packages fetch `/desktop-shell/shell.json`, verify every listed file, and
 * then render the deployed UI instead of the UI frozen into the installer. Publishing this
 * directory from the same build that produces the web deployment is what keeps desktop and web
 * on identical code.
 */
import { access, cp, readFile, rm } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

const desktopBuildDir = fileURLToPath(new URL('../dist/desktop', import.meta.url))
const publishDir = fileURLToPath(new URL('../public/desktop-shell', import.meta.url))
const manifestPath = `${desktopBuildDir}/shell.json`

async function main(): Promise<void> {
  try {
    await access(manifestPath)
  } catch {
    throw new Error(
      'dist/desktop/shell.json is missing. Run "bun run build:desktop:ui" before publishing the shell.'
    )
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    buildId?: unknown
    version?: unknown
    files?: unknown
  }
  if (typeof manifest.buildId !== 'string' || !manifest.buildId) {
    throw new Error('dist/desktop/shell.json does not declare a build id.')
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('dist/desktop/shell.json does not list any files.')
  }

  await rm(publishDir, { recursive: true, force: true })
  await cp(desktopBuildDir, publishDir, { recursive: true })

  console.info(
    `Published desktop shell ${manifest.buildId} (v${String(manifest.version)}, ${manifest.files.length} files) to public/desktop-shell/`
  )
}

await main()
