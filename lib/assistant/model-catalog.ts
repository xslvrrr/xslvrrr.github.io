/**
 * The list of free models, kept current from OpenRouter rather than by hand.
 *
 * `lib/ai-models.ts` holds four models written out as literals. OpenRouter's free tier turns over
 * constantly — models arrive, are renamed, and are withdrawn — so a hand-maintained list is a list
 * that is wrong most of the time, in both directions: it offers models that have been pulled, and
 * hides ones the student could be using. This module fetches the real list instead.
 *
 * Three things are filtered on, and each one matters:
 *
 * - `:free` pricing, obviously.
 * - `tools` in `supported_parameters`. The assistant is a tool-using agent; a model that cannot call
 *   a tool cannot read a timetable or change a setting, and offering it would be offering a
 *   downgrade the student has no way to recognise from the name.
 * - A usable output ceiling, so a model cannot be listed that would truncate every answer.
 *
 * The static catalogue stays as the fallback. A network failure at OpenRouter must not take the
 * model picker with it, and a cold start must not block a chat request on an upstream fetch.
 */

import {
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  type AiModelDefinition,
} from "../ai-models.ts";
import { logger } from "../logger.ts";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/**
 * How long a fetched catalogue is served before it is refreshed.
 *
 * Six hours. The free tier does not turn over faster than that, and a shorter window would mean
 * every idle instance paying for a fetch to learn nothing changed.
 */
const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;

/** How long a failed refresh is backed off before another is attempted. */
const FAILURE_BACKOFF_MS = 10 * 60 * 1000;

const FETCH_TIMEOUT_MS = 8_000;

/**
 * Output ceiling applied to every dynamic model.
 *
 * The free models advertise ceilings from 8k to 512k. None of that is worth exposing: the assistant
 * budgets its own completions in `guardrails.ts`, and a model advertising 512k is not a model that
 * should be allowed to write 512k into a chat thread. This is the value the guardrail then caps.
 */
const DYNAMIC_MODEL_MAX_COMPLETION_TOKENS = 8_000;

/** Below this an advertised ceiling is too small to answer in, so the model is not offered. */
const MINIMUM_USEFUL_COMPLETION_TOKENS = 2_000;

/** Ceiling on how many free models to list, so the picker stays a picker. */
const MAX_DYNAMIC_MODELS = 24;

interface OpenRouterModel {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  context_length?: unknown;
  architecture?: { input_modalities?: unknown };
  pricing?: { prompt?: unknown; completion?: unknown };
  top_provider?: { max_completion_tokens?: unknown };
  supported_parameters?: unknown;
}

interface CatalogueCache {
  models: AiModelDefinition[];
  fetchedAt: number;
  /** Set when the last attempt failed, so failures back off instead of retrying every request. */
  failedAt: number;
}

let cache: CatalogueCache | null = null;
/** In-flight refresh, shared so concurrent requests make one upstream call rather than many. */
let inFlight: Promise<AiModelDefinition[]> | null = null;

function isFreePricing(model: OpenRouterModel): boolean {
  const prompt = Number(model.pricing?.prompt);
  const completion = Number(model.pricing?.completion);
  return prompt === 0 && completion === 0;
}

function supportsTools(model: OpenRouterModel): boolean {
  return Array.isArray(model.supported_parameters) && model.supported_parameters.includes("tools");
}

/**
 * The public id for a fetched model.
 *
 * Prefixed so a dynamic id can never collide with one of the four hand-written ids, which are
 * stored in user preferences and must keep resolving to the same thing.
 */
function dynamicModelId(slug: string): string {
  return `or:${slug}`;
}

export function isDynamicModelId(value: string): boolean {
  return value.startsWith("or:");
}

/** Longest id the chat route will accept in a request body. */
const MAX_MODEL_ID_CHARS = 128;

function labelFor(model: OpenRouterModel, slug: string): string {
  const name = typeof model.name === "string" ? model.name.trim() : "";
  const cleaned = name.replace(/\s*\(free\)\s*$/i, "").replace(/^([^:]+):\s*/, "$1 ");
  return (cleaned || slug).slice(0, 80);
}

function labFor(slug: string): string {
  return slug.split("/")[0]?.slice(0, 40) || "openrouter";
}

function describe(model: OpenRouterModel, slug: string): string {
  const context = Number(model.context_length);
  const contextLabel = Number.isFinite(context) && context > 0
    ? `${Math.round(context / 1000)}k context`
    : "free";
  const vision = Array.isArray(model.architecture?.input_modalities)
    && (model.architecture.input_modalities as unknown[]).includes("image");
  return `Free from ${labFor(slug)} · ${contextLabel}${vision ? " · reads images" : ""}`.slice(0, 160);
}

