import { supabaseAdmin } from "./supabase";
import {
  type AiModelDefinition,
  type AiModelId,
  type AiPlanTier,
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  canUseAiModel,
  getAiModel,
} from "./ai-models";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export interface BillingState {
  tier: AiPlanTier;
  status: string;
  customerId: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

function normalizeTier(value: unknown): AiPlanTier {
  return value === "study" || value === "frontier" ? value : "free";
}

export async function getBillingState(userId: string): Promise<BillingState> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("stripe_customer_id, stripe_subscription_id, subscription_tier, subscription_status, subscription_current_period_end, subscription_cancel_at_period_end")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  const status = typeof data?.subscription_status === "string" ? data.subscription_status : "inactive";
  const storedTier = normalizeTier(data?.subscription_tier);
  const periodEnd = typeof data?.subscription_current_period_end === "string"
    ? data.subscription_current_period_end
    : null;
  const periodValid = !periodEnd || new Date(periodEnd).getTime() > Date.now();
  const tier = ACTIVE_SUBSCRIPTION_STATUSES.has(status) && periodValid ? storedTier : "free";

  return {
    tier,
    status,
    customerId: typeof data?.stripe_customer_id === "string" ? data.stripe_customer_id : null,
    subscriptionId: typeof data?.stripe_subscription_id === "string" ? data.stripe_subscription_id : null,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: data?.subscription_cancel_at_period_end === true,
  };
}

export async function getBillingSummary(userId: string) {
  const billing = await getBillingState(userId);
  const [trialResult, usage] = await Promise.all([
    supabaseAdmin
      .from("study_trial_uses")
      .select("status, used_at")
      .eq("user_id", userId)
      .maybeSingle(),
    getAiUsageSummary(userId, billing.tier),
  ]);
  if (trialResult.error) throw trialResult.error;
  const trial = trialResult.data;

  return {
    ...billing,
    models: AI_MODELS.map(({ providerModel: _providerModel, ...model }) => ({
      ...model,
      locked: !canUseAiModel(billing.tier, getAiModel(model.id)),
      priceBand: model.completionPricePerToken <= 0.000006
        ? 1
        : model.completionPricePerToken <= 0.00002 ? 2 : 3,
    })),
    usage,
    frontierTrialAvailable: !trial || trial.status === "failed",
    frontierTrialUsedAt: trial?.status === "completed" ? trial.used_at : null,
  };
}

export async function resolveAiModelForUser(
  userId: string,
  requestedModelId: unknown,
): Promise<{ model: AiModelDefinition; billing: BillingState }> {
  const billing = await getBillingState(userId);
  const modelId = typeof requestedModelId === "string"
    ? requestedModelId as AiModelId
    : DEFAULT_AI_MODEL_ID;
  const model = getAiModel(modelId);

  if (model.id !== modelId || !canUseAiModel(billing.tier, model)) {
    const error = new Error("Selected model is not included in your current plan.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }

  return { model, billing };
}

function monthlyBudgetCents(tier: AiPlanTier) {
  if (tier === "study") return Number(process.env.AI_STUDY_MONTHLY_BUDGET_CENTS || 600);
  if (tier === "frontier") return Number(process.env.AI_FRONTIER_MONTHLY_BUDGET_CENTS || 2_000);
  return 0;
}

export async function getAiUsageSummary(userId: string, tier: AiPlanTier) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

  const { data, error } = await supabaseAdmin
    .from("ai_usage")
    .select("prompt_tokens, completion_tokens, cost_usd")
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());
  if (error) throw error;

  const rows = data || [];
  const spentCents = rows.reduce((total, row) => total + Number(row.cost_usd || 0) * 100, 0);
  const limitCents = monthlyBudgetCents(tier);
  return {
    requests: rows.length,
    promptTokens: rows.reduce((total, row) => total + Number(row.prompt_tokens || 0), 0),
    completionTokens: rows.reduce((total, row) => total + Number(row.completion_tokens || 0), 0),
    spentCents,
    limitCents,
    remainingCents: Math.max(0, limitCents - spentCents),
    percentUsed: limitCents > 0 ? Math.min(100, (spentCents / limitCents) * 100) : 0,
    resetsAt: nextMonth.toISOString(),
  };
}

export async function assertAiBudget(userId: string, tier: AiPlanTier) {
  if (tier === "free") return;
  const usage = await getAiUsageSummary(userId, tier);
  if (usage.spentCents >= usage.limitCents) {
    const error = new Error("Monthly AI usage allowance reached. It resets next month.");
    (error as Error & { status?: number }).status = 429;
    throw error;
  }
}

export async function recordAiUsage({
  userId,
  model,
  usage,
  feature,
}: {
  userId: string;
  model: AiModelDefinition;
  usage: Record<string, unknown> | null;
  feature: "assistant" | "study-trial" | "flashcards";
}) {
  const promptTokens = Math.max(0, Number(usage?.prompt_tokens || 0));
  const completionTokens = Math.max(0, Number(usage?.completion_tokens || 0));
  const reportedCost = Number(usage?.cost);
  const costUsd = Number.isFinite(reportedCost) && reportedCost >= 0
    ? reportedCost
    : promptTokens * model.promptPricePerToken + completionTokens * model.completionPricePerToken;

  const { error } = await supabaseAdmin.from("ai_usage").insert({
    user_id: userId,
    feature,
    model_id: model.id,
    provider_model: model.providerModel,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: costUsd,
  });
  if (error) throw error;
}
