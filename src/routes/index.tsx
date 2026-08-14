import { createFileRoute } from "@tanstack/react-router"
import HomePage from "../screens/index"

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Millennium" },
      { name: "description", content: "A modern student portal for timetable, notifications, reports, and school workflows." },
    ],
  }),
})
