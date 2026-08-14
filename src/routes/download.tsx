import { createFileRoute } from "@tanstack/react-router"
import DownloadPage from "../screens/download"

export const Route = createFileRoute("/download")({
  component: DownloadPage,
  head: () => ({
    meta: [
      { title: "Introducing Millennium for desktop" },
      { name: "description", content: "A faster, calmer way to keep school in view—even when the connection drops." },
    ],
  }),
})
