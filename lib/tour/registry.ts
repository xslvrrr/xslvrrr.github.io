import type { TourDefinition } from "./types"
import {
  FULL_TOUR_ID,
  FULL_TOUR_VERSION,
  UPDATE_TOUR_ID,
  UPDATE_TOUR_VERSION,
} from "./versions"

export const fullTourRegistry = {
  id: FULL_TOUR_ID,
  kind: "full",
  version: FULL_TOUR_VERSION,
  title: "Welcome to Millennium",
  description: "A guided introduction to your dashboard.",
  steps: [
    {
      id: "welcome",
      title: "Welcome",
      description: "Take a quick tour of the tools available in your dashboard.",
      placement: "center",
    },
    {
      id: "navigation",
      title: "Navigate your dashboard",
      description: "Use the sidebar to move between your home, timetable, calendar, and more.",
      target: '[data-tour="dashboard-navigation"]',
      placement: "right",
    },
    {
      id: "home",
      title: "Your home",
      description: "See your most important school information in one place.",
      target: '[data-tour="dashboard-home"]',
      route: "/dashboard/home",
      placement: "bottom",
    },
    {
      id: "assistant",
      title: "Ask the assistant",
      description: "Get help finding and understanding information from your dashboard.",
      target: '[data-tour="dashboard-assistant"]',
      placement: "left",
      allowInteraction: true,
    },
    {
      id: "preferences",
      title: "Make it yours",
      description: "Adjust dashboard behaviour and appearance from preferences.",
      target: '[data-tour="dashboard-preferences"]',
      placement: "right",
    },
  ],
} as const satisfies TourDefinition

export const updateTourRegistry = {
  id: UPDATE_TOUR_ID,
  kind: "update",
  version: UPDATE_TOUR_VERSION,
  title: "What is new",
  description: "A short overview of the latest dashboard experience.",
  steps: [
    {
      id: "updated-home",
      title: "An updated home",
      description: "Your home is more flexible and keeps key information within reach.",
      target: '[data-tour="dashboard-home"]',
      route: "/dashboard/home",
      placement: "bottom",
    },
    {
      id: "assistant",
      title: "Meet the assistant",
      description: "Use the assistant to work with information across your dashboard.",
      target: '[data-tour="dashboard-assistant"]',
      placement: "left",
      allowInteraction: true,
    },
  ],
} as const satisfies TourDefinition

export const tourRegistry = {
  [fullTourRegistry.id]: fullTourRegistry,
  [updateTourRegistry.id]: updateTourRegistry,
} as const satisfies Readonly<Record<string, TourDefinition>>

export type RegisteredTourId = keyof typeof tourRegistry

export function getTourDefinition(tourId: string): TourDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(tourRegistry, tourId)
    ? tourRegistry[tourId as RegisteredTourId]
    : undefined
}
