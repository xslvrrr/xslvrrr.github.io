import { createHmac, randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase";

export interface PendingAssistantAction {
  id: string;
  name: string;
  arguments: string;
}

const APPROVAL_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIONS_PER_APPROVAL = 20;
const devApprovalSecret = "millennium-development-assistant-approval-secret";

function approvalSecret(): string {
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV !== "production" ? devApprovalSecret : undefined);
  if (!secret) throw new Error("SESSION_SECRET is required for assistant approvals");
  return secret;
}

function digestActions(userId: string, actions: PendingAssistantAction[]): string {
  return createHmac("sha256", approvalSecret())
    .update("millennium:assistant-action-approval:v1\0", "utf8")
    .update(userId, "utf8")
    .update("\0", "utf8")
    .update(JSON.stringify(actions), "utf8")
    .digest("hex");
}

function normalizeActions(actions: PendingAssistantAction[]): PendingAssistantAction[] {
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_ACTIONS_PER_APPROVAL) {
    throw new Error("Assistant action approval must contain between 1 and 20 actions");
  }

  return actions.map((action) => {
    if (!action || typeof action.id !== "string" || typeof action.name !== "string" || typeof action.arguments !== "string") {
      throw new Error("Assistant action approval contains an invalid action");
    }
    if (action.id.length > 200 || action.name.length > 100 || action.arguments.length > 100_000) {
      throw new Error("Assistant action approval exceeds size limits");
    }
    return { id: action.id, name: action.name, arguments: action.arguments };
  });
}

export async function createAssistantActionApproval(
  userId: string,
  threadId: string | null,
  actions: PendingAssistantAction[],
) {
  const id = randomUUID();
  const normalizedActions = normalizeActions(actions);
  const actionDigest = digestActions(userId, normalizedActions);
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
  const { error: cleanupError } = await supabaseAdmin
    .from("assistant_action_approvals")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (cleanupError) throw cleanupError;
  const { error } = await supabaseAdmin.from("assistant_action_approvals").insert({
    id,
    user_id: userId,
    thread_id: threadId,
    action_digest: actionDigest,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { id, expiresAt, actions: normalizedActions };
}

export async function consumeAssistantActionApproval(
  userId: string,
  approvalId: string,
  actions: PendingAssistantAction[],
) {
  if (!/^[0-9a-f-]{36}$/i.test(approvalId)) return null;
  const normalizedActions = normalizeActions(actions);
  const { data, error } = await supabaseAdmin.rpc("consume_assistant_action_approval", {
    p_approval_id: approvalId,
    p_user_id: userId,
    p_action_digest: digestActions(userId, normalizedActions),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.consumed === true ? normalizedActions : null;
}
