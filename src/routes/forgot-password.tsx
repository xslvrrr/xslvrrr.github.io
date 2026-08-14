import { createFileRoute } from "@tanstack/react-router"
import ForgotPasswordPage from "../screens/forgot-password"

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({
    meta: [
      { title: "Forgot Password - Millennium" },
      { name: "description", content: "Reset your Millennium portal password." },
    ],
  }),
})
