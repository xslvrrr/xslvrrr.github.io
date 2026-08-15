import { createElement, Suspense, lazy } from "react"
import type { ComponentType } from "react"

type DynamicOptions = {
  loading?: ComponentType
  ssr?: boolean
}

/**
 * Loads a component when it is first rendered rather than when the module graph is built.
 *
 * The generic is the component itself rather than its props, so the returned component keeps the
 * exact prop types of the one being loaded. Inferring the props directly collapsed them to `object`
 * as soon as the loader used `.then()` to pick a named export, which silently turned every prop
 * into a type error at the call site.
 */
export function dynamic<TComponent extends ComponentType<any>>(
  loader: () => Promise<{ default: TComponent }>,
  options: DynamicOptions = {}
): TComponent {
  const LazyComponent = lazy(loader)
  const Loading = options.loading

  function DynamicComponent(props: React.ComponentProps<TComponent>) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        {createElement(LazyComponent as unknown as ComponentType<any>, props)}
      </Suspense>
    )
  }

  return DynamicComponent as unknown as TComponent
}
