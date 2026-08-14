import { createElement, Suspense, lazy } from "react"
import type { ComponentType } from "react"

type Loader<TProps> = () => Promise<{ default: ComponentType<TProps> }>
type DynamicOptions = {
  loading?: ComponentType
  ssr?: boolean
}

export function dynamic<TProps extends object>(loader: Loader<TProps>, options: DynamicOptions = {}) {
  const LazyComponent = lazy(loader)
  const Loading = options.loading

  return function DynamicComponent(props: TProps) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        {createElement(LazyComponent as unknown as ComponentType<TProps>, props)}
      </Suspense>
    )
  }
}