function toModelDefinition(model: OpenRouterModel): AiModelDefinition | null {
  const slug = typeof model.id === "string" ? model.id.trim() : "";
  if (!slug || !slug.endsWith(":free")) return null;
  if (!isFreePricing(model) || !supportsTools(model)) return null;

  const id = dynamicModelId(slug);
  if (id.length > MAX_MODEL_ID_CHARS) return null;

  const advertised = Number(model.top_provider?.max_completion_tokens);
  // A null ceiling means the provider did not say, not that there is none. Those models answer
  // normally, so they are kept at the standard budget rather than dropped.
  const ceiling = Number.isFinite(advertised) && advertised > 0 ? advertised : DYNAMIC_MODEL_MAX_COMPLETION_TOKENS;
  if (ceiling < MINIMUM_USEFUL_COMPLETION_TOKENS) return null;

  return {
    id,
    label: labelFor(model, slug),
    providerModel: slug,
    minimumTier: "free",
    lab: labFor(slug),
    description: describe(model, slug),
    maxCompletionTokens: Math.min(ceiling, DYNAMIC_MODEL_MAX_COMPLETION_TOKENS),
    promptPricePerToken: 0,
    completionPricePerToken: 0,
  };
}

async function fetchOpenRouterFreeModels(): Promise<AiModelDefinition[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenRouter model list returned ${response.status}`);

    const payload = await response.json();
    const rows: OpenRouterModel[] = Array.isArray(payload?.data) ? payload.data : [];
    const models = rows
      .map(toModelDefinition)
      .filter((model): model is AiModelDefinition => model !== null)
      .sort((left, right) => left.label.localeCompare(right.label))
      .slice(0, MAX_DYNAMIC_MODELS);

    if (models.length === 0) throw new Error("OpenRouter model list contained no usable free models");
    return models;
  } finally {
    clearTimeout(timeout);
  }
}

/** The auto-routing entry, which is not in the fetched list because it is not a model. */
function autoRouteModel(): AiModelDefinition {
  return AI_MODELS.find((model) => model.id === DEFAULT_AI_MODEL_ID) || AI_MODELS[0];
}

function isFresh(entry: CatalogueCache): boolean {
  return Date.now() - entry.fetchedAt < CATALOGUE_TTL_MS;
}

/**
 * The models to offer.
 *
 * Serves the cached list when it is fresh, and serves a stale one while refreshing rather than
 * making a student wait on OpenRouter to see a model picker. A refresh that fails leaves whatever
 * was already there — including, on a cold start that has never succeeded, the static catalogue.
 */
export async function getAssistantModelCatalog(): Promise<AiModelDefinition[]> {
  if (cache && isFresh(cache)) return cache.models;
  if (cache && Date.now() - cache.failedAt < FAILURE_BACKOFF_MS) return cache.models;

  if (!inFlight) {
    inFlight = fetchOpenRouterFreeModels()
      .then((models) => {
        cache = { models: [autoRouteModel(), ...models], fetchedAt: Date.now(), failedAt: 0 };
        return cache.models;
      })
      .catch((error) => {
        logger.warn("OpenRouter free-model refresh failed; keeping the previous catalogue", error);
        cache = {
          models: cache?.models ?? [...AI_MODELS],
          fetchedAt: cache?.fetchedAt ?? 0,
          failedAt: Date.now(),
        };
        return cache.models;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  // A stale list now beats a fresh one later; only a cold cache waits on the fetch.
  return cache ? cache.models : inFlight;
}

/**
 * Resolves a stored or requested model id against the live catalogue.
 *
 * An id that is no longer in the catalogue falls back to the auto route rather than failing. The
 * catalogue is now discovered, so a stored preference goes stale on its own — a model is withdrawn
 * from the free tier and the student's saved choice stops existing without them touching anything.
 * Refusing the request would mean a chat that will not send until they open a picker they have no
 * reason to suspect. The response already reports which model actually ran.
 */
export async function resolveAssistantModel(modelId: unknown): Promise<AiModelDefinition | null> {
  const catalog = await getAssistantModelCatalog();
  const fallback = catalog.find((model) => model.id === DEFAULT_AI_MODEL_ID) || catalog[0] || null;
  const requested = typeof modelId === "string" ? modelId.trim() : "";
  if (!requested) return fallback;
  return catalog.find((model) => model.id === requested) || fallback;
}
