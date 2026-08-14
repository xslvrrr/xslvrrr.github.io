"use client"

import * as React from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip"

interface SimpleTooltipProps {
    children: React.ReactNode
    text: string
    position?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * A simple tooltip wrapper that provides legacy API compatibility
 * while using the Base UI tooltip under the hood.
 */
export function SimpleTooltip({
    children,
    text,
    position = 'right'
}: SimpleTooltipProps) {
    return (
        <Tooltip>
            <TooltipTrigger render={<div className="inline-flex" />}>
                {children}
            </TooltipTrigger>
            <TooltipContent side={position}>
                {text}
            </TooltipContent>
        </Tooltip>
    )
}

export default SimpleTooltip
