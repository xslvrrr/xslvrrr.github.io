import type { ReactNode } from "react"
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { useAnimationSettings } from "../../hooks/useAnimationSettings"
import { SessionProvider } from "../../start/session"
import appCss from "../../styles/globals.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Millennium" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-6 pt-16 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="mt-4 text-muted-foreground">The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
  component: RootComponent,
})

function RootComponent() {
  useAnimationSettings()

  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="dark">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
