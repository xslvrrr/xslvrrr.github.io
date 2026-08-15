import { tanstackConfig } from "@tanstack/eslint-config"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  ...tanstackConfig,
  {
    ignores: [
      // Build output. Both are gitignored, so on CI they are simply absent, but after a local
      // `bun run build:web` they hold the emitted bundles — including a 10 MB icon chunk — and
      // linting them exhausts ESLint's heap and aborts the run.
      ".nitro/**",
      ".output/**",
      ".tanstack/**",
      "dist/**",
      "hooks/use-mobile.tsx",
      "node_modules/**",
      // Generated desktop UI shell published for installed desktop packages.
      "public/desktop-shell/**",
      "src-tauri/target/**",
      "src/routeTree.gen.ts",
      "tailwind.config.ts",
    ],
  },
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "import/consistent-type-specifier-style": "off",
      "import/first": "off",
      "import/order": "off",
      "no-case-declarations": "off",
      "no-shadow": "off",
      "prefer-const": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      "sort-imports": "off",
    },
  },
  {
    files: ["extension/**/*.js", "extension-firefox/**/*.js", "**/*.test.js"],
    languageOptions: {
      globals: {
        browser: "readonly",
        chrome: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off",
    },
  },
]
