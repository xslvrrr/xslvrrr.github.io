import { createFileRoute } from '@tanstack/react-router';
import {
  OPENROUTER_ASSISTANT_MODEL,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  buildAssistantSystemPrompt,
  executeAssistantAction,
  getAssistantTools,
  getStudyTrialTools,
  isKnownAssistantAction,
  isMutatingAssistantAction,
  normalizeAssistantToolArguments,
  normalizeAssistantSkills,
  normalizeAssistantMessages,
  normalizeAssistantPreferences,
  normalizeAssistantThreads,
} from '../../../../lib/assistant/actions.ts';
import {
  consumeAssistantActionApproval,
  createAssistantActionApproval,
} from '../../../../lib/assistant-approvals';
import type {
  AssistantDashboardState,
  AssistantChatThread,
  AssistantMessage,
  AssistantToolCall,
} from '../../../../lib/assistant/actions.ts';
import { readStartSession } from '../../../../lib/start-session';
import { logger } from '../../../../lib/logger';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { getUserFlashcardSnapshot, saveUserFlashcardSets } from '../../../../lib/study-server';
import { SupabaseStudyRepository } from '../../../../lib/study/supabase-repository';
import { StudyService } from '../../../../lib/study/service';
import { StudyWorkshopService } from '../../../../lib/study/workshop-service';
import type { AssistantStudyNote } from '../../../../lib/assistant/flashcard-notes';
import {
  getAiModel,
  type AiModelDefinition,
  type AiPlanTier,
} from '../../../../lib/ai-models';
import { assertAiBudget, recordAiUsage, resolveAiModelForUser } from '../../../../lib/billing';
import {
  assistantProviderEndpoint,
  assistantProviderHeaders,
  getAssistantProviderRuntime,
} from '../../../../lib/assistant/provider-connections';
import { STUDY_TRIAL_DISPLAY_PROMPT } from '../../../../lib/study-trial-shared';
import {
  completeStudyTrial,
  failStudyTrial,
  reserveStudyTrial,
  STUDY_TRIAL_MAX_COMPLETION_TOKENS,
  STUDY_TRIAL_MAX_SYSTEM_CHARS,
  STUDY_TRIAL_SYSTEM_PROMPT,
} from '../../../../lib/study-trial-server';
import {
  ASSISTANT_APPROVAL_BODY_MAX_BYTES,
  ASSISTANT_APPROVAL_DEADLINE_MS,
  ASSISTANT_CHAT_BODY_MAX_BYTES,
  ASSISTANT_MAX_ATTACHMENTS,
  ASSISTANT_MAX_ATTACHMENT_DATA_URL_CHARS,
  ASSISTANT_MAX_CHAT_STEPS,
  ASSISTANT_MAX_COMPLETION_TOKENS,
  ASSISTANT_MAX_CONTEXT_TEXT_CHARS,
  ASSISTANT_MAX_MESSAGE_CHARS,
  ASSISTANT_MAX_MESSAGES,
  ASSISTANT_MAX_PROVIDER_RESPONSE_BYTES,
  ASSISTANT_MAX_REASONING_CHARS,
  ASSISTANT_MAX_RESPONSE_CHARS,
  ASSISTANT_MAX_TOOL_CALLS_PER_STEP,
  ASSISTANT_MAX_TOOL_ARGUMENT_CHARS,
  ASSISTANT_MAX_TOTAL_TOOL_CALLS,
  ASSISTANT_PROVIDER_CALL_DEADLINE_MS,
  ASSISTANT_PROVIDER_STREAM_DEADLINE_MS,
  ASSISTANT_REQUEST_DEADLINE_MS,
  ASSISTANT_TITLE_DEADLINE_MS,
  AssistantGuardrailError,
  type AssistantDeadline,
  assistantGuardrailErrorResponse,
  assertProviderPayloadSize,
  createAssistantDeadline,
  createChildDeadline,
  readBoundedProviderJson,
  serializeBoundedToolResult,
} from '../../../../lib/assistant/guardrails.ts';
import {
  getUserAssistantPortalSnapshot,
  getUserLocalCalendar,
  getUserPreferences,
  getUserThemeBuilder,
  getUserAssistantState,
  getUserNotificationStates,
  updateUserLocalCalendar,
  updateUserPreferences,
  updateUserThemeBuilder,
  updateUserAssistantState,
  updateUserNotificationStates,
} from '../../../../lib/users';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

interface ProviderRuntime {
  provider: 'openai' | 'anthropic' | 'openrouter';
  authMode: 'api-key' | 'oauth-token';
  credential: string;
  isByok: boolean;
}

function builtInProviderRuntime(apiKey: string): ProviderRuntime {
  return {
    provider: 'openrouter',
    authMode: 'api-key',
    credential: apiKey,
    isByok: false,
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

class OpenRouterRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpenRouterRequestError';
    this.status = status;
  }
}

function cleanProviderErrorMessage(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/gi, '[redacted]')
    .replace(/sk-(?:ant-|proj-)?[A-Za-z0-9_-]{12,}/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return trimmed.slice(0, 360);
}

function extractOpenRouterError(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const error = isRecord(payload.error) ? payload.error : null;
  const direct = cleanProviderErrorMessage(error?.message)
    || cleanProviderErrorMessage(payload.message);
  if (direct) return direct;

  const raw = cleanProviderErrorMessage(
    isRecord(error?.metadata) ? error.metadata.raw : undefined,
  );
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return extractOpenRouterError(parsed) || raw;
  } catch {
    return raw;
  }
}

function openRouterFailure(status: number, payload: unknown) {
  const detail = extractOpenRouterError(payload);
  return new OpenRouterRequestError(
    status || 502,
    detail ? `Provider error: ${detail}` : `Provider request failed (${status || 502}).`,
  );
}

function shouldRetryProviderRequest(status: number) {
  return status === 400 || status === 404 || status === 422;
}

function modelForNextToolRound(
  configuredModel: AiModelDefinition,
  resolvedModel: string,
): AiModelDefinition {
  if (configuredModel.providerModel !== OPENROUTER_ASSISTANT_MODEL) return configuredModel;
  const normalized = resolvedModel.trim();
  if (
    !normalized
    || normalized === configuredModel.providerModel
    || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(normalized)
  ) {
    return configuredModel;
  }
  return { ...configuredModel, providerModel: normalized };
}

