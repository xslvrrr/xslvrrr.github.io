import { spawn } from "node:child_process"

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
 * sum rather than the maximum: the build fails outright at 2048 MB during the SSR pass and at
 * 3072 MB during the Nitro pass, and peaks at about 3.5 GB. Lowering it means reducing what those
 * passes retain, not editing this constant.
 */
export const MAX_OLD_SPACE_MB = 4096

export function runViteBuild(args: string[]): Promise<void> {
  const existing = process.env.NODE_OPTIONS ?? ""
  const nodeOptions = existing.includes("--max-old-space-size")
    ? existing
    : `${existing} --max-old-space-size=${MAX_OLD_SPACE_MB}`.trim()

  return run("vite", ["build", ...args], { NODE_OPTIONS: nodeOptions })
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
