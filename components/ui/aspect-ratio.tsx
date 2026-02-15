"use client"

import * as React from "react"

type AspectRatioProps = React.ComponentPropsWithoutRef<"div"> & {
  ratio?: number
}

function AspectRatio({ ratio = 1, style, ...props }: AspectRatioProps) {
  return (
    <div
      data-slot="aspect-ratio"
      style={{ aspectRatio: String(ratio), ...style }}
      {...props}
    />
  )
}

export { AspectRatio }