function extractAssistantText(message: any): string {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function extractAssistantResponse(message: any) {
  const rawText = extractAssistantText(message);
  const state = { inThink: false, carry: '' };
  const split = splitThinkingText(rawText, state);
  const content = `${split.content}${state.inThink ? '' : state.carry}`.trim();
  const inlineThinking = `${split.thinking}${state.inThink ? state.carry : ''}`.trim();
  const reasoning = [message?.reasoning, message?.reasoning_content]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n\n');
  return {
    content,
    thinking: [reasoning, inlineThinking].filter(Boolean).join('\n\n'),
  };
}

function extractReasoningDetails(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const detail = item as any;
      return [detail.text, detail.content, detail.summary, detail.data]
        .filter((part) => typeof part === 'string' && part.trim())
        .join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

function splitThinkingText(input: string, state: { inThink: boolean; carry: string }) {
  let text = state.carry + input;
  state.carry = '';
  for (let size = Math.min(7, text.length); size > 0; size -= 1) {
    const suffix = text.slice(-size).toLowerCase();
    if (['<think>', '</think>'].some((tag) => tag.startsWith(suffix) && tag !== suffix)) {
      state.carry = text.slice(-size);
      text = text.slice(0, -size);
      break;
    }
  }

  let content = '';
  let thinking = '';
  while (text) {
    const tag = state.inThink ? '</think>' : '<think>';
    const index = text.toLowerCase().indexOf(tag);
    if (index === -1) {
      if (state.inThink) thinking += text;
      else content += text;
      break;
    }
    if (state.inThink) thinking += text.slice(0, index);
    else content += text.slice(0, index);
    text = text.slice(index + tag.length);
    state.inThink = !state.inThink;
  }

  return { content, thinking };
}

function normalizeToolCalls(value: unknown): AssistantToolCall[] {
  if (!Array.isArray(value)) return [];
  if (value.length > ASSISTANT_MAX_TOOL_CALLS_PER_STEP) {
    throw new OpenRouterRequestError(502, 'Provider returned too many tool calls');
  }

  const seenIds = new Set<string>();
  return value.map((toolCall, index) => {
    if (!isRecord(toolCall) || !isRecord(toolCall.function)) {
      throw new OpenRouterRequestError(502, 'Provider returned an invalid tool call');
    }
    const rawId = typeof toolCall.id === 'string' ? toolCall.id.trim() : '';
    const id = (rawId || `tool-${index + 1}`).slice(0, 200);
    const name = typeof toolCall.function.name === 'string' ? toolCall.function.name.trim() : '';
    const args = normalizeAssistantToolArguments(toolCall.function.arguments ?? {});
    if (!id || seenIds.has(id) || !isKnownAssistantAction(name) || !args) {
      throw new OpenRouterRequestError(502, 'Provider returned an invalid tool call');
    }
    seenIds.add(id);
    return {
      id,
      type: 'function' as const,
      function: { name, arguments: args },
    };
  });
}

function appendToolCallDelta(toolCalls: AssistantToolCall[], delta: any) {
  const index = Number.isInteger(delta?.index) ? delta.index : toolCalls.length;
  if (index < 0 || index >= ASSISTANT_MAX_TOOL_CALLS_PER_STEP) {
    throw new OpenRouterRequestError(502, 'Provider returned an invalid tool call index');
  }
  const current = toolCalls[index] || {
    id: typeof delta?.id === 'string' ? delta.id.slice(0, 200) : `tool-${index + 1}`,
    type: 'function' as const,
    function: { name: '', arguments: '' },
  };
  if (typeof delta?.id === 'string') current.id = delta.id.slice(0, 200);
  if (typeof delta?.function?.name === 'string') {
    const fragment = delta.function.name;
    if (!current.function.name) current.function.name = fragment.slice(0, 100);
    else if (fragment.startsWith(current.function.name)) current.function.name = fragment.slice(0, 100);
    else if (!current.function.name.endsWith(fragment)) {
      current.function.name = `${current.function.name}${fragment}`.slice(0, 100);
    }
  }
  if (typeof delta?.function?.arguments === 'string') {
    current.function.arguments += delta.function.arguments;
    if (current.function.arguments.length > ASSISTANT_MAX_TOOL_ARGUMENT_CHARS) {
      throw new OpenRouterRequestError(502, 'Provider tool arguments exceeded their size limit');
    }
  }
  toolCalls[index] = current;
}

function appendIncrementalText(previous: string, next: unknown) {
  if (typeof next !== 'string' || !next.trim()) return { value: previous, delta: '' };
  if (!previous) return { value: next, delta: next };
  if (next.startsWith(previous)) return { value: next, delta: next.slice(previous.length) };
  if (previous.endsWith(next)) return { value: previous, delta: '' };
  return { value: next, delta: next };
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function toOpenRouterMessage(message: AssistantMessage) {
  const attachments = message.role === 'user' ? message.attachments || [] : [];
  const imageAttachments = attachments.filter((file) => file.dataUrl?.startsWith('data:image/'));
  const fileAttachments = attachments.filter((file) => file.dataUrl && !file.dataUrl.startsWith('data:image/'));
  const attachmentBlocks = attachments
    .filter((file) => file.content || file.dataUrl)
    .map((file) => [
      `### ${file.name}`,
      `Type: ${file.type}`,
      `Size: ${file.size} bytes`,
      file.content
        ? `\`\`\`\n${file.content}${file.truncated ? '\n[truncated]' : ''}\n\`\`\``
        : imageAttachments.includes(file) ? '[image attached for vision]' : '[file attached for model access]',
    ].join('\n'));
  const textContent = attachmentBlocks.length
    ? `${message.content}\n\n## Attachments\n${attachmentBlocks.join('\n\n')}`
    : message.content;
  if (imageAttachments.length === 0 && fileAttachments.length === 0) {
    return attachments.length > 0 ? { ...message, content: textContent, attachments: undefined } : message;
  }
  return {
    ...message,
    content: [
      { type: 'text', text: textContent },
      ...imageAttachments.map((file) => ({
        type: 'image_url',
        image_url: { url: file.dataUrl },
      })),
      ...fileAttachments.map((file) => ({
        type: 'file',
        file: {
          filename: file.name,
          file_data: file.dataUrl,
        },
      })),
    ],
    attachments: undefined,
  };
}

function hasFileParserAttachments(messages: AssistantMessage[]) {
  return messages.some((message) => (
    message.role === 'user' &&
    message.attachments?.some((file) => file.dataUrl?.startsWith('data:application/pdf;base64,'))
  ));
}

function getReasoningOptions(messages: AssistantMessage[]) {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user');
  const text = `${latestUser?.content || ''} ${latestUser?.attachments?.map((file) => file.name).join(' ') || ''}`.toLowerCase();
  const needsReasoning = text.length > 700 || /\b(debug|fix|refactor|implement|build|create|organise|organize|notifications?|audit|compare|analyse|analyze|investigate|why|plan|strategy|architecture|optimi[sz]e|all|bulk|multiple|skill)\b/.test(text);
  return needsReasoning ? { effort: 'low', exclude: false } : { exclude: true };
}

function validateChatBody(value: unknown): value is Record<string, any> {
  if (!isRecord(value) || !Array.isArray(value.messages) || value.messages.length > ASSISTANT_MAX_MESSAGES) return false;
  if (value.threadId !== undefined && (typeof value.threadId !== 'string' || value.threadId.length > 160)) return false;
  if (value.summarizeThinking !== undefined && typeof value.summarizeThinking !== 'boolean') return false;
  if (value.modelId !== undefined && (typeof value.modelId !== 'string' || value.modelId.length > 64)) return false;
  if (value.studyTrial !== undefined && typeof value.studyTrial !== 'boolean') return false;

  return value.messages.every((message: unknown) => {
    if (!isRecord(message)) return false;
    if (typeof message.content !== 'string' || message.content.length > ASSISTANT_MAX_MESSAGE_CHARS) return false;
    if (message.attachments === undefined) return true;
    if (!Array.isArray(message.attachments) || message.attachments.length > ASSISTANT_MAX_ATTACHMENTS) return false;
    return message.attachments.every((attachment: unknown) => {
      if (!isRecord(attachment)) return false;
      if (attachment.dataUrl !== undefined && (
        typeof attachment.dataUrl !== 'string'
        || attachment.dataUrl.length > ASSISTANT_MAX_ATTACHMENT_DATA_URL_CHARS
        || !/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(attachment.dataUrl)
      )) return false;
      if (attachment.content !== undefined && (
        typeof attachment.content !== 'string'
        || attachment.content.length > 12_000
      )) return false;
      if (attachment.size !== undefined && (typeof attachment.size !== 'number' || !Number.isFinite(attachment.size) || attachment.size < 0)) {
        return false;
      }
      return attachment.name === undefined || (typeof attachment.name === 'string' && attachment.name.length <= 160);
    });
  });
}

function validateApprovalBody(value: unknown): value is {
  approvalId: string;
  actions: Array<{ id: string; name: string; arguments: string }>;
} {
  if (!isRecord(value) || typeof value.approvalId !== 'string' || !Array.isArray(value.actions)) return false;
  if (!/^[0-9a-f-]{36}$/i.test(value.approvalId) || value.actions.length < 1 || value.actions.length > 20) return false;
  return value.actions.every((action) => (
    isRecord(action)
    && typeof action.id === 'string'
    && action.id.length <= 200
    && typeof action.name === 'string'
    && isKnownAssistantAction(action.name)
    && typeof action.arguments === 'string'
    && normalizeAssistantToolArguments(action.arguments) !== null
  ));
}

function assistantMessageTextCharacters(message: AssistantMessage): number {
  return message.content.length
    + (message.thinking?.length || 0)
    + (message.name?.length || 0)
    + (message.attachments || []).reduce((total, file) => (
      total + file.name.length + (file.content?.length || 0)
    ), 0)
    + (message.tool_calls || []).reduce((total, toolCall) => (
      total + toolCall.function.name.length + toolCall.function.arguments.length
    ), 0)
    + (message.reasoning_details ? JSON.stringify(message.reasoning_details).length : 0);
}

function selectProviderMessages(messages: AssistantMessage[]): AssistantMessage[] {
  const system = messages.find((message) => message.role === 'system');
  const latestUserIndex = messages.map((message) => message.role).lastIndexOf('user');
  if (!system || latestUserIndex < 0) {
    throw new AssistantGuardrailError('Assistant context is invalid.', 400, 'ASSISTANT_CONTEXT_INVALID');
  }

  const required = messages.slice(latestUserIndex);
  let characters = assistantMessageTextCharacters(system)
    + required.reduce((total, message) => total + assistantMessageTextCharacters(message), 0);
  if (characters > ASSISTANT_MAX_CONTEXT_TEXT_CHARS) {
    throw new AssistantGuardrailError(
      'Assistant context is too large. Remove attachments or start a new chat.',
      413,
      'ASSISTANT_CONTEXT_TOO_LARGE',
    );
  }

  const older: AssistantMessage[] = [];
  for (let index = latestUserIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'system') continue;
    const cost = assistantMessageTextCharacters(message);
    if (characters + cost > ASSISTANT_MAX_CONTEXT_TEXT_CHARS) break;
    older.unshift(message);
    characters += cost;
  }
  return [system, ...older, ...required];
}

function buildProviderRequestBody(
  messages: AssistantMessage[],
  stream: boolean,
  selectedModel: AiModelDefinition,
  toolMode: 'all' | 'study-trial' | 'none' = 'all',
  compatibilityMode = false,
  completionTokenLimit = ASSISTANT_MAX_COMPLETION_TOKENS,
): string {
  const selectedMessages = selectProviderMessages(messages);
  const tools = toolMode === 'all'
    ? getAssistantTools()
    : toolMode === 'study-trial'
      ? getStudyTrialTools()
      : undefined;
  const body = JSON.stringify({
    model: selectedModel.providerModel,
    messages: selectedMessages.map(toOpenRouterMessage),
    tools,
    tool_choice: toolMode === 'study-trial' ? 'required' : tools ? 'auto' : undefined,
    plugins: !compatibilityMode && hasFileParserAttachments(selectedMessages)
      ? [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }]
      : undefined,
    reasoning: compatibilityMode ? undefined : getReasoningOptions(selectedMessages),
    max_tokens: Math.min(completionTokenLimit, selectedModel.maxCompletionTokens),
    provider: compatibilityMode
      ? undefined
      : tools ? { require_parameters: true } : { sort: 'throughput' },
    ...(stream ? { stream: true } : {}),
  });
  assertProviderPayloadSize(body);
  return body;
}

function normalizeProviderUsage(value: unknown) {
  if (!isRecord(value)) return null;
  const readMetric = (key: string) => {
    const metric = Number(value[key]);
    return Number.isFinite(metric) && metric >= 0 ? metric : undefined;
  };
  const usage = {
    prompt_tokens: readMetric('prompt_tokens'),
    completion_tokens: readMetric('completion_tokens'),
    total_tokens: readMetric('total_tokens'),
    cost: readMetric('cost'),
  };
  return Object.values(usage).some((metric) => metric !== undefined) ? usage : null;
}

function mergeProviderUsage(
  current: ReturnType<typeof normalizeProviderUsage>,
  next: ReturnType<typeof normalizeProviderUsage>,
) {
  if (!current) return next;
  if (!next) return current;
  const sum = (key: keyof NonNullable<ReturnType<typeof normalizeProviderUsage>>) => {
    const left = current[key];
    const right = next[key];
    return left === undefined && right === undefined ? undefined : Number(left || 0) + Number(right || 0);
  };
  return {
    prompt_tokens: sum('prompt_tokens'),
    completion_tokens: sum('completion_tokens'),
    total_tokens: sum('total_tokens'),
    cost: sum('cost'),
  };
}

async function loadAssistantState(userId: string): Promise<AssistantDashboardState> {
  const [user, preferences, localCalendar, themeBuilder, assistantState, notificationStates, flashcardSnapshot] = await Promise.all([
    getUserAssistantPortalSnapshot(userId),
    getUserPreferences(userId),
    getUserLocalCalendar(userId),
    getUserThemeBuilder(userId),
    getUserAssistantState(userId),
    getUserNotificationStates(userId),
    getUserFlashcardSnapshot(userId),
  ]);

  return {
    user: {
      name: user.name,
      school: user.school,
    },
    portalData: user.portalData,
    preferences: normalizeAssistantPreferences(preferences),
    localCalendar: {
      events: Array.isArray(localCalendar.events) ? localCalendar.events : [],
      calendars: Array.isArray(localCalendar.calendars) ? localCalendar.calendars : [],
    },
    themeBuilder: {
      state: themeBuilder.state || null,
      customThemes: Array.isArray(themeBuilder.customThemes) ? themeBuilder.customThemes : [],
    },
    notificationStates: notificationStates || {},
    skills: normalizeAssistantSkills(assistantState.skills),
    flashcardSets: flashcardSnapshot.sets,
    flashcardRevision: flashcardSnapshot.revision,
  };
}

/**
 * Writes real Study sets for a workflow the user authorised by name.
 *
 * Supplied only when a trial reservation is held, because the reservation is the record that the
 * user asked for these sets. Every other assistant Study mutation on a normalized account is a
 * draft the user approves. Sets are created one at a time and partial success is kept: a set that
 * committed is the user's, even if a later one in the batch failed.
 */
async function commitStudySetsForTrial(
  userId: string,
  service: StudyService,
  sets: Array<{ title: string; description: string; notes: AssistantStudyNote[] }>,
) {
  const created: Array<{ id: string; title: string; cardCount: number }> = [];

  for (const set of sets) {
    try {
      const deck = await service.saveDeck(userId, {
        deckId: crypto.randomUUID(),
        title: set.title,
        description: set.description,
      });

      let cardCount = 0;
      for (const note of set.notes) {
        try {
          const summary = await service.saveNote(userId, {
            noteId: crypto.randomUUID(),
            deckId: deck.id,
            noteType: note.noteType,
            fields: note.fields,
            tags: [],
          });
          cardCount = summary.cardCount;
        } catch (error) {
          // One malformed note does not cost the student the rest of the set.
          logger.warn('Study trial note could not be saved', error);
        }
      }

      if (cardCount > 0) created.push({ id: deck.id, title: deck.title, cardCount });
    } catch (error) {
      logger.error('Study trial set could not be created', error);
    }
  }

  return created;
}

async function createAssistantServices(
  userId: string,
  initialFlashcardRevision: number,
  options: { studyTrialAuthorized?: boolean } = {},
) {
  let flashcardRevision = initialFlashcardRevision;
  const repository = new SupabaseStudyRepository();
  // A cutover account no longer reads legacy JSONB, so a legacy write would be a silent no-op.
  const studyStorage = await repository.getStorageMode(userId).catch(() => 'legacy' as const);

  return {
    studyStorage,
    commitStudySets: options.studyTrialAuthorized && studyStorage === 'normalized'
      ? (sets: Array<{ title: string; description: string; notes: AssistantStudyNote[] }>) => (
        commitStudySetsForTrial(userId, new StudyService(repository), sets)
      )
      : undefined,
    createStudyDrafts: async (batch: { deckTitle: string; cards: Array<{ front: string; back: string }> }) => {
      const workshop = new StudyWorkshopService(repository);
      const result = await workshop.createDrafts(userId, {
        deckId: null,
        source: {
          sourceKind: 'pasted-text',
          title: batch.deckTitle,
          reference: 'Assistant conversation',
          // The conversation is the source of record for these suggestions.
          text: batch.cards.map((card) => `${card.front}\n${card.back}`).join('\n\n'),
          retention: 'session',
        },
        drafts: batch.cards.slice(0, 25).map((card) => ({
          noteType: 'basic',
          fields: { prompt: card.front, answer: card.back },
          tags: [],
          citation: `${card.front}\n${card.back}`,
        })),
        provider: 'assistant',
        model: '',
      });
      return { draftCount: result.draftCount };
    },
    savePreferences: async (updates: any) => normalizeAssistantPreferences(await updateUserPreferences(userId, updates)),
    saveLocalCalendar: async (payload: any) => updateUserLocalCalendar(userId, payload),
    saveThemeBuilder: async (payload: any) => updateUserThemeBuilder(userId, payload),
    saveNotificationStates: async (states: any) => updateUserNotificationStates(userId, states),
    saveSkills: async (skills: any[]) => normalizeAssistantSkills((await updateUserAssistantState(userId, { skills })).skills),
    saveFlashcardSets: async (sets: any[]) => {
      const snapshot = await saveUserFlashcardSets(userId, sets, flashcardRevision);
      flashcardRevision = snapshot.revision;
      return snapshot.sets;
    },
  };
}

function createThreadId() {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const THREAD_TITLE_MAX_LENGTH = 120;

function titleFromMessages(messages: AssistantMessage[]) {
  const firstUser = messages.find((message) => message.role === 'user')?.content?.trim();
  if (!firstUser) return 'New chat';
  return firstUser.replace(/\s+/g, ' ').slice(0, THREAD_TITLE_MAX_LENGTH);
}

function isDefaultThreadTitle(title: string) {
  return /^(new|untitled)\s+(chat|conversation|thread)$/i.test(title.trim());
}

function cleanThreadTitle(value: string) {
  const title = value
    .replace(/^["']|["']$/g, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) return 'New chat';
  return title
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && /^(a|an|and|as|at|but|by|for|in|of|on|or|the|to|with)$/.test(lower)) return lower;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .slice(0, THREAD_TITLE_MAX_LENGTH);
}

function fallbackThreadTitle(value: string) {
  const words = value
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !/^(please|can|could|would|make|create|add|show|tell|help|me|my|the|a|an|to|for|with|and|or)$/i.test(word))
    .slice(0, 8);
  return cleanThreadTitle(words.join(' ') || value);
}

function isBadGeneratedTitle(title: string) {
  if (!title || isDefaultThreadTitle(title)) return true;
  if (title.length > THREAD_TITLE_MAX_LENGTH || title.includes('\n')) return true;
  if (/[.!?]$/.test(title)) return true;
  if (/^(i|i'm|i am|i can|i can't|sure|here|please|the user|you|your|to)\b/i.test(title)) return true;
  return title.split(/\s+/).length > 14;
}

async function nameThreadWithOpenRouter(
  messages: AssistantMessage[],
  apiKey: string,
  deadline: AssistantDeadline,
) {
  const firstUser = messages.find((message) => message.role === 'user');
  const attachmentNames = firstUser?.attachments?.map((file) => file.name).join(', ') || '';
  const fallback = fallbackThreadTitle(`${firstUser?.content || ''} ${attachmentNames}`);
  let callDeadline: AssistantDeadline | null = null;
  try {
    callDeadline = createChildDeadline(deadline, ASSISTANT_TITLE_DEADLINE_MS);
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://millennium-five.vercel.app',
        'X-Title': process.env.OPENROUTER_APP_TITLE || 'Millennium Dashboard',
      },
      body: JSON.stringify({
        model: OPENROUTER_ASSISTANT_MODEL,
        messages: [
          {
            role: 'system',
            content: [
              'You generate chat thread titles.',
              'Return only a concise noun phrase, 3 to 10 words.',
              'Use Title Case capitalization.',
              'Prefer a useful task label over copying the user prompt.',
              'Do not answer the request. Do not use punctuation. Do not mention the user.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              request: firstUser?.content || '',
              files: attachmentNames,
            }),
          },
        ],
        temperature: 0.1,
        max_tokens: 32,
      }),
      signal: callDeadline.signal,
    });
    const payload = await readBoundedProviderJson(response);
    if (!response.ok) return fallback;
    const generatedTitle = cleanThreadTitle(extractAssistantText(
      isRecord(payload) && Array.isArray(payload.choices) ? payload.choices[0]?.message || {} : {},
    ));
    return isBadGeneratedTitle(generatedTitle) ? fallback : generatedTitle;
  } catch {
    return fallback;
  } finally {
    callDeadline?.clear();
  }
}

