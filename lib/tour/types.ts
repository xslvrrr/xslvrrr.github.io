export type TourKind = "full" | "update"

export type TourPlacement = "top" | "right" | "bottom" | "left" | "center"

export interface TourStep {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly target?: string
  readonly route?: string
  readonly placement?: TourPlacement
  readonly allowInteraction?: boolean
}

export interface TourDefinition {
  readonly id: string
  readonly kind: TourKind
  readonly version: number
  readonly title: string
  readonly description: string
  readonly steps: readonly TourStep[]
}

export type TourProgressStatus = "in-progress" | "completed" | "dismissed"

export interface TourProgress {
  readonly version: number
  readonly status: TourProgressStatus
  readonly stepId?: string
  readonly updatedAt: string
  readonly completedAt?: string
  readonly dismissedAt?: string
}

export interface TourPreferences {
  readonly schemaVersion: number
  readonly tours: Readonly<Record<string, TourProgress>>
}

export type TourMachineStatus = "idle" | TourProgressStatus

export interface TourMachineState {
  readonly status: TourMachineStatus
  readonly tourId: string | null
  readonly tourVersion: number | null
  readonly stepIndex: number
}

export type TourMachineEvent =
  | { readonly type: "START"; readonly tour: TourDefinition; readonly stepId?: string }
  | { readonly type: "NEXT"; readonly tour: TourDefinition }
  | { readonly type: "PREVIOUS"; readonly tour: TourDefinition }
  | { readonly type: "GO_TO"; readonly tour: TourDefinition; readonly stepId: string }
  | { readonly type: "COMPLETE" }
  | { readonly type: "DISMISS" }
  | { readonly type: "RESET" }

export interface TourStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}
