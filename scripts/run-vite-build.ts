import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { delimiter, dirname, join } from "node:path"
import { existsSync, readdirSync } from "node:fs"

/**
 * Runs a Vite build with a heap ceiling that does not depend on the machine it lands on.
 *
 * Node sizes its old space from total system memory, so the same build gets roughly 4 GB on a
 * development machine and roughly 2 GB on Vercel's 8 GB, 2-core build container — the two places
 * this has to work. Left implicit, that difference is invisible until the container kills the
 * build with SIGKILL, which is what happened to the desktop shell pass: it had no ceiling at all
 * while the web pass set one, so only one of the two behaved the same in both places.
 *
 * The ceiling is set here rather than inline in the package scripts so the command stays identical
 * on every platform, and rather than only in CI configuration so a local build behaves the way the
 * deployment does.
 *
 * The number is measured, not guessed. All three Vite environments of the web build run in one
 * process and none of them releases its module graph when the next begins, so the live set is the
 * sum rather than the maximum. Measured with a forced full collection at each pass boundary:
 *
 *   after the client pass   1.65 GB live
 *   after the SSR pass      2.89 GB live
 *   peak, in the Nitro pass 3.77 GB live   (peak RSS about 3.3 GB)
 *
 * 4096 MB left roughly 300 MB of headroom over that peak, which is not enough for V8 to work in:
 * the Nitro pass never ran out of memory and never threw, it simply spent every millisecond in
 * mark-compact, printed `transforming...` and stopped making progress, and Vercel ended the build
 * 45 minutes later. A build that hangs where a build that fails would be diagnosable in seconds.
 *
 * 6144 MB is above the peak by enough that V8 collects normally; the build then completes in about
 * a minute. It does not make the build use more memory — a ceiling is a limit, not a reservation,
 * and peak RSS is unchanged — so it stays well inside the container's 8 GB.
 *
 * The build container is not more frugal than a laptop, so 4096 MB would not have been enough there
 * even had it been applied. Measured on Vercel at this ceiling: 1.68 GB after the client pass,
 * 2.67 GB after the SSR pass, 4.53 GB at the peak of the Nitro pass — 400 MB past the old ceiling,
 * on a build that finished in three minutes.
 */
export const MAX_OLD_SPACE_MB = 6144

/**
 * The smallest heap the web build is known to complete in.
 *
 * `vite.config.ts` refuses to start a production build under a ceiling below this, so running the
 * build without this wrapper — where Node infers a ceiling from the machine — fails immediately and
 * says why, instead of reproducing the mark-compact hang described above.
 */
export const MINIMUM_HEAP_CEILING_MB = 5120

/**
 * Bun's stand-in for `node`, which it puts on `PATH` when a script is run with `--bun`.
 *
 * Running `vite` by name reaches Bun rather than Node in two different ways, and this is the first:
 * with `--bun`, `node` on `PATH` is Bun, so is every `#!/usr/bin/env node` shebang in
 * `node_modules/.bin`, and Vite runs on JavaScriptCore. The second is Bun executing such a shebang
 * itself when there is no Node to hand it to, which is what the deployment does.
 *
 * Either way `NODE_OPTIONS=--max-old-space-size` is accepted and ignored — it is a V8 flag — so the
 * ceiling below was being set on every build and applied on none of them, and the deployment was the
 * one build silently running without it. Locally the same command finds Node and honours it, which
 * is most of why the deployment and a local build disagreed about a build that hangs.
 *
 * The directory is created per run (`/tmp/bun-node-5eb2145b3`), so it is matched by shape.
 */
const BUN_NODE_SHIM_DIRECTORY = /(^|[/\\])bun-node-[^/\\]*$/

/**
 * Runs the Vite CLI on Node, with the heap ceiling applied, whatever runtime called this.
 *
 * The ceiling is passed on the command line rather than through `NODE_OPTIONS` so it cannot be
 * dropped by a runtime that parses that variable and discards what it does not implement, and the
 * child gets a `PATH` with Bun's shim directory removed so anything Vite itself spawns is also Node.
 */