function upsertThread(
  threads: AssistantChatThread[],
  threadId: string | undefined,
  messages: AssistantMessage[],
  now = new Date(),
  titleOverride?: string
) {
  const normalizedThreads = normalizeAssistantThreads(threads);
  const existing = threadId ? normalizedThreads.find((thread) => thread.id === threadId) : null;
  const id = existing?.id || threadId || createThreadId();
  const timestamp = now.toISOString();
  const nextThread: AssistantChatThread = {
    id,
    title: titleOverride || (existing?.title && !isDefaultThreadTitle(existing.title) ? existing.title : titleFromMessages(messages)),
    messages: normalizeAssistantMessages(messages),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    pinned: existing?.pinned,
  };

  return {
    thread: nextThread,
    threads: normalizeAssistantThreads([
      nextThread,
      ...normalizedThreads.filter((thread) => thread.id !== id),
    ]),
  };
}

function providerRequestUrl(runtime: ProviderRuntime): string {
  return runtime.isByok
    ? assistantProviderEndpoint(runtime.provider)
    : OPENROUTER_CHAT_COMPLETIONS_URL;
}

function providerRequestHeaders(runtime: ProviderRuntime): Record<string, string> {
  const headers = assistantProviderHeaders(runtime);
  if (runtime.provider === 'openrouter') {
    headers['X-OpenRouter-Experimental-Metadata'] = 'enabled';
  }
  return headers;
}

