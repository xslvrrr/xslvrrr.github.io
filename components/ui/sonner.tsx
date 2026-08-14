"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { IconCircleCheck, IconInfoCircle, IconAlertTriangle, IconAlertOctagon, IconLoader } from "@tabler/icons-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<"light" | "dark">("dark")

  useEffect(() => {
    const root = document.documentElement
    const syncTheme = () => {
      setTheme(root.dataset.theme === "light" || root.classList.contains("light") ? "light" : "dark")
    }
    const observer = new MutationObserver(syncTheme)

    syncTheme()
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] })

    return () => observer.disconnect()
  }, [])

  const {
    toastOptions,
    style,
    ...rest
  } = props

  return (
    <Sonner
      theme={theme}
      visibleToasts={3}
      className="toaster group"
      icons={{
        success: (
          <IconCircleCheck className="size-4" />
        ),
        info: (
          <IconInfoCircle className="size-4" />
        ),
        warning: (
          <IconAlertTriangle className="size-4" />
        ),
        error: (
          <IconAlertOctagon className="size-4" />
        ),
        loading: (
          <IconLoader className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "min(92vw, 460px)",
          ...style,
        } as CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: `cn-toast !mx-auto !w-[min(92vw,460px)] !justify-start !text-left !shadow-lg !backdrop-blur-none ${toastOptions?.classNames?.toast || ""}`,
          actionButton: "!bg-[var(--hover-bg)] !text-[var(--text-primary)] !border !border-[var(--border-color)] hover:!bg-[var(--active-bg)]",
        },
      }}
      {...rest}
    />
  )
}

export { Toaster }