export function runViteBuild(args: string[]): Promise<void> {
  const path = pathWithoutBunNodeShim()
  const node = resolveNodeExecutable(path)
  const viteCli = resolveViteCli()

  return run(
    node,
    [`--max-old-space-size=${MAX_OLD_SPACE_MB}`, viteCli, "build", ...args],
    { PATH: path }
  )
}

/**
 * The Vite CLI's real path.
 *
 * Resolved from the package rather than run as the `vite` command, because `node_modules/.bin/vite`
 * is a `#!/usr/bin/env node` shebang and that is exactly the indirection Bun's shim takes over. The
 * CLI is reached through `package.json` because Vite's export map does not publish `./bin/vite.js`.
 */
function resolveViteCli(): string {
  const manifest = createRequire(import.meta.url).resolve("vite/package.json")
  return join(dirname(manifest), "bin", "vite.js")
}

function pathWithoutBunNodeShim(): string {
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry && !BUN_NODE_SHIM_DIRECTORY.test(entry))
    .join(delimiter)
}

/**
 * Where Node lives when `PATH` does not say.
 *
 * On Vercel it does not. Its `PATH` is `…:/usr/bin:/bun1:/node1/bin` and none of those directories
 * holds a `node`, which is why Bun ended up interpreting the Vite CLI itself. These are the standard
 * install locations, checked in the order a shell would have found them.
 */
const NODE_FALLBACK_PATHS = ["/usr/local/bin/node", "/usr/bin/node", "/bin/node", "/opt/bin/node"]

/**
 * The Node binary to run Vite with, or an explanation of everywhere that was looked.
 *
 * `NODE_BINARY` is honoured first so a container that keeps Node somewhere unusual can say so
 * without this list having to grow.
 */
function resolveNodeExecutable(path: string): string {
  const override = process.env.NODE_BINARY
  if (override) {
    if (existsSync(override)) return override
    throw new Error(`NODE_BINARY is set to \`${override}\`, which does not exist.`)
  }

  const filename = process.platform === "win32" ? "node.exe" : "node"
  const directories = [...new Set(path.split(delimiter).filter(Boolean))]

  for (const directory of directories) {
    const candidate = join(directory, filename)
    if (existsSync(candidate)) return candidate
  }

  for (const candidate of NODE_FALLBACK_PATHS) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(
    "No `node` to run Vite with.\n"
    + "This build runs Vite on Node so it can be given a heap ceiling; see MAX_OLD_SPACE_MB in "
    + "scripts/run-vite-build.ts for why it needs one. Bun's `node` shim is not one and was "
    + "excluded from the search.\n"
    + `Searched: ${[...directories, ...NODE_FALLBACK_PATHS].join(", ")}\n`
    + `Node-like entries in those directories: ${describeNodeLikeEntries(directories)}\n`
    + "Set NODE_BINARY to a Node executable to resolve this directly."
  )
}

/**
 * What the searched directories actually hold, for the failure message.
 *
 * A list of places that did not have `node` says nothing about why. On Vercel the PATH contains a
 * `/node1/bin` that a build is entitled to assume holds Node, and finding out what is in it instead
 * is otherwise a deployment per guess.
 */
function describeNodeLikeEntries(directories: string[]): string {
  const found = directories.flatMap((directory) => {
    if (!existsSync(directory)) return [`${directory} (missing)`]

    try {
      const matches = readdirSync(directory).filter((entry) => entry.toLowerCase().includes("node"))
      return matches.length > 0 ? [`${directory}: ${matches.join(" ")}`] : []
    } catch (error) {
      return [`${directory} (unreadable: ${(error as Error).message})`]
    }
  })

  return found.length > 0 ? found.join("; ") : "none"
}

export function run(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: env ? { ...process.env, ...env } : process.env,
    })

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal)
        return
      }
      if (code === 0) {
        resolvePromise()
        return
      }
      process.exit(code ?? 1)
    })

    child.on("error", (error) => {
      console.error(`[build] Could not start ${command}:`, error)
      rejectPromise(error)
    })
  })
}