function anthropicTextAndImages(message: AssistantMessage): any[] {
  const openAiMessage = toOpenRouterMessage(message) as any;
  if (!Array.isArray(openAiMessage.content)) {
    return [{ type: 'text', text: String(openAiMessage.content || ' ') }];
  }
  const blocks = openAiMessage.content.flatMap((part: any) => {
    if (part?.type === 'text' && typeof part.text === 'string') {
      return [{ type: 'text', text: part.text }];
    }
    const dataUrl = part?.type === 'image_url' ? part.image_url?.url : null;
    const match = typeof dataUrl === 'string'
      ? /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(dataUrl)
      : null;
    if (match) {
      return [{
        type: 'image',
        source: { type: 'base64', media_type: match[1], data: match[2] },
      }];
    }
    return [];
  });
  return blocks.length > 0 ? blocks : [{ type: 'text', text: ' ' }];
}

function anthropicTools(toolMode: 'all' | 'study-trial' | 'none') {
  const tools = toolMode === 'all'
    ? getAssistantTools()
    : toolMode === 'study-trial' ? getStudyTrialTools() : [];
  return tools.map((tool: any) => ({
    name: tool.function?.name,
    description: tool.function?.description,
    input_schema: tool.function?.parameters || { type: 'object', properties: {} },
  }));
}

function buildAnthropicRequestBody(
  messages: AssistantMessage[],
  stream: boolean,
  selectedModel: AiModelDefinition,
  toolMode: 'all' | 'study-trial' | 'none',
  completionTokenLimit: number,
): string {
  const selectedMessages = selectProviderMessages(messages);
  const system = selectedMessages.find((message) => message.role === 'system')?.content || '';
  const converted: Array<{ role: 'user' | 'assistant'; content: any[] }> = [];

  for (const message of selectedMessages) {
    if (message.role === 'system') continue;
    let role: 'user' | 'assistant';
    let content: any[];
    if (message.role === 'tool') {
      role = 'user';
      content = [{
        type: 'tool_result',
        tool_use_id: message.tool_call_id,
        content: message.content || ' ',
      }];
    } else if (message.role === 'assistant') {
      role = 'assistant';
      content = [
        ...(message.content ? [{ type: 'text', text: message.content }] : []),
        ...(message.tool_calls || []).map((toolCall) => {
          const input = normalizeAssistantToolArguments(toolCall.function.arguments) || '{}';
          return {
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(input),
          };
        }),
      ];
      if (content.length === 0) content = [{ type: 'text', text: ' ' }];
    } else {
      role = 'user';
      content = anthropicTextAndImages(message);
    }

    const previous = converted.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else converted.push({ role, content });
  }

  const tools = anthropicTools(toolMode);
  const body = JSON.stringify({
    model: selectedModel.providerModel,
    system,
    messages: converted,
    max_tokens: Math.min(completionTokenLimit, selectedModel.maxCompletionTokens),
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: toolMode === 'study-trial' ? { type: 'any' } : undefined,
    stream: stream || undefined,
  });
  assertProviderPayloadSize(body);
  return body;
}

function normalizeAnthropicUsage(value: unknown) {
  if (!isRecord(value)) return null;
  const promptTokens = Number(value.input_tokens);
  const completionTokens = Number(value.output_tokens);
  const usage = {
    prompt_tokens: Number.isFinite(promptTokens) && promptTokens >= 0 ? promptTokens : undefined,
    completion_tokens: Number.isFinite(completionTokens) && completionTokens >= 0 ? completionTokens : undefined,
    total_tokens: Number.isFinite(promptTokens + completionTokens)
      ? Math.max(0, promptTokens) + Math.max(0, completionTokens)
      : undefined,
    cost: undefined,
  };
  return Object.values(usage).some((metric) => metric !== undefined) ? usage : null;
}

function anthropicFailure(status: number, payload: unknown) {
  return openRouterFailure(status, payload);
}

async function callAnthropic(
  messages: AssistantMessage[],
  runtime: ProviderRuntime,
  deadline: AssistantDeadline,
  selectedModel: AiModelDefinition,
) {
  const callDeadline = createChildDeadline(deadline, ASSISTANT_PROVIDER_CALL_DEADLINE_MS);
  try {
    const response = await fetch(providerRequestUrl(runtime), {
      method: 'POST',
      headers: providerRequestHeaders(runtime),
      body: buildAnthropicRequestBody(
        messages,
        false,
        selectedModel,
        'all',
        ASSISTANT_MAX_COMPLETION_TOKENS,
      ),
      signal: callDeadline.signal,
    });
    const payload = await readBoundedProviderJson(response);
    if (!response.ok) throw anthropicFailure(response.status, payload);
    if (!isRecord(payload) || !Array.isArray(payload.content)) {
      throw new OpenRouterRequestError(502, 'Provider returned an invalid response');
    }
    const content = payload.content
      .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
      .map((block: any) => block.text)
      .join('\n')
      .trim();
    const thinking = payload.content
      .filter((block: any) => block?.type === 'thinking' && typeof block.thinking === 'string')
      .map((block: any) => block.thinking)
      .join('\n')
      .trim();
    const toolCalls = payload.content
      .filter((block: any) => block?.type === 'tool_use')
      .map((block: any) => ({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input || {}) },
      }));
    return {
      content,
      thinking,
      toolCalls: normalizeToolCalls(toolCalls),
      reasoningDetails: [],
      model: typeof payload.model === 'string' ? payload.model.slice(0, 160) : selectedModel.providerModel,
      usage: normalizeAnthropicUsage(payload.usage),
    };
  } catch (error) {
    if (error instanceof OpenRouterRequestError || error instanceof AssistantGuardrailError) throw error;
    throw new OpenRouterRequestError(
      callDeadline.signal.aborted ? 504 : 502,
      callDeadline.signal.aborted ? 'Provider request timed out.' : 'Provider connection failed.',
    );
  } finally {
    callDeadline.clear();
  }
}

