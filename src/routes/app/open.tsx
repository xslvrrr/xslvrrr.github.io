import { createFileRoute } from "@tanstack/react-router"
import AppUniversalLinkPage from "../../screens/app/open"

export const Route = createFileRoute("/app/open")({
  component: AppUniversalLinkPage,
  headers: () => ({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  }),
  head: () => ({
    meta: [
      { title: "Open Millennium Desktop" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
})
