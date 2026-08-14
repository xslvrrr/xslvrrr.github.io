import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"
import { IconMinus, IconPlus } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

/**
 * A number input with its own increment and decrement controls.
 *
 * Built on the Base UI primitive rather than a bare `<input type="number">` so the steppers are
 * always visible and hit-target sized. The browser's native spinners are tiny, hidden until hover
 * in most engines, and absent entirely on touch — which makes a year range something you can only
 * type rather than nudge, and nudging is what a year range is for.
 */
interface NumberFieldProps {
  value: number | null
  onValueChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  id?: string
  "aria-label"?: string
  className?: string
}

export function NumberField({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  placeholder,
  id,
  className,
  ...props
}: NumberFieldProps) {
  return (
    <NumberFieldPrimitive.Root
      id={id}
      value={value}
      onValueChange={(next) => onValueChange(next ?? null)}
      min={min}
      max={max}
      step={step}
      className={cn("inline-flex", className)}
    >
      <NumberFieldPrimitive.Group className="flex items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <NumberFieldPrimitive.Decrement
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-l-md text-muted-foreground",
            "transition-colors hover:bg-muted hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          aria-label="Decrease"
        >
          <IconMinus className="size-3.5" />
        </NumberFieldPrimitive.Decrement>

        <NumberFieldPrimitive.Input
          placeholder={placeholder}
          aria-label={props["aria-label"]}
          className={cn(
            "h-8 w-14 min-w-0 border-x border-input bg-transparent text-center text-sm tabular-nums",
            "outline-none placeholder:text-muted-foreground",
          )}
        />

        <NumberFieldPrimitive.Increment
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-r-md text-muted-foreground",
            "transition-colors hover:bg-muted hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          aria-label="Increase"
        >
          <IconPlus className="size-3.5" />
        </NumberFieldPrimitive.Increment>
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  )
}
