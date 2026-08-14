import { spawn } from "node:child_process"

/**
 * Runs the web build with a heap large enough for Nitro's server bundling pass.
 *
 * Nitro re-bundles the whole SSR graph through rollup to produce the deployable server, and that
 * pass needs more than Node's default old-space limit — it dies with "Ineffective mark-compacts
 * near heap limit" at 4 GB. The limit is set here rather than inline in the npm script so the
 * command stays identical on every platform, and rather than only in CI configuration so a local
 * `bun run build` behaves the same way the deployment does.
 *
 * If this number has to grow again, that is a signal to look at what is being pulled into the
 * server graph rather than to keep raising it: the two largest contributors were removed by making
 * the icon catalogues load on demand and by tracing server-only packages instead of bundling them.
 */
const MAX_OLD_SPACE_MB = 4096

const existing = process.env.NODE_OPTIONS ?? ""
const nodeOptions = existing.includes("--max-old-space-size")
  ? existing
  : `${existing} --max-old-space-size=${MAX_OLD_SPACE_MB}`.trim()

const child = spawn("vite", ["build", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

child.on("error", (error) => {
  console.error("[build:web] Could not start vite:", error)
  process.exit(1)
})
