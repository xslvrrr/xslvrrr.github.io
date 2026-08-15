import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize, resolve, sep } from "node:path"
import { defineConfig, type Plugin } from "vite"
import { fileURLToPath, URL } from "node:url"
import { getHeapStatistics } from "node:v8"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { nitro } from "nitro/vite"
import { runtimeDependencies as nitroRuntimeDependencies } from "nitro/runtime/meta"
import { createRequire } from "node:module"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { MINIMUM_HEAP_CEILING_MB } from "./scripts/run-vite-build"

/**
 * Packages the server bundle must contain rather than import from disk at runtime.
 *
 * Turning `nitro.noExternals` off lets the server pass leave `node_modules` alone, which is what
 * makes the build finish, but it externalizes packages Nitro's own dependency tracer then declines
 * to copy — the tracer is told to inline its runtime, so it never traces it. A deployed function
 * has no `node_modules` above it to fall back to, so anything in this position resolves to nothing.
 *
 * These are bundled instead of traced: Nitro's runtime, and the renderer, which is the one
 * dependency the SSR chunks import by name rather than carry.
 */
/**
 * How the deployable server is produced.
 *
 * `noExternals` is the setting that decides whether the production build fits on a build machine.
 * Nitro's Vite plugin pins `resolve.noExternal` to `true` for the `nitro` environment unless this
 * is exactly `false`, which means the server pass re-bundles every package the SSR graph touches —
 * React, the router, Base UI, dnd-kit, motion, the icon libraries, all of it — on top of the SSR
 * chunks that pass has already produced. That is what exhausted the build: the pass climbed past a
 * 4 GB heap and spent the rest of a 45-minute window in mark-compact, and Vercel ended it with
 * `BUILD_EXCEEDED_MAXIMUM_TIME`.
 *
 * With it off, Nitro traces `node_modules` with `nf3` and copies what the server actually imports
 * into the output instead. The packages still ship; they are no longer parsed, bound and re-emitted
 * by rollup. The pass goes from thousands of modules to ~130.
 *
 * `sourceMap` defaults to `true` and costs a second full serialization of every server chunk, for
 * stack traces nobody reads off a serverless function. `minify` buys nothing on a server bundle
 * that is never sent over the wire.
 *
 * This is handed to the plugin *and* set as the top level `nitro` key because the plugin resolves
 * them as `defu(pluginConfig.config, userConfig.nitro)` — the plugin argument wins, and unlike the
 * top level key it does not depend on Vite's `UserConfig` module augmentation being picked up.
 */
const nitroVersion: string = createRequire(import.meta.url)("nitro/package.json").version

const NITRO_SERVER_PASS = {
  noExternals: false,
  sourceMap: false,
  minify: false,
} as const

/**
 * Refuses to start a server pass that is going to re-bundle every dependency.
 *
 * The whole build hinges on one boolean that lives inside a dependency's plugin, and when it fails
 * to apply nothing says so: the pass sits on `transforming...` and the build is killed 45 minutes
 * later for exceeding its time limit, with a log that looks exactly like a slow machine. That has
 * now cost several build windows.
 *
 * `resolve.noExternal === true` on the `nitro` environment is that failure, and it is knowable
 * before a single module is transformed, so fail there instead — in seconds, naming the cause. The
 * Nitro version is reported with it because this config depends on a branch in `nitro/vite` that
 * reads `noExternals === false`, and a build resolving a different Nitro would drop these settings
 * silently.
 */
function requireTracedServerDependencies(): Plugin {
  return {
    name: "millennium-require-traced-server-dependencies",
    apply: "build",
    configResolved(config) {
      const noExternal = config.environments?.nitro?.resolve?.noExternal
      const summary = Array.isArray(noExternal) ? `${noExternal.length} entries` : String(noExternal)
      console.info(
        `[build] nitro ${nitroVersion}, server pass resolve.noExternal: ${summary}`
      )

      if (noExternal === true) {
        throw new Error(
          "The Nitro server pass is configured to bundle every dependency "
          + `(resolve.noExternal === true) under nitro ${nitroVersion}.\n`
          + "This build would re-bundle the entire SSR dependency graph, take longer than the "
          + "45 minute limit on a Vercel build container, and be killed with no explanation.\n"
          + "`nitro.noExternals: false` is not reaching the plugin — check that the installed "
          + "nitro is the version this config targets."
        )
      }
    },
  }
}