async function callOpenRouter(
  messages: AssistantMessage[],
  runtime: ProviderRuntime,
  deadline: AssistantDeadline,
  selectedModel: AiModelDefinition,
) {
  if (runtime.provider === 'anthropic') {
    return callAnthropic(messages, runtime, deadline, selectedModel);
  }
  const callDeadline = createChildDeadline(deadline, ASSISTANT_PROVIDER_CALL_DEADLINE_MS);
  try {
    const request = (compatibilityMode: boolean) => fetch(providerRequestUrl(runtime), {
      method: 'POST',
      headers: providerRequestHeaders(runtime),
      body: buildProviderRequestBody(
        messages,
        false,
        selectedModel,
        'all',
        compatibilityMode || runtime.provider !== 'openrouter',
      ),
      signal: callDeadline.signal,
    });

    let response = await request(false);
    let payload = await readBoundedProviderJson(response);
    if (!response.ok && shouldRetryProviderRequest(response.status)) {
      logger.warn('Retrying assistant provider request with compatibility options', {
        status: response.status,
        model: selectedModel.providerModel,
        detail: extractOpenRouterError(payload),
      });
      response = await request(true);
      payload = await readBoundedProviderJson(response);
    }
    if (!response.ok) throw openRouterFailure(response.status, payload);
    if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0]?.message)) {
      throw new OpenRouterRequestError(502, 'Provider returned an invalid response');
    }

    const message = payload.choices[0].message;
    const assistantResponse = extractAssistantResponse(message);
    if (
      assistantResponse.content.length > ASSISTANT_MAX_RESPONSE_CHARS
      || assistantResponse.thinking.length > ASSISTANT_MAX_REASONING_CHARS
    ) {
      throw new OpenRouterRequestError(502, 'Provider response exceeded output limits');
    }
    return {
      content: assistantResponse.content,
      thinking: assistantResponse.thinking,
      toolCalls: normalizeToolCalls(message.tool_calls),
      reasoningDetails: Array.isArray(message.reasoning_details) ? message.reasoning_details : [],
      model: typeof payload.model === 'string' ? payload.model.slice(0, 160) : selectedModel.providerModel,
      usage: normalizeProviderUsage(payload.usage),
    };
  } catch (error) {
    if (error instanceof OpenRouterRequestError || error instanceof AssistantGuardrailError) throw error;
    throw new OpenRouterRequestError(
      callDeadline.signal.aborted ? 504 : 502,
      callDeadline.signal.aborted ? 'Provider request timed out.' : 'Provider connection failed.',
    );
  } finally {
    callDeadline.clear();
  }
}

async function callAnthropicStream(
  messages: AssistantMessage[],
  runtime: ProviderRuntime,
  deadline: AssistantDeadline,
  emit: (event: string, data: unknown) => void,
  includeRawThinking: boolean,
  selectedModel: AiModelDefinition,
  toolMode: 'all' | 'study-trial' | 'none',
  completionTokenLimit: number,
) {
  const callDeadline = createChildDeadline(deadline, ASSISTANT_PROVIDER_STREAM_DEADLINE_MS);
  try {
    const response = await fetch(providerRequestUrl(runtime), {
      method: 'POST',
      headers: providerRequestHeaders(runtime),
      body: buildAnthropicRequestBody(
        messages,
        true,
        selectedModel,
        toolMode,
        completionTokenLimit,
      ),
      signal: callDeadline.signal,
    });
    if (!response.ok || !response.body) {
      const payload = response.body
        ? await readBoundedProviderJson(response).catch(() => null)
        : null;
      throw anthropicFailure(response.status || 502, payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolBlocks = new Map<number, { id: string; name: string; arguments: string }>();
    let buffer = '';
    let content = '';
    let thinking = '';
    let receivedBytes = 0;
    let model = selectedModel.providerModel;
    let usage: ReturnType<typeof normalizeProviderUsage> = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > ASSISTANT_MAX_PROVIDER_RESPONSE_BYTES) {
          throw new OpenRouterRequestError(502, 'Provider stream exceeded its size limit');
        }
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const raw = chunk
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.replace(/^data:\s*/, ''))
            .join('\n')
            .trim();
          if (!raw) continue;
          let payload: unknown;
          try {
            payload = JSON.parse(raw);
          } catch {
            throw new OpenRouterRequestError(502, 'Provider stream contained invalid JSON');
          }
          if (!isRecord(payload)) {
            throw new OpenRouterRequestError(502, 'Provider stream payload was invalid');
          }
          if (payload.type === 'error') throw anthropicFailure(502, payload);

          if (payload.type === 'message_start' && isRecord(payload.message)) {
            if (typeof payload.message.model === 'string') model = payload.message.model.slice(0, 160);
            usage = mergeProviderUsage(usage, normalizeAnthropicUsage(payload.message.usage));
          }
          if (payload.type === 'message_delta') {
            usage = mergeProviderUsage(usage, normalizeAnthropicUsage(payload.usage));
          }

          const index = Number(payload.index);
          if (
            payload.type === 'content_block_start'
            && Number.isInteger(index)
            && isRecord(payload.content_block)
            && payload.content_block.type === 'tool_use'
          ) {
            const id = typeof payload.content_block.id === 'string'
              ? payload.content_block.id.slice(0, 200)
              : `tool-${index + 1}`;
            const name = typeof payload.content_block.name === 'string'
              ? payload.content_block.name.slice(0, 100)
              : '';
            toolBlocks.set(index, { id, name, arguments: '' });
            if (isKnownAssistantAction(name)) emit('status', { message: `Using ${name}` });
          }

          if (payload.type !== 'content_block_delta' || !isRecord(payload.delta)) continue;
          if (payload.delta.type === 'text_delta' && typeof payload.delta.text === 'string') {
            if (content.length + payload.delta.text.length > ASSISTANT_MAX_RESPONSE_CHARS) {
              throw new OpenRouterRequestError(502, 'Provider stream exceeded output limits');
            }
            content += payload.delta.text;
            emit('delta', { content: payload.delta.text, thinking: '' });
          } else if (
            payload.delta.type === 'thinking_delta'
            && typeof payload.delta.thinking === 'string'
          ) {
            if (thinking.length + payload.delta.thinking.length > ASSISTANT_MAX_REASONING_CHARS) {
              throw new OpenRouterRequestError(502, 'Provider stream exceeded output limits');
            }
            thinking += payload.delta.thinking;
            if (includeRawThinking) emit('delta', { content: '', thinking: payload.delta.thinking });
          } else if (
            payload.delta.type === 'input_json_delta'
            && typeof payload.delta.partial_json === 'string'
            && Number.isInteger(index)
          ) {
            const block = toolBlocks.get(index);
            if (!block) continue;
            block.arguments += payload.delta.partial_json;
            if (block.arguments.length > ASSISTANT_MAX_TOOL_ARGUMENT_CHARS) {
              throw new OpenRouterRequestError(502, 'Provider tool arguments exceeded their size limit');
            }
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    const toolCalls = [...toolBlocks.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, block]) => ({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: block.arguments || '{}' },
      }));
    return {
      content: content.trim(),
      thinking: thinking.trim(),
      toolCalls: normalizeToolCalls(toolCalls),
      reasoningDetails: [],
      model,
      usage,
    };
  } catch (error) {
    if (error instanceof OpenRouterRequestError || error instanceof AssistantGuardrailError) throw error;
    throw new OpenRouterRequestError(
      callDeadline.signal.aborted ? 504 : 502,
      callDeadline.signal.aborted ? 'Provider request timed out.' : 'Provider connection failed.',
    );
  } finally {
    callDeadline.clear();
  }
}

