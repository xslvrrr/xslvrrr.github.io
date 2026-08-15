import { run, runViteBuild } from "./run-vite-build"

/**
 * Builds the deployable web application, then checks that the server it produced can resolve its
 * own imports.
 *
 * The verification step exists because the dependency tracer that fills the server's `node_modules`
 * is silent when it is wrong — see `scripts/verify-server-bundle.ts`. The heap ceiling the build
 * runs under is documented in `scripts/run-vite-build.ts`.
 */
await runViteBuild(process.argv.slice(2))
await run("bun", ["run", "scripts/verify-server-bundle.ts"])
