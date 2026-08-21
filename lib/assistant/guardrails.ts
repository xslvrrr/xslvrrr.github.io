export const ASSISTANT_CHAT_BODY_MAX_BYTES = 8 * 1024 * 1024;
export const ASSISTANT_STATE_BODY_MAX_BYTES = 4 * 1024 * 1024;
export const ASSISTANT_APPROVAL_BODY_MAX_BYTES = 512 * 1024;
export const ASSISTANT_SKILL_BODY_MAX_BYTES = 16 * 1024;

export const ASSISTANT_MAX_MESSAGES = 60;
export const ASSISTANT_MAX_MESSAGE_CHARS = 20_000;
export const ASSISTANT_MAX_THINKING_CHARS = 20_000;
export const ASSISTANT_MAX_ATTACHMENTS = 6;
export const ASSISTANT_MAX_ATTACHMENT_DATA_URL_CHARS = 6 * 1024 * 1024;
export const ASSISTANT_MAX_TOOL_ARGUMENT_CHARS = 24_000;
export const ASSISTANT_MAX_TOOL_CALLS_PER_STEP = 6;
export const ASSISTANT_MAX_TOTAL_TOOL_CALLS = 12;
export const ASSISTANT_MAX_TOOL_RESULT_CHARS = 12_000;
export const ASSISTANT_MAX_RESPONSE_CHARS = 32_000;
export const ASSISTANT_MAX_REASONING_CHARS = 32_000;
export const ASSISTANT_MAX_SKILL_INSTRUCTION_CHARS = 12_000;
export const ASSISTANT_MAX_CONTEXT_TEXT_CHARS = 140_000;
export const ASSISTANT_MAX_SNAPSHOT_PROMPT_CHARS = 70_000;
export const ASSISTANT_MAX_SKILL_PROMPT_CHARS = 24_000;
export const ASSISTANT_MAX_PROVIDER_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const ASSISTANT_MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;
export const ASSISTANT_MAX_CHAT_STEPS = 5;
/**
 * Output budget for one provider call.
 *
 * This was 1,200, which is roughly a page. That is a generous answer and a very small *completion*:
 * every free model on the built-in provider emits its reasoning into the same budget, and several
 * reason unconditionally. A model that spent nine hundred tokens thinking had three hundred left to
 * answer in, and the reply stopped mid-sentence — or, when the reasoning was untagged prose, the
 * fragment that reached the student was the reasoning itself.
 *
 * Raised to a figure the free models can all serve (their own ceilings are 32k and up) so the
 * answer is bounded by the model finishing rather than by the budget running out. Truncation is now
 * also detected and continued rather than shipped, so this is a ceiling and not a target.
 */
export const ASSISTANT_MAX_COMPLETION_TOKENS = 4_000;
export const ASSISTANT_MAX_SKILL_COMPLETION_TOKENS = 1_600;

/**
 * How many times a cut-off answer may be asked to continue.
 *
 * One is almost always enough — a second round means the model is writing something far longer than
 * the question warranted, and continuing forever would turn one request into an unbounded bill.
 */
export const ASSISTANT_MAX_CONTINUATION_ROUNDS = 2;

export const ASSISTANT_REQUEST_DEADLINE_MS = 90_000;
export const ASSISTANT_APPROVAL_DEADLINE_MS = 45_000;
export const ASSISTANT_PROVIDER_CALL_DEADLINE_MS = 40_000;
export const ASSISTANT_PROVIDER_STREAM_DEADLINE_MS = 60_000;
export const ASSISTANT_TITLE_DEADLINE_MS = 8_000;
export const ASSISTANT_SKILL_DEADLINE_MS = 35_000;

export class AssistantGuardrailError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'ASSISTANT_LIMIT') {
    super(message);
    this.name = 'AssistantGuardrailError';
    this.status = status;
    this.code = code;
  }
}

export interface AssistantDeadline {
  signal: AbortSignal;
  expiresAt: number;
  clear: () => void;
  throwIfExpired: () => void;
}

export function createAssistantDeadline(
  timeoutMs: number,
  parentSignal?: AbortSignal | null,
): AssistantDeadline {
  const controller = new AbortController();
  const expiresAt = Date.now() + Math.max(1, timeoutMs);
  const forwardAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) forwardAbort();
  else parentSignal?.addEventListener('abort', forwardAbort, { once: true });

  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Assistant operation deadline exceeded', 'TimeoutError'));
  }, Math.max(1, timeoutMs));

  return {
    signal: controller.signal,
    expiresAt,
    clear: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', forwardAbort);
    },
    throwIfExpired: () => {
      if (controller.signal.aborted || Date.now() >= expiresAt) {
        throw new AssistantGuardrailError(
          'Assistant operation exceeded its safe processing deadline.',
          504,
          'ASSISTANT_DEADLINE',
        );
      }
    },
  };
}

export function createChildDeadline(
  parent: AssistantDeadline,
  maximumMs: number,
): AssistantDeadline {
  parent.throwIfExpired();
  const remainingMs = parent.expiresAt - Date.now();
  return createAssistantDeadline(Math.min(maximumMs, remainingMs), parent.signal);
}

export function assistantGuardrailErrorResponse(
  error: unknown,
  headers?: HeadersInit,
): Response | null {
  if (!(error instanceof AssistantGuardrailError)) return null;
  return Response.json({ message: error.message, code: error.code }, {
    status: error.status,
    ...(headers ? { headers } : {}),
  });
}

export function assertProviderPayloadSize(body: string): void {
  if (new TextEncoder().encode(body).byteLength > ASSISTANT_MAX_PROVIDER_PAYLOAD_BYTES) {
    throw new AssistantGuardrailError(
      'Assistant context is too large. Remove attachments or start a new chat.',
      413,
      'ASSISTANT_CONTEXT_TOO_LARGE',
    );
  }
}

export async function readBoundedProviderJson(response: Response): Promise<unknown> {
  if (!response.body) {
    throw new AssistantGuardrailError('Assistant provider returned an empty response.', 502, 'ASSISTANT_PROVIDER_PROTOCOL');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > ASSISTANT_MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel('Assistant provider response limit exceeded').catch(() => {});
        throw new AssistantGuardrailError(
          'Assistant provider response exceeded its safe size limit.',
          502,
          'ASSISTANT_PROVIDER_PROTOCOL',
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AssistantGuardrailError(
      'Assistant provider returned an invalid response.',
      502,
      'ASSISTANT_PROVIDER_PROTOCOL',
    );
  }
}

export function serializeBoundedToolResult(value: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = JSON.stringify({ ok: false, message: 'Tool result could not be serialized.' });
  }
  if (serialized.length <= ASSISTANT_MAX_TOOL_RESULT_CHARS) return serialized;
  return JSON.stringify({
    ok: true,
    message: 'Tool result was truncated to protect assistant context.',
    data: serialized.slice(0, ASSISTANT_MAX_TOOL_RESULT_CHARS),
    truncated: true,
  });
}
