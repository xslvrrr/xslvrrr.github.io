import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * Test configuration, deliberately separate from `vite.config.ts`.
 *
 * Vitest starts a Vite dev server, and without this file it would load the application config and
 * start the whole application pipeline with it, Nitro's dev environment included. Nitro's fetchable
 * dev environment cannot be constructed under Vitest and throws
 * `Cannot read properties of undefined (reading 'onMessage')` before a single test runs.
 *
 * Nothing under test needs that pipeline: these are plain module tests. Only the `@` alias is
 * carried over, because the modules themselves import through it. Test discovery is left at
 * Vitest's defaults so this file does not quietly change which tests run.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
})
