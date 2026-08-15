/**
 * Fails the build when the deployable server imports a package that is not shipped beside it.
 *
 * The server bundle leaves `node_modules` alone and lets Nitro's tracer copy the packages it
 * actually needs into the output. That tracer is the part of the pipeline most likely to be wrong:
 * a package it declines to copy still produces a working build, a working `.output`, and a server
 * that starts — the import only fails when a request reaches the code path that needs it. On a
 * deployed function there is no `node_modules` above the output directory to fall back on either,
 * so a miss that goes unnoticed locally is a production error on every request.
 *
 * This walks the emitted server, collects every bare import specifier and asserts each one either
 * is a Node builtin or exists in the output's own `node_modules`.
 */
import { isBuiltin } from "node:module"
import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath, URL } from "node:url"
import { join, resolve } from "node:path"

/** Both presets this repository builds: `node-server` locally, `vercel` on the deployment. */
const SERVER_DIRECTORIES = [
  "../.output/server",
  "../.vercel/output/functions/__fallback.func",
]

const IMPORT_PATTERNS = [
  /(?:^|[\n;])\s*import\s+[^'"()\n]*?['"]([^'"\n]+)['"]/g,
  /(?:^|[\n;])\s*export\s+[^'"()\n]*?\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g,
]

/** Specifiers the runtime resolves without a package directory. */
function isBareSpecifier(specifier: string): boolean {
  if (!specifier || /^[./#]/.test(specifier)) return false
  // Interpolated or otherwise computed strings are not specifiers this can check.
  if (/[\s`]|\$\{/.test(specifier)) return false
  return !/^[a-z][a-z0-9+.-]*:/i.test(specifier)
}

/** `@scope/name/deep/path` and `name/deep/path` both belong to the package that must be present. */
function packageNameOf(specifier: string): string {
  const segments = specifier.split("/")
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]
}

async function collectScripts(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const collected: string[] = []

  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      // The traced packages are the answer to this question, not part of the question.
      if (entry.name === "node_modules") continue
      collected.push(...(await collectScripts(path)))
      continue
    }
    if (entry.isFile() && /\.(mjs|js|cjs)$/.test(entry.name)) collected.push(path)
  }

  return collected
}

async function verify(serverDir: string): Promise<string[]> {
  const scripts = await collectScripts(serverDir)
  const imported = new Map<string, string>()

  for (const script of scripts) {
    const source = await readFile(script, "utf8")
    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]
        if (!isBareSpecifier(specifier)) continue
        const name = packageNameOf(specifier)
        if (!imported.has(name)) imported.set(name, script)
      }
    }
  }

  const missing: string[] = []
  for (const [name, firstSeenIn] of imported) {
    if (isBuiltin(name)) continue
    if (existsSync(join(serverDir, "node_modules", name))) continue
    missing.push(`${name} (imported by ${firstSeenIn.slice(serverDir.length + 1)})`)
  }

  return missing.sort()
}

async function main(): Promise<void> {
  const built = SERVER_DIRECTORIES
    .map((directory) => fileURLToPath(new URL(directory, import.meta.url)))
    .filter((directory) => existsSync(directory))

  if (built.length === 0) {
    throw new Error("No server output to verify. Run the build first.")
  }

  let failed = false
  for (const serverDir of built) {
    const missing = await verify(serverDir)
    if (missing.length === 0) {
      console.info(`[verify-server-bundle] ${serverDir}: every imported package is present.`)
      continue
    }

    failed = true
    console.error(
      `[verify-server-bundle] ${serverDir} imports ${missing.length} package(s) that are neither `
      + `bundled into it nor traced beside it:\n  ${missing.join("\n  ")}\n\n`
      + "Add them to SERVER_BUNDLED_DEPENDENCIES in vite.config.ts so the server pass inlines them, "
      + "or to ssr.external so the tracer copies them."
    )
  }

  if (failed) process.exit(1)
}

await main()
