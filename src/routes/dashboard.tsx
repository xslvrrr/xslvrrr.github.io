import { createFileRoute } from "@tanstack/react-router"
import DashboardPage from "../screens/dashboard"

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard - Millennium" },
      { name: "description", content: "Your Millennium dashboard." },
    ],
  }),
})