/**
 * Refuses to start a production build that has no room to finish, and reports what each pass costs.
 *
 * The three environments of this build run in one process and none of them releases its module
 * graph when the next begins, so the live set is their sum: 1.65 GB after the client pass, 2.89 GB
 * after the SSR pass, 3.77 GB at the peak of the Nitro pass. Under a ceiling close to that peak
 * nothing fails — V8 keeps collecting, finds almost nothing, and the pass sits on `transforming...`
 * until the build is killed for exceeding its time limit. That is a whole build window spent on a
 * log that reads like a slow machine.
 *
 * So it is checked before the first module is read. `scripts/run-vite-build.ts` sets the ceiling
 * this needs; the check is here because this is what a bare `vite build`, an editor integration, or
 * a future script that forgets the wrapper actually loads.
 *
 * A ceiling can only be set on Node, so a runtime that is not Node is refused rather than measured.
 * Vercel starts the build with `bun run --bun`, which makes every `node` on `PATH` Bun: Bun accepts
 * `--max-old-space-size` and ignores it, and its `node:v8` shim answers with a number that describes
 * nothing — 1708 MB on the container, 228 MB on a laptop with 64 GB. Believing it produced a build
 * that failed the check it should have passed, which is the reverse of the mistake but the same
 * cause: the deployment was running a different runtime than every local build.
 *
 * The per-pass figures are printed for the same reason. If this build ever runs out of room again,
 * the log says which pass was holding what rather than leaving it to be measured from scratch.
 */
function requireHeapForProductionBuild(): Plugin {
  const mb = (bytes: number) => Math.round(bytes / 1024 / 1024)
  const report = (label: string) => {
    const { used_heap_size: used, heap_size_limit: limit } = getHeapStatistics()
    console.info(`[build] ${label}: heap ${mb(used)} MB of ${mb(limit)} MB`)
  }

  return {
    name: "millennium-require-heap-for-production-build",
    apply: "build",
    configResolved() {
      if (process.versions.bun) {
        throw new Error(
          `This build is running on Bun ${process.versions.bun} and has to run on Node.\n`
          + "It needs a heap ceiling of at least "
          + `${MINIMUM_HEAP_CEILING_MB} MB — see MAX_OLD_SPACE_MB in scripts/run-vite-build.ts — `
          + "and `--max-old-space-size` is a V8 flag that Bun accepts and does not act on.\n"
          + "`bun run build:web` runs the Vite CLI on Node for this reason. Reaching this means "
          + "something started Vite directly under Bun, such as `bun run --bun vite build`, which "
          + "is how Vercel invokes package scripts."
        )
      }

      const ceilingMb = mb(getHeapStatistics().heap_size_limit)
      if (ceilingMb < MINIMUM_HEAP_CEILING_MB) {
        throw new Error(
          `This build needs a heap ceiling of at least ${MINIMUM_HEAP_CEILING_MB} MB and has `
          + `${ceilingMb} MB.\n`
          + "Its peak live set is about 3.8 GB, and under a ceiling near that the Nitro pass does "
          + "not fail — it stops making progress in mark-compact and the build is eventually "
          + "killed for running too long.\n"
          + "Run `bun run build:web`, which sets the ceiling, or pass "
          + "`--max-old-space-size` in NODE_OPTIONS."
        )
      }
    },
    buildStart() {
      report(`${this.environment.name} pass start`)
    },
    closeBundle() {
      report(`${this.environment.name} pass end`)
    },
  }
}

const SERVER_BUNDLED_DEPENDENCIES = [...nitroRuntimeDependencies, "react", "react-dom"]
const serverBundledDependencyPattern = new RegExp(
  `^(${SERVER_BUNDLED_DEPENDENCIES
    .map((name) => name.replaceAll(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`))
    .join("|")})(/|$)`
)

const SHELL_MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

/**
 * Serves `/desktop-shell/*` from the freshly built desktop bundle during development.
 *
 * Installed desktop packages fetch their UI from the backend origin they were compiled against,
 * which for engineering builds is this server. Without this, that request falls through to
 * `public/desktop-shell/`, a directory only regenerated by a full `bun run build:web` — so an
 * installed app kept rendering whatever shell happened to be committed to the public directory
 * and could never match the site being served. `bun run build:desktop:ui` is now enough.
 */
