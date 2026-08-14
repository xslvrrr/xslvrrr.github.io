import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  "aria-label": ariaLabel,
  defaultValue,
  value,
  min = 0,
  max = 100,
  disabled,
  ...props
}: SliderPrimitive.Root.Props) {
  // A scalar value is one thumb. Falling through to `[min, max]` rendered a second, valueless
  // thumb that Base UI positions from an out-of-range index, so it landed off the track.
  const _values = Array.isArray(value)
    ? value
    : typeof value === "number"
      ? [value]
      : Array.isArray(defaultValue)
        ? defaultValue
        : typeof defaultValue === "number"
          ? [defaultValue]
          : [min, max]

  // A caller can legitimately compute a range that collapses (two attendance thresholds one point
  // apart leave the middle slider with min === max). Base UI positions the thumb from
  // (value - min) / (max - min), which is NaN there and takes the whole control off screen, so the
  // track is widened by a point and the control disabled instead.
  const hasRange = max > min
  const resolvedMax = hasRange ? max : min + 1

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      aria-label={ariaLabel}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={resolvedMax}
      disabled={disabled ?? !hasRange}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-1.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            index={index}
            getAriaLabel={typeof ariaLabel === "string"
              ? (thumbIndex) => _values.length > 1 ? `${ariaLabel} ${thumbIndex + 1}` : ariaLabel
              : undefined}
            className="relative block size-6 shrink-0 rounded-full border bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] select-none hover:ring-4 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
