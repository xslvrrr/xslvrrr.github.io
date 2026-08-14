/**
 * Paid tiers are not shipped in this release. The tier machinery below is deliberately kept —
 * `AiPlanTier`, the rank table, and the gating helpers — because the only thing removed was the
 * paid *model data*. Re-introducing a paid tier later is then a matter of adding entries to
 * `AI_MODELS` with a `minimumTier` above `free`, rather than reinstating a gating layer through
 * billing, the chat route and the model browser.
 *
 * With only free models present every helper trivially permits every model, which is the intended
 * behaviour for this release.
 */
export type AiPlanTier = "free" | "study" | "frontier";
export type AiLabId =
  | "openrouter"
  | "openai"
  | "google"
  | "nvidia";
export type AiModelId =
  | "fast-free"
  | "nemotron-ultra-free"
  | "gemma-4-free"
  | "gpt-oss-free";

export interface AiModelDefinition {
  id: AiModelId;
  label: string;
  providerModel: string;
  minimumTier: AiPlanTier;
  lab: AiLabId;
  description: string;
  recommended?: boolean;
  maxCompletionTokens: number;
  promptPricePerToken: number;
  completionPricePerToken: number;
}

export const AI_PLAN_RANK: Record<AiPlanTier, number> = {
  free: 0,
  study: 1,
  frontier: 2,
};

export const FREE_ASSISTANT_MODEL = "openrouter/free";

export const AI_MODELS: readonly AiModelDefinition[] = [
  {
    id: "fast-free",
    label: "Auto Free",
    providerModel: FREE_ASSISTANT_MODEL,
    minimumTier: "free",
    lab: "openrouter",
    description: "Routes to an available free model that supports requested tools.",
    recommended: true,
    maxCompletionTokens: 2_200,
    promptPricePerToken: 0,
    completionPricePerToken: 0,
  },
  {
    id: "nemotron-ultra-free",
    label: "Nemotron 3 Ultra Free",
    providerModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    minimumTier: "free",
    lab: "nvidia",
    description: "Free long-context reasoning from NVIDIA.",
    maxCompletionTokens: 2_200,
    promptPricePerToken: 0,
    completionPricePerToken: 0,
  },
  {
    id: "gemma-4-free",
    label: "Gemma 4 31B Free",
    providerModel: "google/gemma-4-31b-it:free",
    minimumTier: "free",
    lab: "google",
    description: "Free general-purpose Google open model.",
    maxCompletionTokens: 2_200,
    promptPricePerToken: 0,
    completionPricePerToken: 0,
  },
  {
    id: "gpt-oss-free",
    label: "gpt-oss 20B Free",
    providerModel: "openai/gpt-oss-20b:free",
    minimumTier: "free",
    lab: "openai",
    description: "Free OpenAI open-weight model for simple agent work.",
    maxCompletionTokens: 2_200,
    promptPricePerToken: 0,
    completionPricePerToken: 0,
  },
] as const;

export const DEFAULT_AI_MODEL_ID: AiModelId = "fast-free";

export function getAiModel(modelId: unknown): AiModelDefinition {
  return AI_MODELS.find((model) => model.id === modelId)
    || AI_MODELS.find((model) => model.id === DEFAULT_AI_MODEL_ID)!;
}

export function canUseAiModel(tier: AiPlanTier, model: AiModelDefinition) {
  return AI_PLAN_RANK[tier] >= AI_PLAN_RANK[model.minimumTier];
}

export function modelsForTier(tier: AiPlanTier) {
  return AI_MODELS.filter((model) => canUseAiModel(tier, model));
}