async function callOpenRouterStream(
  messages: AssistantMessage[],
  runtime: ProviderRuntime,
  deadline: AssistantDeadline,
  emit: (event: string, data: unknown) => void,
  includeRawThinking = true,
  selectedModel: AiModelDefinition,
  toolMode: 'all' | 'study-trial' | 'none' = 'all',
  completionTokenLimit = ASSISTANT_MAX_COMPLETION_TOKENS,
) {
  if (runtime.provider === 'anthropic') {
    return callAnthropicStream(
      messages,
      runtime,
      deadline,
      emit,
      includeRawThinking,
      selectedModel,
      toolMode,
      completionTokenLimit,
    );
  }
  const callDeadline = createChildDeadline(deadline, ASSISTANT_PROVIDER_STREAM_DEADLINE_MS);
  try {
    const request = (compatibilityMode: boolean) => fetch(providerRequestUrl(runtime), {
      method: 'POST',
      headers: providerRequestHeaders(runtime),
      body: buildProviderRequestBody(
        messages,
        true,
        selectedModel,
        toolMode,
        compatibilityMode || runtime.provider !== 'openrouter',
        completionTokenLimit,
      ),
      signal: callDeadline.signal,
    });

    let response = await request(false);
    if (!response.ok && shouldRetryProviderRequest(response.status)) {
      const payload = await readBoundedProviderJson(response).catch(() => null);
      logger.warn('Retrying assistant provider stream with compatibility options', {
        status: response.status,
        model: selectedModel.providerModel,
        detail: extractOpenRouterError(payload),
      });
      response = await request(true);
    }
    if (!response.ok || !response.body) {
      const payload = response.body
        ? await readBoundedProviderJson(response).catch(() => null)
        : null;
      throw openRouterFailure(response.status || 502, payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolCalls: AssistantToolCall[] = [];
    const emittedToolNames = new Set<string>();
    let lastReasoning = '';
    let lastReasoningContent = '';
    let lastReasoningDetails = '';
    const thinkingState = { inThink: false, carry: '' };
    let buffer = '';
    let content = '';
    let thinking = '';
    const rawReasoningDetails: unknown[] = [];
    let receivedBytes = 0;
    let usage: ReturnType<typeof normalizeProviderUsage> = null;
    let resolvedModel = selectedModel.providerModel;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > ASSISTANT_MAX_PROVIDER_RESPONSE_BYTES) {
          throw new OpenRouterRequestError(502, 'Provider stream exceeded its size limit');
        }
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const dataLine = chunk.split('\n').find((line) => line.startsWith('data:'));
          const raw = dataLine?.replace(/^data:\s*/, '').trim();
          if (!raw || raw === '[DONE]') continue;
          let payload: unknown;
          try {
            payload = JSON.parse(raw);
          } catch {
            throw new OpenRouterRequestError(502, 'Provider stream contained invalid JSON');
          }
          if (!isRecord(payload)) throw new OpenRouterRequestError(502, 'Provider stream payload was invalid');
          if (payload.error) {
            const status = Number(isRecord(payload.error) ? payload.error.code : 0);
            throw openRouterFailure(Number.isFinite(status) && status >= 400 ? status : 502, payload);
          }
          if (typeof payload.model === 'string') resolvedModel = payload.model.slice(0, 160);
          usage = normalizeProviderUsage(payload.usage) || usage;
          const choice = Array.isArray(payload.choices) && isRecord(payload.choices[0]) ? payload.choices[0] : {};
          const delta = isRecord(choice.delta) ? choice.delta : {};
          const splitContent = splitThinkingText(extractAssistantText(delta), thinkingState);
          const contentDelta = splitContent.content;
          const reasoning = appendIncrementalText(lastReasoning, delta.reasoning);
          const reasoningContent = appendIncrementalText(lastReasoningContent, delta.reasoning_content);
          const reasoningDetails = appendIncrementalText(lastReasoningDetails, extractReasoningDetails(delta.reasoning_details));
          if (Array.isArray(delta.reasoning_details)) {
            rawReasoningDetails.push(...delta.reasoning_details);
          }
          lastReasoning = reasoning.value.slice(0, ASSISTANT_MAX_REASONING_CHARS);
          lastReasoningContent = reasoningContent.value.slice(0, ASSISTANT_MAX_REASONING_CHARS);
          lastReasoningDetails = reasoningDetails.value.slice(0, ASSISTANT_MAX_REASONING_CHARS);
          const thinkingDelta = [
            splitContent.thinking,
            reasoning.delta,
            reasoningContent.delta,
            reasoningDetails.delta,
          ].filter((part) => typeof part === 'string' && part.trim()).join('\n');

          if (
            content.length + contentDelta.length > ASSISTANT_MAX_RESPONSE_CHARS
            || thinking.length + thinkingDelta.length > ASSISTANT_MAX_REASONING_CHARS
          ) {
            throw new OpenRouterRequestError(502, 'Provider stream exceeded output limits');
          }
          if (contentDelta || (includeRawThinking && thinkingDelta)) {
            content += contentDelta;
            if (includeRawThinking) thinking += thinkingDelta;
            emit('delta', { content: contentDelta, thinking: includeRawThinking ? thinkingDelta : '' });
          }

          if (Array.isArray(delta.tool_calls)) {
            delta.tool_calls.forEach((toolCall: any) => appendToolCallDelta(toolCalls, toolCall));
            toolCalls.forEach((toolCall) => {
              const name = toolCall.function.name;
              if (!isKnownAssistantAction(name) || emittedToolNames.has(name)) return;
              emittedToolNames.add(name);
              emit('status', { message: `Using ${name.slice(0, 100)}` });
            });
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    if (thinkingState.carry) {
      const contentDelta = thinkingState.inThink ? '' : thinkingState.carry;
      const thinkingDelta = thinkingState.inThink ? thinkingState.carry : '';
      if (content.length + contentDelta.length > ASSISTANT_MAX_RESPONSE_CHARS) {
        throw new OpenRouterRequestError(502, 'Provider stream exceeded output limits');
      }
      content += contentDelta;
      if (includeRawThinking) thinking += thinkingDelta;
      emit('delta', { content: contentDelta, thinking: includeRawThinking ? thinkingDelta : '' });
    }

    return {
      content: content.trim(),
      thinking: thinking.trim(),
      toolCalls: normalizeToolCalls(toolCalls),
      reasoningDetails: rawReasoningDetails,
      model: resolvedModel,
      usage,
    };
  } catch (error) {
    if (error instanceof OpenRouterRequestError || error instanceof AssistantGuardrailError) throw error;
    throw new OpenRouterRequestError(
      callDeadline.signal.aborted ? 504 : 502,
      callDeadline.signal.aborted ? 'Provider request timed out.' : 'Provider connection failed.',
    );
  } finally {
    callDeadline.clear();
  }
}

function streamAssistantResponse(
  body: Record<string, any>,
  userId: string,
  providerRuntime: ProviderRuntime,
  requestSignal: AbortSignal,
  selectedModel: AiModelDefinition,
  planTier: AiPlanTier,
  studyTrialReservationId: string | null = null,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const deadline = createAssistantDeadline(ASSISTANT_REQUEST_DEADLINE_MS, requestSignal);
      let streamOpen = true;
      const emit = (event: string, data: unknown) => {
        if (!streamOpen) return;
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          streamOpen = false;
        }
      };
      try {
        emit('status', { message: 'Loading classes, calendar, and flashcards' });
        const summarizeThinking = body.summarizeThinking !== false;
        const userMessages = normalizeAssistantMessages(body.messages);
        if (userMessages.length === 0) {
          emit('error', { message: 'At least one user message is required.' });
          return;
        }

        const [state, assistantState] = await Promise.all([
          loadAssistantState(userId),
          getUserAssistantState(userId),
        ]);
        const savedThreads = normalizeAssistantThreads(assistantState.threads);
        const actionResults: any[] = [];
        const standardSystemPrompt = buildAssistantSystemPrompt(state);
        const systemPrompt = studyTrialReservationId
          ? `${standardSystemPrompt.slice(0, STUDY_TRIAL_MAX_SYSTEM_CHARS)}\n\n${STUDY_TRIAL_SYSTEM_PROMPT}`
          : standardSystemPrompt;
        const messages: AssistantMessage[] = [
          { role: 'system', content: systemPrompt },
          ...userMessages,
        ];
        const services = await createAssistantServices(userId, state.flashcardRevision ?? 0, {
          studyTrialAuthorized: Boolean(studyTrialReservationId),
        });

        let finalText = '';
        let finalThinking = '';
        let model = selectedModel.providerModel;
        let requestModel = selectedModel;
        let usage: any = null;
        const pendingActions: AssistantToolCall[] = [];
        const requestStartedAt = Date.now();
        let totalToolCalls = 0;
        let toolLoopExhausted = false;

        const maximumSteps = studyTrialReservationId ? 2 : ASSISTANT_MAX_CHAT_STEPS;
        for (let step = 0; step < maximumSteps; step += 1) {
          deadline.throwIfExpired();
          emit('status', { message: `Thinking with ${selectedModel.label}` });
          const trialFlashcardsCreated = actionResults.some(
            (result) => result.action === 'create_flashcard_sets' && result.ok,
          );
          const result = await callOpenRouterStream(
            messages,
            providerRuntime,
            deadline,
            emit,
            !summarizeThinking,
            requestModel,
            studyTrialReservationId
              ? trialFlashcardsCreated ? 'none' : 'study-trial'
              : 'all',
            studyTrialReservationId
              ? STUDY_TRIAL_MAX_COMPLETION_TOKENS
              : ASSISTANT_MAX_COMPLETION_TOKENS,
          );
          await recordAiUsage({
            userId,
            model: selectedModel,
            usage: result.usage,
            feature: studyTrialReservationId ? 'study-trial' : 'assistant',
          });
          model = result.model;
          requestModel = modelForNextToolRound(selectedModel, result.model);
          usage = mergeProviderUsage(usage, result.usage);
          finalText = result.content;
          finalThinking = [finalThinking, result.thinking].filter(Boolean).join('\n\n');

          if (result.toolCalls.length === 0) break;
          if (
            studyTrialReservationId
            && (result.toolCalls.length !== 1 || totalToolCalls > 0 || result.toolCalls[0]?.function.name !== 'create_flashcard_sets')
          ) {
            throw new AssistantGuardrailError(
              'Subject flashcard trial attempted an invalid tool sequence. Your trial was not consumed.',
              422,
              'STUDY_TRIAL_TOOL_SEQUENCE',
            );
          }
          totalToolCalls += result.toolCalls.length;
          if (totalToolCalls > ASSISTANT_MAX_TOTAL_TOOL_CALLS) {
            throw new AssistantGuardrailError(
              'Assistant reached its safe tool-use limit. Continue in a new message.',
              422,
              'ASSISTANT_TOOL_LIMIT',
            );
          }

          messages.push({
            role: 'assistant',
            content: result.content || '',
            tool_calls: result.toolCalls,
            reasoning_details: result.reasoningDetails,
          });
          for (const toolCall of result.toolCalls) {
            const authorizedTrialAction = Boolean(studyTrialReservationId)
              && toolCall.function.name === 'create_flashcard_sets';
            if (isMutatingAssistantAction(toolCall.function.name) && !authorizedTrialAction) {
              pendingActions.push(toolCall);
              emit('status', { message: `Approval required for ${toolCall.function.name}` });
              continue;
            }
            const actionResult = await executeAssistantAction(toolCall.function.name, toolCall.function.arguments, state, services);
            if (authorizedTrialAction && !actionResult.ok) {
              throw new AssistantGuardrailError(
                `${actionResult.message} Your trial was not consumed.`,
                422,
                'STUDY_TRIAL_FLASHCARD_CREATION_FAILED',
              );
            }
            actionResults.push(actionResult);
            finalThinking = [finalThinking, actionResult.message].filter(Boolean).join('\n');
            emit('status', { message: actionResult.message, action: actionResult.action, ok: actionResult.ok });
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: serializeBoundedToolResult({
                source: 'millennium-dashboard-tool',
                untrusted: true,
                result: actionResult,
              }),
            });
          }
          if (pendingActions.length > 0) break;
          if (
            studyTrialReservationId
            && actionResults.some((result) => result.action === 'create_flashcard_sets' && result.ok)
          ) break;
          if (step === maximumSteps - 1) toolLoopExhausted = true;
        }

        if (toolLoopExhausted && pendingActions.length === 0) {
          finalText = 'Assistant reached its safe tool-use limit. Continue in a new message.';
        }

        const createdTrialSets = actionResults.flatMap((result) => (
          result.action === 'create_flashcard_sets'
          && result.ok
          && Array.isArray(result.data?.created)
            ? result.data.created
            : []
        ));
        if (studyTrialReservationId && createdTrialSets.length === 0) {
          throw new AssistantGuardrailError(
            'Subject flashcards were not created. Your trial was not consumed; try again.',
            422,
            'STUDY_TRIAL_FLASHCARDS_REQUIRED',
          );
        }
        if (studyTrialReservationId) {
          const createdTitles = createdTrialSets
            .map((set) => typeof set?.title === 'string' ? set.title : '')
            .filter(Boolean)
            .join(', ');
          finalText = `Created ${createdTrialSets.length} subject flashcard set${createdTrialSets.length === 1 ? '' : 's'}${createdTitles ? `: ${createdTitles}` : ''}. Cards were selected using your enrolled classes, current date, year level, and known school calendar events.`;
          emit('delta', { content: finalText, thinking: '' });
        }

        const pendingApproval = pendingActions.length > 0
          ? await createAssistantActionApproval(userId, typeof body.threadId === 'string' ? body.threadId : null, pendingActions.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          })))
          : null;
        if (pendingApproval) {
          finalText = `${pendingActions.length} proposed dashboard change${pendingActions.length === 1 ? '' : 's'} need your approval.`;
        }

        if (!finalText && actionResults.length > 0) {
          finalText = actionResults.map((result) => result.message).join('\n');
          emit('delta', { content: finalText, thinking: '' });
        }

        const visibleMessages = [
          ...userMessages.map((message) => ({
            role: message.role,
            content: message.content,
            attachments: message.attachments?.map((file) => ({
              id: file.id,
              name: file.name,
              type: file.type,
              size: file.size,
              truncated: file.truncated,
            })),
          })),
          {
            role: 'assistant' as const,
            content: finalText || 'Done.',
            thinking: finalThinking || undefined,
            thinkingSeconds: Math.max(1, Math.ceil((Date.now() - requestStartedAt) / 1000)),
          },
        ];
        const existingThread = body.threadId ? savedThreads.find((thread) => thread.id === body.threadId) : null;
        const promptTitle = titleFromMessages(userMessages);
        emit('status', { message: 'Saving conversation' });
        const generatedTitle = studyTrialReservationId
          ? 'Frontier Subject Flashcards'
          : existingThread?.title && !isDefaultThreadTitle(existingThread.title) && existingThread.title !== promptTitle
            ? undefined
            : process.env.OPENROUTER_API_KEY
              ? await nameThreadWithOpenRouter(userMessages, process.env.OPENROUTER_API_KEY, deadline)
              : fallbackThreadTitle(promptTitle);
        deadline.throwIfExpired();
        const { thread, threads } = upsertThread(savedThreads, body.threadId, visibleMessages, new Date(), generatedTitle);
        await updateUserAssistantState(userId, { threads, skills: state.skills });
        const trial = studyTrialReservationId
          ? await completeStudyTrial({
            userId,
            reservationId: studyTrialReservationId,
            model: selectedModel,
            usage,
            summary: finalText || `Created ${createdTrialSets.length} subject flashcard sets.`,
            createdSets: createdTrialSets,
            threadId: thread.id,
          })
          : null;

        emit('done', {
          message: finalText || 'Done.',
          model,
          configuredModel: selectedModel.providerModel,
          planTier,
          actions: actionResults,
          pendingApproval,
          thread,
          usage,
          trial,
        });
      } catch (error: any) {
        if (studyTrialReservationId) {
          await failStudyTrial(userId, studyTrialReservationId);
        }
        logger.error('Assistant streaming request failed', error);
        emit('error', {
          message: error instanceof AssistantGuardrailError
            ? error.message
            : error instanceof OpenRouterRequestError
              ? error.message
              : 'Assistant request failed.',
          upstreamStatus: error instanceof OpenRouterRequestError ? error.status : undefined,
          model: selectedModel.providerModel,
        });
      } finally {
        deadline.clear();
        if (streamOpen) {
          try {
            controller.close();
          } catch {
            // Client disconnected.
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export const Route = createFileRoute('/api/assistant/chat')({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }
        const crossOriginResponse = crossOriginMutationResponse(request);
        if (crossOriginResponse) return crossOriginResponse;

        let approvalConsumed = false;
        const deadline = createAssistantDeadline(ASSISTANT_APPROVAL_DEADLINE_MS, request.signal);
        try {
          const limit = await consumeRateLimit('assistant-approval-apply', session.userId, 30, 5 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const body = await readJsonBody<unknown>(request, ASSISTANT_APPROVAL_BODY_MAX_BYTES);
          if (!validateApprovalBody(body)) {
            return Response.json({ message: 'Approval request is invalid.' }, { status: 400, headers: noStoreHeaders });
          }
          const approvedActions = await consumeAssistantActionApproval(session.userId, body.approvalId, body.actions);
          if (!approvedActions) {
            return Response.json(
              { message: 'Approval expired, was already used, or is invalid.' },
              { status: 409, headers: noStoreHeaders },
            );
          }
          approvalConsumed = true;

          deadline.throwIfExpired();
          const state = await loadAssistantState(session.userId);
          const services = await createAssistantServices(session.userId, state.flashcardRevision ?? 0);
          const results = [];
          for (const action of approvedActions) {
            deadline.throwIfExpired();
            if (!isMutatingAssistantAction(action.name)) {
              return Response.json(
                { message: 'Approval contains an invalid action.' },
                { status: 400, headers: noStoreHeaders },
              );
            }
            try {
              results.push(await executeAssistantAction(action.name, action.arguments, state, services));
            } catch (error) {
              logger.error(`Approved assistant action failed: ${action.name}`, error);
              results.push({
                action: action.name,
                ok: false,
                message: 'Approved action failed.',
              });
              break;
            }
          }

          const complete = results.length === approvedActions.length && results.every((result) => result.ok);
          return Response.json(
            { success: complete, actions: results },
            { status: complete ? 200 : 207, headers: noStoreHeaders },
          );
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const guardrailError = assistantGuardrailErrorResponse(error, noStoreHeaders);
          if (guardrailError) return guardrailError;
          logger.error('Approved assistant action batch failed', error);
          return Response.json({
            message: approvalConsumed
              ? 'Approved changes could not be completed. Review current dashboard state before proposing them again.'
              : 'Failed to apply approved actions.',
            approvalConsumed,
          }, { status: 500, headers: noStoreHeaders });
        } finally {
          deadline.clear();
        }
      },
      POST: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }
        const crossOriginResponse = crossOriginMutationResponse(request);
        if (crossOriginResponse) return crossOriginResponse;

        const limit = await consumeRateLimit('assistant-chat', session.userId, 20, 10 * 60);
        if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

        let body: Record<string, any>;
        try {
          const rawBody = await readJsonBody<unknown>(request, ASSISTANT_CHAT_BODY_MAX_BYTES);
          if (!validateChatBody(rawBody)) {
            return Response.json(
              { message: 'Assistant request is invalid or exceeds context limits.' },
              { status: 400, headers: noStoreHeaders },
            );
          }
          body = rawBody;
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          logger.error('Assistant request body read failed', error);
          return Response.json({ message: 'Assistant request failed.' }, { status: 500, headers: noStoreHeaders });
        }

        let selectedModel: AiModelDefinition;
        let planTier: AiPlanTier;
        let providerRuntime: ProviderRuntime;
        /**
         * The one-time frontier flashcard trial shipped with paid tiers and has been withdrawn
         * along with them. It stays null for every request, so the downstream branches that used
         * to grant it a wider tool budget and the `create_flashcard_sets` approval exception now
         * always take the ordinary, approval-gated path.
         *
         * A request still asking for it is refused below rather than ignored: the trial was the
         * one route on which a model-proposed mutation could execute without a user approval, and
         * silently downgrading such a request would leave a caller believing it had that grant.
         */
        const studyTrialReservationId: string | null = null;
        if (body.studyTrial === true) {
          return Response.json(
            { message: 'The frontier flashcard trial is no longer available.' },
            { status: 410, headers: noStoreHeaders },
          );
        }

        {
          try {
            const byokMatch = typeof body.modelId === 'string'
              ? /^byok:([0-9a-f-]{36})$/i.exec(body.modelId)
              : null;
            if (byokMatch) {
              const connection = await getAssistantProviderRuntime(session.userId, byokMatch[1]);
              if (!connection) {
                return Response.json(
                  { message: 'Provider connection no longer exists.' },
                  { status: 404, headers: noStoreHeaders },
                );
              }
              providerRuntime = {
                provider: connection.provider,
                authMode: connection.authMode,
                credential: connection.credential,
                isByok: true,
              };
              selectedModel = {
                id: body.modelId,
                label: connection.label,
                providerModel: connection.model,
                minimumTier: 'free',
                lab: connection.provider,
                description: `Your ${connection.provider} account`,
                maxCompletionTokens: 4_000,
                promptPricePerToken: 0,
                completionPricePerToken: 0,
              } as AiModelDefinition;
              planTier = 'free';
            } else {
              const apiKey = process.env.OPENROUTER_API_KEY;
              if (!apiKey) {
                return Response.json({
                  message: 'Built-in AI provider is not configured. Connect your own provider in Settings.',
                  model: OPENROUTER_ASSISTANT_MODEL,
                }, { status: 503, headers: noStoreHeaders });
              }
              providerRuntime = builtInProviderRuntime(apiKey);
              const modelAccess = await resolveAiModelForUser(session.userId, body.modelId);
              await assertAiBudget(session.userId, modelAccess.billing.tier);
              selectedModel = modelAccess.model;
              planTier = modelAccess.billing.tier;
            }
          } catch (error) {
            const status = Number((error as Error & { status?: number })?.status) || 500;
            return Response.json(
              { message: error instanceof Error ? error.message : 'Could not verify model access.' },
              { status, headers: noStoreHeaders },
            );
          }
        }

        if (request.headers.get('accept')?.includes('text/event-stream')) {
          return streamAssistantResponse(
            body,
            session.userId,
            providerRuntime,
            request.signal,
            selectedModel,
            planTier,
            studyTrialReservationId,
          );
        }

        const deadline = createAssistantDeadline(ASSISTANT_REQUEST_DEADLINE_MS, request.signal);
        try {
          const summarizeThinking = body.summarizeThinking !== false;
          const userMessages = normalizeAssistantMessages(body.messages);
          if (userMessages.length === 0) {
            return Response.json(
              { message: 'At least one user message is required.' },
              { status: 400, headers: noStoreHeaders },
            );
          }

          const [state, assistantState] = await Promise.all([
            loadAssistantState(session.userId),
            getUserAssistantState(session.userId),
          ]);
          const savedThreads = normalizeAssistantThreads(assistantState.threads);
          const actionResults: any[] = [];
          const messages: AssistantMessage[] = [
            { role: 'system', content: buildAssistantSystemPrompt(state) },
            ...userMessages,
          ];

          const services = await createAssistantServices(session.userId, state.flashcardRevision ?? 0);

          let finalText = '';
          let finalThinking = '';
          let model = selectedModel.providerModel;
          let requestModel = selectedModel;
          let usage: any = null;
          const pendingActions: AssistantToolCall[] = [];
          const requestStartedAt = Date.now();
          let totalToolCalls = 0;
          let toolLoopExhausted = false;

          for (let step = 0; step < ASSISTANT_MAX_CHAT_STEPS; step += 1) {
            deadline.throwIfExpired();
            const result = await callOpenRouter(messages, providerRuntime, deadline, requestModel);
            await recordAiUsage({
              userId: session.userId,
              model: selectedModel,
              usage: result.usage,
              feature: 'assistant',
            });
            model = result.model;
            requestModel = modelForNextToolRound(selectedModel, result.model);
            usage = result.usage;
            finalText = result.content;
            if (!summarizeThinking) finalThinking = [finalThinking, result.thinking].filter(Boolean).join('\n\n');

            if (result.toolCalls.length === 0) {
              break;
            }
            totalToolCalls += result.toolCalls.length;
            if (totalToolCalls > ASSISTANT_MAX_TOTAL_TOOL_CALLS) {
              throw new AssistantGuardrailError(
                'Assistant reached its safe tool-use limit. Continue in a new message.',
                422,
                'ASSISTANT_TOOL_LIMIT',
              );
            }

            messages.push({
              role: 'assistant',
              content: result.content || '',
              tool_calls: result.toolCalls,
              reasoning_details: result.reasoningDetails,
            });

            for (const toolCall of result.toolCalls) {
              if (isMutatingAssistantAction(toolCall.function.name)) {
                pendingActions.push(toolCall);
                continue;
              }
              const actionResult = await executeAssistantAction(
                toolCall.function.name,
                toolCall.function.arguments,
                state,
                services
              );
              actionResults.push(actionResult);
              finalThinking = [finalThinking, `Using ${toolCall.function.name}`, actionResult.message].filter(Boolean).join('\n');
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: serializeBoundedToolResult({
                  source: 'millennium-dashboard-tool',
                  untrusted: true,
                  result: actionResult,
                }),
              });
            }
            if (pendingActions.length > 0) break;
            if (step === ASSISTANT_MAX_CHAT_STEPS - 1) toolLoopExhausted = true;
          }

          if (toolLoopExhausted && pendingActions.length === 0) {
            finalText = 'Assistant reached its safe tool-use limit. Continue in a new message.';
          }

          const pendingApproval = pendingActions.length > 0
            ? await createAssistantActionApproval(session.userId, typeof body.threadId === 'string' ? body.threadId : null, pendingActions.map((toolCall) => ({
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            })))
            : null;
          if (pendingApproval) {
            finalText = `${pendingActions.length} proposed dashboard change${pendingActions.length === 1 ? '' : 's'} need your approval.`;
          }

          if (!finalText && actionResults.length > 0) {
            finalText = actionResults.map((result) => result.message).join('\n');
          }

          const visibleMessages = [
            ...userMessages.map((message) => ({
              role: message.role,
              content: message.content,
              attachments: message.attachments?.map((file) => ({
                id: file.id,
                name: file.name,
                type: file.type,
                size: file.size,
                truncated: file.truncated,
              })),
            })),
            {
              role: 'assistant' as const,
              content: finalText || 'Done.',
              thinking: finalThinking || undefined,
              thinkingSeconds: Math.max(1, Math.ceil((Date.now() - requestStartedAt) / 1000)),
            },
          ];
          const existingThread = body.threadId ? savedThreads.find((thread) => thread.id === body.threadId) : null;
          const promptTitle = titleFromMessages(userMessages);
          const generatedTitle = existingThread?.title && !isDefaultThreadTitle(existingThread.title) && existingThread.title !== promptTitle
            ? undefined
            : process.env.OPENROUTER_API_KEY
              ? await nameThreadWithOpenRouter(userMessages, process.env.OPENROUTER_API_KEY, deadline)
              : fallbackThreadTitle(promptTitle);
          deadline.throwIfExpired();
          const { thread, threads } = upsertThread(savedThreads, body.threadId, visibleMessages, new Date(), generatedTitle);
          await updateUserAssistantState(session.userId, {
            threads,
            skills: state.skills,
          });

          return Response.json({
            message: finalText || 'Done.',
            model,
            configuredModel: selectedModel.providerModel,
            planTier,
            actions: actionResults,
            pendingApproval,
            thread,
            usage,
          }, { headers: noStoreHeaders });
        } catch (error) {
          const guardrailError = assistantGuardrailErrorResponse(error, noStoreHeaders);
          if (guardrailError) return guardrailError;
          logger.error('Assistant request failed', error);
          return Response.json({
            message: error instanceof OpenRouterRequestError
              ? error.message
              : 'Assistant request failed.',
            upstreamStatus: error instanceof OpenRouterRequestError ? error.status : undefined,
            model: selectedModel.providerModel,
          }, {
            status: error instanceof OpenRouterRequestError && error.status === 504
              ? 504
              : error instanceof OpenRouterRequestError ? 502 : 500,
            headers: noStoreHeaders,
          });
        } finally {
          deadline.clear();
        }
      },
    },
  },
});
