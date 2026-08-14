import { rateLimitKeysForDiscriminator } from "./rate-limit";
import { supabaseAdmin } from "./supabase";

export type UserRole = "user" | "admin";
export type AdministratorAiResetAction =
  | "reset-ai-limit"
  | "reset-trial"
  | "reset-ai-all";

const AI_RATE_LIMIT_SCOPES = [
  "assistant-chat",
  "assistant-approval-apply",
  "assistant-state-read",
  "assistant-state-write",
  "assistant-context-read",
  "assistant-skill-writer",
] as const;
const TRIAL_RATE_LIMIT_SCOPES = ["frontier-study-trial"] as const;

export class AdministratorActionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdministratorActionError";
    this.status = status;
  }
}

function normalizeRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

function throwAdministratorDatabaseError(error: unknown): never {
  const message = String((error as { message?: unknown })?.message || "");
  if (message.includes("ADMIN_NOT_AUTHORIZED")) {
    throw new AdministratorActionError("Administrator access required.", 403);
  }
  if (message.includes("ADMIN_USER_NOT_FOUND")) {
    throw new AdministratorActionError("User could not be found.", 404);
  }
  if (message.includes("ADMIN_SELF_DEMOTION")) {
    throw new AdministratorActionError("You cannot remove your own administrator access.", 409);
  }
  if (message.includes("ADMIN_LAST_ADMIN")) {
    throw new AdministratorActionError("At least one administrator must remain.", 409);
  }
  if (message.includes("ADMIN_ROLE_INVALID") || message.includes("ADMIN_RESET_EMPTY")) {
    throw new AdministratorActionError("Administrator request is invalid.", 400);
  }
  throw error;
}

export async function getUserRole(userId: string): Promise<UserRole | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeRole(data.role) : null;
}

export async function requireAdministrator(userId: string): Promise<void> {
  if (await getUserRole(userId) !== "admin") {
    throw new AdministratorActionError("Administrator access required.", 403);
  }
}

export async function listAdministratorUsers({
  actorUserId,
  search,
  page,
  pageSize,
}: {
  actorUserId: string;
  search: string;
  page: number;
  pageSize: number;
}) {
  const boundedPage = Math.max(1, Math.floor(page) || 1);
  const boundedPageSize = Math.max(1, Math.min(100, Math.floor(pageSize) || 25));
  const offset = (boundedPage - 1) * boundedPageSize;
  const [usersResult, overviewResult] = await Promise.all([
    supabaseAdmin.rpc("admin_list_users", {
      p_actor_user_id: actorUserId,
      p_search: search.trim().slice(0, 200),
      p_limit: boundedPageSize,
      p_offset: offset,
    }),
    supabaseAdmin.rpc("admin_get_overview", {
      p_actor_user_id: actorUserId,
    }),
  ]);
  if (usersResult.error) throwAdministratorDatabaseError(usersResult.error);
  if (overviewResult.error) throwAdministratorDatabaseError(overviewResult.error);

  const rows = Array.isArray(usersResult.data) ? usersResult.data : [];
  const total = Math.max(0, Number(rows[0]?.total_count) || 0);
  const overview = overviewResult.data && typeof overviewResult.data === "object"
    ? overviewResult.data as Record<string, unknown>
    : {};

  return {
    users: rows.map((row) => ({
      id: String(row.user_id || ""),
      millenniumUid: typeof row.millennium_uid === "string" ? row.millennium_uid : "",
      email: typeof row.email === "string" ? row.email : "",
      name: typeof row.display_name === "string" ? row.display_name : "",
      school: typeof row.school_name === "string" ? row.school_name : "",
      role: normalizeRole(row.account_role),
      subscriptionTier: typeof row.subscription_tier === "string" ? row.subscription_tier : "free",
      subscriptionStatus: typeof row.subscription_status === "string" ? row.subscription_status : "inactive",
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      lastSync: typeof row.last_sync === "string" ? row.last_sync : null,
      aiRequests: Math.max(0, Number(row.ai_requests) || 0),
      aiSpentUsd: Math.max(0, Number(row.ai_spent_usd) || 0),
      trialStatus: typeof row.trial_status === "string" ? row.trial_status : null,
    })),
    pagination: {
      page: boundedPage,
      pageSize: boundedPageSize,
      total,
      pages: Math.max(1, Math.ceil(total / boundedPageSize)),
    },
    overview: {
      users: Math.max(0, Number(overview.users) || 0),
      administrators: Math.max(0, Number(overview.administrators) || 0),
      paidUsers: Math.max(0, Number(overview.paidUsers) || 0),
      monthlyAiSpendUsd: Math.max(0, Number(overview.monthlyAiSpendUsd) || 0),
    },
  };
}

export async function setAdministratorUserRole({
  actorUserId,
  targetUserId,
  role,
}: {
  actorUserId: string;
  targetUserId: string;
  role: UserRole;
}) {
  const { data, error } = await supabaseAdmin.rpc("admin_set_user_role", {
    p_actor_user_id: actorUserId,
    p_target_user_id: targetUserId,
    p_role: role,
  });
  if (error) throwAdministratorDatabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    id: String(row?.user_id || targetUserId),
    role: normalizeRole(row?.account_role),
  };
}

export async function resetAdministratorUserAi({
  actorUserId,
  targetUserId,
  action,
}: {
  actorUserId: string;
  targetUserId: string;
  action: AdministratorAiResetAction;
}) {
  const resetUsage = action === "reset-ai-limit" || action === "reset-ai-all";
  const resetTrial = action === "reset-trial" || action === "reset-ai-all";
  const scopes = [
    ...(resetUsage ? AI_RATE_LIMIT_SCOPES : []),
    ...(resetTrial ? TRIAL_RATE_LIMIT_SCOPES : []),
  ];
  const { data, error } = await supabaseAdmin.rpc("admin_reset_user_ai", {
    p_actor_user_id: actorUserId,
    p_target_user_id: targetUserId,
    p_reset_usage: resetUsage,
    p_reset_trial: resetTrial,
    p_clear_approvals: resetUsage,
    p_rate_limit_keys: rateLimitKeysForDiscriminator(scopes, targetUserId),
  });
  if (error) throwAdministratorDatabaseError(error);
  return data && typeof data === "object" ? data : {};
}
