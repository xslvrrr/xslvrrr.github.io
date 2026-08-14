import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { supabaseAdmin } from "../supabase";

const ENVELOPE_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const PROVIDER_RESPONSE_LIMIT = 2 * 1024 * 1024;

export type AssistantProviderId = "openai" | "anthropic" | "openrouter";
export type AssistantProviderAuthMode = "api-key" | "oauth-token";

export interface AssistantProviderConnectionInput {
  provider: AssistantProviderId;
  authMode: AssistantProviderAuthMode;
  label: string;
  model: string;
  credential: string;
}

export interface AssistantProviderConnection {
  id: string;
  provider: AssistantProviderId;
  authMode: AssistantProviderAuthMode;
  label: string;
  model: string;
  keyHint: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantProviderRuntime extends AssistantProviderConnection {
  credential: string;
}

interface CredentialEnvelope {
  version: typeof ENVELOPE_VERSION;
  iv: string;
  ciphertext: string;
  authTag: string;
}

const PROVIDER_ENDPOINTS: Record<AssistantProviderId, {
  chat: string;
  models: string;
}> = {
  openai: {
    chat: "https://api.openai.com/v1/chat/completions",
    models: "https://api.openai.com/v1/models",
  },
  anthropic: {
    chat: "https://api.anthropic.com/v1/messages",
    models: "https://api.anthropic.com/v1/models",
  },
  openrouter: {
    chat: "https://openrouter.ai/api/v1/chat/completions",
    models: "https://openrouter.ai/api/v1/models",
  },
};

function credentialSecret(): string {
  const secret = process.env.AI_CREDENTIALS_SECRET
    || process.env.PORTAL_CREDENTIALS_SECRET
    || (process.env.NODE_ENV !== "production" ? process.env.SESSION_SECRET : undefined);
  if (!secret || secret.length < 32) {
    throw new Error("AI_CREDENTIALS_SECRET must be configured with at least 32 characters");
  }
  return secret;
}

function deriveKey(userId: string, connectionId: string): Buffer {
  return createHash("sha256")
    .update("millennium:assistant-provider-credential:v1\0", "utf8")
    .update(userId, "utf8")
    .update("\0", "utf8")
    .update(connectionId, "utf8")
    .update("\0", "utf8")
    .update(credentialSecret(), "utf8")
    .digest();
}

function associatedData(userId: string, connectionId: string): Buffer {
  return Buffer.from(
    `millennium-user:${userId}:assistant-provider:${connectionId}:v1`,
    "utf8",
  );
}

function encryptCredential(
  userId: string,
  connectionId: string,
  credential: string,
): CredentialEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(userId, connectionId), iv);
  cipher.setAAD(associatedData(userId, connectionId));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(credential, "utf8")),
    cipher.final(),
  ]);
  return {
    version: ENVELOPE_VERSION,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

function decryptCredential(
  userId: string,
  connectionId: string,
  envelope: unknown,
): string | null {
  if (!envelope || typeof envelope !== "object") return null;
  const value = envelope as Partial<CredentialEnvelope>;
  if (
    value.version !== ENVELOPE_VERSION
    || typeof value.iv !== "string"
    || typeof value.ciphertext !== "string"
    || typeof value.authTag !== "string"
  ) {
    return null;
  }
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      deriveKey(userId, connectionId),
      Buffer.from(value.iv, "base64url"),
    );
    decipher.setAAD(associatedData(userId, connectionId));
    decipher.setAuthTag(Buffer.from(value.authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function isProvider(value: unknown): value is AssistantProviderId {
  return value === "openai" || value === "anthropic" || value === "openrouter";
}

function isAuthMode(value: unknown): value is AssistantProviderAuthMode {
  return value === "api-key" || value === "oauth-token";
}

function normalizeConnection(row: Record<string, unknown>): AssistantProviderConnection | null {
  if (
    typeof row.id !== "string"
    || !isProvider(row.provider)
    || !isAuthMode(row.auth_mode)
    || typeof row.label !== "string"
    || typeof row.model !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    provider: row.provider,
    authMode: row.auth_mode,
    label: row.label,
    model: row.model,
    keyHint: typeof row.key_hint === "string" ? row.key_hint : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

export function validateAssistantProviderConnectionInput(
  value: unknown,
): value is AssistantProviderConnectionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (!isProvider(input.provider) || !isAuthMode(input.authMode)) return false;
  if (input.authMode === "oauth-token" && input.provider !== "anthropic") return false;
  return typeof input.label === "string"
    && input.label.trim().length >= 1
    && input.label.trim().length <= 60
    && typeof input.model === "string"
    && /^[a-zA-Z0-9._:/-]{1,160}$/.test(input.model)
    && typeof input.credential === "string"
    && input.credential.trim().length >= 16
    && input.credential.trim().length <= 4096;
}

export function assistantProviderEndpoint(provider: AssistantProviderId): string {
  return PROVIDER_ENDPOINTS[provider].chat;
}

export function assistantProviderHeaders(
  runtime: Pick<AssistantProviderRuntime, "provider" | "authMode" | "credential">,
): Record<string, string> {
  if (runtime.provider === "anthropic") {
    return {
      ...(runtime.authMode === "oauth-token"
        ? { Authorization: `Bearer ${runtime.credential}` }
        : { "x-api-key": runtime.credential }),
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
  }
  return {
    Authorization: `Bearer ${runtime.credential}`,
    "Content-Type": "application/json",
    ...(runtime.provider === "openrouter"
      ? {
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "http://millennium-five.vercel.app",
        "X-Title": process.env.OPENROUTER_APP_TITLE || "Millennium Dashboard",
      }
      : {}),
  };
}

async function readProviderPayload(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > PROVIDER_RESPONSE_LIMIT) {
    throw new Error("Provider response was too large.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > PROVIDER_RESPONSE_LIMIT) {
    throw new Error("Provider response was too large.");
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function providerError(payload: unknown, status: number, credential: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, any>;
    const message = record.error?.message || record.message || record.detail;
    if (typeof message === "string" && message.trim()) {
      return message
        .replaceAll(credential, "[redacted]")
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [redacted]")
        .replace(/sk-(?:ant-|or-|proj-)?[A-Za-z0-9_-]{12,}/gi, "[redacted]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
    }
  }
  return `Provider rejected credentials with HTTP ${status}.`;
}

export async function verifyAssistantProviderConnection(
  input: AssistantProviderConnectionInput,
): Promise<void> {
  const runtime = {
    provider: input.provider,
    authMode: input.authMode,
    credential: input.credential.trim(),
  };
  const response = await fetch(PROVIDER_ENDPOINTS[input.provider].models, {
    headers: assistantProviderHeaders(runtime),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await readProviderPayload(response);
  if (!response.ok) throw new Error(providerError(payload, response.status, runtime.credential));

  const models = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).data
    : null;
  if (Array.isArray(models) && models.length > 0) {
    const modelFound = models.some((entry) => (
      entry && typeof entry === "object"
      && (entry as Record<string, unknown>).id === input.model
    ));
    if (!modelFound) {
      throw new Error(`Model "${input.model}" is not available to this provider account.`);
    }
  }
}

export async function listAssistantProviderConnections(
  userId: string,
): Promise<AssistantProviderConnection[]> {
  const { data, error } = await supabaseAdmin
    .from("assistant_provider_connections")
    .select("id, provider, auth_mode, label, model, key_hint, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeConnection(row))
    .filter((connection): connection is AssistantProviderConnection => Boolean(connection));
}

export async function getAssistantProviderRuntime(
  userId: string,
  connectionId: string,
): Promise<AssistantProviderRuntime | null> {
  const { data, error } = await supabaseAdmin
    .from("assistant_provider_connections")
    .select("id, provider, auth_mode, label, model, key_hint, credential_envelope, created_at, updated_at")
    .eq("user_id", userId)
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const connection = normalizeConnection(data);
  if (!connection) return null;
  const credential = decryptCredential(userId, connection.id, data.credential_envelope);
  if (!credential) throw new Error("Provider credential could not be decrypted. Reconnect this provider.");
  return { ...connection, credential };
}

export async function saveAssistantProviderConnection(
  userId: string,
  input: AssistantProviderConnectionInput,
): Promise<AssistantProviderConnection> {
  await verifyAssistantProviderConnection(input);
  const existing = await supabaseAdmin
    .from("assistant_provider_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", input.provider)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const id = typeof existing.data?.id === "string" ? existing.data.id : randomUUID();
  const credential = input.credential.trim();
  const payload = {
    id,
    user_id: userId,
    provider: input.provider,
    auth_mode: input.authMode,
    label: input.label.trim(),
    model: input.model.trim(),
    key_hint: `••••${credential.slice(-4)}`,
    credential_envelope: encryptCredential(userId, id, credential),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from("assistant_provider_connections")
    .upsert(payload, { onConflict: "user_id,provider" })
    .select("id, provider, auth_mode, label, model, key_hint, created_at, updated_at")
    .single();
  if (error) throw error;
  const connection = normalizeConnection(data);
  if (!connection) throw new Error("Provider connection was saved with invalid data.");
  return connection;
}

export async function deleteAssistantProviderConnection(
  userId: string,
  connectionId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("assistant_provider_connections")
    .delete()
    .eq("user_id", userId)
    .eq("id", connectionId)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

export function providerConnectionModelId(connectionId: string): string {
  return `byok:${connectionId}`;
}
