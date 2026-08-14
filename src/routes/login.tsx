import { createFileRoute } from "@tanstack/react-router"
import LoginPage from "../screens/login"

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Log In - Millennium" },
      { name: "description", content: "Sign in to your Millennium student portal." },
    ],
  }),
})
