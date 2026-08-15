import { createHash } from 'node:crypto'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { posix, resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const desktopOutDir = fileURLToPath(new URL('./dist/desktop', import.meta.url))
const desktopBackendOrigin = 'http://localhost:14201'
const desktopBackendHost = new URL(desktopBackendOrigin).host
const SHELL_MANIFEST_FILENAME = 'shell.json'
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')
) as { version: string; desktopShell: { minimumNativeVersion: string } }

interface ShellFile {
  path: string
  size: number
  sha256: string
}

async function collectShellFiles(directory: string, prefix = ''): Promise<ShellFile[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const collected: ShellFile[] = []

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = prefix ? posix.join(prefix, entry.name) : entry.name
    if (entry.isDirectory()) {
      collected.push(...(await collectShellFiles(resolve(directory, entry.name), relativePath)))
      continue
    }
    if (!entry.isFile() || relativePath === SHELL_MANIFEST_FILENAME) continue

    const contents = await readFile(resolve(directory, entry.name))
    collected.push({
      path: relativePath,
      size: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
    })
  }

  return collected
}

export default defineConfig({
  root: fileURLToPath(new URL('./desktop', import.meta.url)),
  cacheDir: fileURLToPath(new URL('./node_modules/.vite-desktop', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  base: '/',
  server: {
    host: 'localhost',
    port: 14200,
    strictPort: true,
    fs: {
      allow: [projectRoot],
    },
    proxy: {
      '^/api/': {
        target: desktopBackendOrigin,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.setHeader('host', desktopBackendHost)
          })
        },
      },
    },
  },
  preview: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: desktopOutDir,
    emptyOutDir: true,
    assetsDir: '_app-assets',
    chunkSizeWarningLimit: 1000,
    // This shell is the same application, so it pays the same memory costs the web build does, on
    // the same 8 GB build container, immediately before it. See vite.config.ts for why both are off.
    reportCompressedSize: false,
    rollupOptions: {
      onLog(level, log, defaultHandler) {
        const isDependency = typeof log.id === 'string' && log.id.includes('node_modules/')
        if (level === 'warn' && log.code === 'INVALID_ANNOTATION' && isDependency) return
        defaultHandler(level, log)
      },
    },
  },
  resolve: {
    alias: {
      '@': projectRoot,
    },
  },
  plugins: [
    {
      // Rollup runs `closeBundle` hooks in parallel, so pruning and manifest generation share one
      // plugin: the manifest must describe the directory only after excluded artifacts are gone.
      //
      // The packaged desktop host reads this manifest from the deployed web origin to decide
      // whether a newer UI shell exists, then downloads and verifies every listed file before
      // serving it. Without it the installed app can only ever render its bundled UI.
      name: 'finalize-desktop-shell',
      apply: 'build',
      async closeBundle() {
        // Public download packages must never be embedded back into desktop packages.
        await rm(resolve(desktopOutDir, 'downloads'), { recursive: true, force: true })
        // A published live shell must never be embedded inside the next shell.
        await rm(resolve(desktopOutDir, 'desktop-shell'), { recursive: true, force: true })

        const files = await collectShellFiles(desktopOutDir)
        const buildId = createHash('sha256')
          .update(files.map((file) => `${file.path}:${file.sha256}`).join('\n'))
          .digest('hex')
          .slice(0, 32)

        const manifest = {
          buildId,
          version: packageJson.version,
          minimumNativeVersion: packageJson.desktopShell.minimumNativeVersion,
          generatedAt: new Date().toISOString(),
          entry: 'index.html',
          files,
        }
        await writeFile(
          resolve(desktopOutDir, SHELL_MANIFEST_FILENAME),
          `${JSON.stringify(manifest, null, 2)}\n`,
          'utf8'
        )
      },
    },
    viteTsConfigPaths({
      projects: [fileURLToPath(new URL('./tsconfig.json', import.meta.url))],
    }),
    tailwindcss(),
    viteReact(),
  ],
})