function desktopShellDevServer(): Plugin {
  const shellRoot = fileURLToPath(new URL("./dist/desktop", import.meta.url))

  return {
    name: "millennium-desktop-shell-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const rawUrl = request.url || "/"
        if (!rawUrl.startsWith("/desktop-shell/")) return next()

        const requestedPath = decodeURIComponent(rawUrl.split("?")[0]).slice("/desktop-shell/".length)
        const target = resolve(shellRoot, normalize(requestedPath))
        if (target !== shellRoot && !target.startsWith(shellRoot + sep)) {
          response.statusCode = 400
          response.end("Invalid shell path")
          return
        }
        if (!existsSync(target) || !statSync(target).isFile()) return next()

        response.setHeader(
          "Content-Type",
          SHELL_MIME_TYPES[extname(target).toLowerCase()] || "application/octet-stream"
        )
        response.setHeader("Cache-Control", "no-store")
        createReadStream(target).pipe(response)
      })
      server.watcher.add(join(shellRoot, "shell.json"))
    },
  }
}

export default defineConfig({
  optimizeDeps: {
    // Portal sync runs exclusively on the server. Prebundling these packages
    // for browser targets makes esbuild reject yargs' Node.js ESM/CJS interop
    // export (`module.exports`).
    exclude: ["puppeteer-core", "@puppeteer/browsers", "yargs", "jsdom"],
  },
  server: {
    host: "localhost",
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: "localhost",
    port: 3000,
    strictPort: true,
  },
  ssr: {
    noExternal: ["@lobehub/icons"],
    /**
     * Server-only packages the deployment traces rather than bundles.
     *
     * Nitro inlines node_modules into the server bundle by default. For these that is pure cost:
     * jsdom (with parse5 and friends), Puppeteer, Stripe and the Supabase client are large, are
     * reached only from portal sync and the API routes, and are perfectly happy being required at
     * runtime. Bundling them put an 11 MB chunk through rollup and is most of what made the
     * production build run out of memory.
     */
    external: [
      "jsdom",
      "puppeteer-core",
      "@puppeteer/browsers",
      "stripe",
      "@supabase/supabase-js",
    ],
  },
  nitro: NITRO_SERVER_PASS,
  /**
   * Vite copies `publicDir` into every environment's output directory, and the server
   * environments' output directory is the deployed function. That put a second copy of everything
   * under `public/` — the 18 MB desktop shell on the deployment, 239 MB of installers on a working
   * tree that still has them — inside `functions/__fallback.func`, which the function never reads:
   * `config.json` puts a `filesystem` handler ahead of the fallback route, so static files are
   * answered from `.vercel/output/static` by the edge and never reach the server at all.
   *
   * Nitro writes the static directory itself, from the same `public/`, so nothing is lost.
   */
  environments: {
    ssr: {
      build: { copyPublicDir: false },
    },
    nitro: {
      build: { copyPublicDir: false },
      resolve: { noExternal: serverBundledDependencyPattern },
    },
  },
  build: {
    // Keep generated bundles distinct from the public /Assets brand directory.
    // macOS treats `assets` and `Assets` as the same path, which previously
    // replaced one directory with the other and broke CSS/chunk requests.
    assetsDir: "_app-assets",
    chunkSizeWarningLimit: 1000,
    /**
     * Vite gzips every emitted chunk purely to print a number next to it. The icon catalogues are
     * a 10.7 MB chunk, so that is a 10.7 MB buffer plus a full zlib pass held alongside the chunk
     * rollup is already holding — during the phase where peak memory is decided. The build machine
     * has 8 GB and was killed with SIGKILL for exceeding it.
     */
    reportCompressedSize: false,
    rollupOptions: {
      onLog(level, log, defaultHandler) {
        const isDependency = typeof log.id === "string" && log.id.includes("node_modules/")

        if (level === "warn" && log.code === "UNUSED_EXTERNAL_IMPORT" && isDependency) {
          return
        }

        // `@hugeicons/core-free-icons` ships one module per icon, each with a `/*#__PURE__*/`
        // comment rollup will not read, so every icon in the graph produces a five-line warning.
        // On the deployment that was thousands of lines of log written down a pipe on a build
        // machine with two cores, describing a dependency this repository cannot fix.
        if (level === "warn" && log.code === "INVALID_ANNOTATION" && isDependency) {
          return
        }

        defaultHandler(level, log)
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  plugins: [
    desktopShellDevServer(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),

    tanstackStart(),
    nitro({ config: NITRO_SERVER_PASS }),
    viteReact(),
    requireTracedServerDependencies(),
    requireHeapForProductionBuild(),
  ],
})
