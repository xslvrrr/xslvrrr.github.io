import { runViteBuild } from "./run-vite-build"

/**
 * Builds the desktop UI shell.
 *
 * This is the same application as the web build and costs the same to compile, and it runs first
 * on the same 8 GB build container. It goes through the shared runner so it gets the same explicit
 * heap ceiling rather than whatever Node infers from the machine it happens to be on.
 */
await runViteBuild(["--config", "vite.desktop.config.ts", ...process.argv.slice(2)])
