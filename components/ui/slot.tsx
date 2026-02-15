"use client"

import * as React from "react"

type AnyProps = Record<string, unknown>

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(node)
      } else if (ref && typeof ref === "object") {
        ;(ref as React.MutableRefObject<T | null>).current = node
      }
    })
  }
}

function mergeProps(slotProps: AnyProps, childProps: AnyProps) {
  const merged: AnyProps = { ...slotProps, ...childProps }

  for (const key of Object.keys(childProps)) {
    if (key.startsWith("on") && typeof childProps[key] === "function" && typeof slotProps[key] === "function") {
      merged[key] = (...args: unknown[]) => {
        ;(childProps[key] as (...args: unknown[]) => void)(...args)
        ;(slotProps[key] as (...args: unknown[]) => void)(...args)
      }
    }
  }

  if (slotProps.className && childProps.className) {
    merged.className = [slotProps.className, childProps.className].filter(Boolean).join(" ")
  }

  if (slotProps.style && childProps.style) {
    merged.style = { ...(slotProps.style as React.CSSProperties), ...(childProps.style as React.CSSProperties) }
  }

  return merged
}

const SlotRoot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>(
  ({ children, ...slotProps }, forwardedRef) => {
    if (!React.isValidElement(children) || (children as React.ReactElement<any>).type == null) {
      return <>{children}</>
    }

    const child = children as React.ReactElement<any>
    const merged = mergeProps(slotProps, child.props)

    return React.cloneElement(child, {
      ...merged,
      ref: composeRefs((child as any).ref, forwardedRef),
    })
  }
)

SlotRoot.displayName = "SlotRoot"

const Slot = {
  Root: SlotRoot,
}

export { Slot, SlotRoot }
