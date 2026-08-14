import { createFileRoute } from "@tanstack/react-router"
import AppOpenPage from "../screens/app-open"

export const Route = createFileRoute("/app-open/")({
  component: AppOpenPage,
  headers: () => ({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  }),
  head: () => ({
    meta: [
      { title: "Open Millennium Desktop" },
      { name: "description", content: "Open the Millennium desktop app." },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
})
