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
