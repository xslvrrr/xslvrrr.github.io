import { Link as TanStackLink } from "@tanstack/react-router"
import type { AnchorHTMLAttributes, ReactNode } from "react"

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string
  children: ReactNode
  replace?: boolean
}

export function AppLink({ href, children, replace, ...props }: AppLinkProps) {
  const isInternal = href.startsWith("/") && !href.startsWith("//")

  if (isInternal) {
    return (
      <TanStackLink to={href} replace={replace} {...props}>
        {children}
      </TanStackLink>
    )
  }

  return (
    <a href={href} {...props}>
      {children}
    </a>
  )
}
