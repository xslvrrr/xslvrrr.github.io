import { createFileRoute } from '@tanstack/react-router';
import {
  OPENROUTER_ASSISTANT_MODEL,
  OPENROUTER_CHAT_COMPLETIONS_URL,
} from '../../../../lib/assistant/actions.ts';
import { readStartSession } from '../../../../lib/start-session';
import { internalErrorResponse } from '../../../../lib/api-response';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import {
  ASSISTANT_MAX_SKILL_COMPLETION_TOKENS,
  ASSISTANT_MAX_SKILL_INSTRUCTION_CHARS,
  ASSISTANT_SKILL_BODY_MAX_BYTES,
  ASSISTANT_SKILL_DEADLINE_MS,
  type AssistantDeadline,
  assistantGuardrailErrorResponse,
  createAssistantDeadline,
  readBoundedProviderJson,
} from '../../../../lib/assistant/guardrails.ts';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function cleanString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function toSkillName(value: string) {
  const words = value
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !/^(please|make|create|write|build|a|an|the|for|me|that|should|skill)$/i.test(word))
    .slice(0, 4);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Custom Skill';
}

function fallbackSkill(description: string) {
  const name = toSkillName(description);
  const summary = description.replace(/\s+/g, ' ').replace(/[.!?]+$/g, '').slice(0, 180);
  return {
    name,
    description: `Guides the assistant on ${summary.charAt(0).toLowerCase()}${summary.slice(1)}.`,
    icon: 'IconSparkles',
    instructions: [
      '## When to Use',
      `- Use this skill when the user asks for help with ${summary}.`,
      '- Use it when the task needs repeatable behaviour, dashboard-aware decisions, or a consistent response style.',
      '- Skip it when the user is asking for an unrelated one-off fact, a purely personal preference, or a task covered by a more specific enabled skill.',
      '',
      '## What to Do',
      '1. Restate the practical goal in your own words before choosing an action path.',
      '2. Identify the relevant dashboard data, tools, files, or constraints needed for the request.',
      '3. Ask for missing details only when a reasonable safe assumption would change the result.',
      '4. Use available tools when the user asks for a dashboard change, then report the exact change made.',
      '5. Keep the final response friendly, concrete, and easy to scan with short sections or bullets when helpful.',
      '',
      '## Implementation Guidance',
      '- Treat the skill as operating instructions, not a description to repeat back to the user.',
      '- Prefer specific examples, field names, IDs, dates, and next steps over general advice.',
      '- Preserve user wording where it affects the intended outcome, but translate vague goals into executable steps.',
      '- If the task touches dashboard state, verify the current state first and make the smallest useful change.',
      '- Mention limitations plainly when data is missing, unavailable, or outside the assistant tools.',
      '',
      '## Anti-Patterns',
      '- Do not paste the original prompt into the answer or into dashboard fields.',
      '- Do not claim a dashboard change happened unless a tool call succeeded.',
      '- Do not over-explain obvious UI concepts or produce a long essay for a small action.',
      '- Do not ignore more specific enabled skills that clearly apply.',
      '',
      '## Review Checklist',
      '1. Did you use this skill only for a relevant request?',
      '2. Did you convert the request into concrete behaviour instead of repeating it?',
      '3. Did you use tools for requested dashboard edits and summarize the result?',
      '4. Did you keep the answer friendly, structured, and grounded in available data?',
    ].join('\n'),
  };
}

function isPromptCopy(value: string, prompt: string) {
  const normalizedValue = value.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim().toLowerCase();
  return !normalizedValue
    || normalizedValue === normalizedPrompt
    || (normalizedPrompt.includes(normalizedValue) && normalizedValue.length > 40);
}

function hasSkillStructure(value: string) {
  return [
    '## When to Use',
    '## What to Do',
    '## Implementation Guidance',
    '## Anti-Patterns',
    '## Review Checklist',
  ].every((heading) => value.includes(heading));
}

async function draftSkill(description: string, apiKey: string, deadline: AssistantDeadline) {
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
            'You write reusable skills for an in-app student dashboard AI agent.',
            'You do not have dashboard tools in this mode and must not claim to perform actions.',
            'Return only compact JSON with keys: name, description, icon, instructions.',
            'description is a one-sentence summary. Do not put the full skill there.',
            'instructions must be direct behavioural guidance for future chats, not a rewritten description.',
            'Never copy the user prompt into every field. If the prompt is vague, infer a useful skill with concrete operating rules.',
            'Write instructions in this exact structure: ## When to Use, ## What to Do, ## Implementation Guidance, ## Anti-Patterns, ## Review Checklist.',
            'Under When to Use, write bullet points that also explain when to skip the skill.',
            'Under What to Do, write a numbered workflow with concrete actions the future assistant should follow.',
            'Under Implementation Guidance, write detailed bullet points with constraints, tool usage guidance, and quality bars.',
            'Under Anti-Patterns, write bullet points describing behaviours to avoid.',
            'Under Review Checklist, write numbered verification checks.',
            'Make instructions decently verbose and pattern-forcing: usually 18-35 lines. Do not use filler.',
            'icon must be a Tabler icon component name starting with Icon.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: description,
        },
      ],
      temperature: 0.25,
      max_tokens: ASSISTANT_MAX_SKILL_COMPLETION_TOKENS,
    }),
    signal: deadline.signal,
  });

  const payload = await readBoundedProviderJson(response);
  if (!response.ok) {
    throw new Error(`OpenRouter skill request failed with HTTP ${response.status}`);
  }

  const content = isRecord(payload)
    && Array.isArray(payload.choices)
    && isRecord(payload.choices[0]?.message)
    ? payload.choices[0].message.content
    : undefined;
  const parsed = extractJsonObject(typeof content === 'string' ? content : '');
  const fallback = fallbackSkill(description);
  const name = cleanString(parsed?.name, fallback.name);
  const skillDescription = cleanString(parsed?.description, fallback.description);
  const instructions = cleanString(parsed?.instructions, fallback.instructions);
  const usableInstructions = isPromptCopy(instructions, description) || !hasSkillStructure(instructions)
    ? fallback.instructions
    : instructions;

  return {
    name: isPromptCopy(name, description) ? fallback.name : name.slice(0, 80),
    description: isPromptCopy(skillDescription, description) ? fallback.description : skillDescription.slice(0, 200),
    icon: /^Icon[A-Za-z0-9]+$/.test(cleanString(parsed?.icon)) ? cleanString(parsed?.icon) : 'IconSparkles',
    instructions: usableInstructions.slice(0, ASSISTANT_MAX_SKILL_INSTRUCTION_CHARS),
  };
}

export const Route = createFileRoute('/api/assistant/skill-writer')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }
        const crossOriginResponse = crossOriginMutationResponse(request);
        if (crossOriginResponse) return crossOriginResponse;

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return Response.json({
            message: 'OPENROUTER_API_KEY is not configured.',
            model: OPENROUTER_ASSISTANT_MODEL,
          }, { status: 503, headers: noStoreHeaders });
        }

        const deadline = createAssistantDeadline(ASSISTANT_SKILL_DEADLINE_MS, request.signal);
        try {
          const limit = await consumeRateLimit('assistant-skill-writer', session.userId, 6, 10 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const body = await readJsonBody<unknown>(request, ASSISTANT_SKILL_BODY_MAX_BYTES);
          if (!isRecord(body) || typeof body.description !== 'string') {
            return Response.json({ message: 'Skill description is required.' }, { status: 400, headers: noStoreHeaders });
          }
          const description = cleanString(body.description).slice(0, 4_000);
          if (!description || body.description.length > 4_000) {
            return Response.json(
              { message: 'Skill description must contain between 1 and 4,000 characters.' },
              { status: 400, headers: noStoreHeaders },
            );
          }

          const skill = await draftSkill(description, apiKey, deadline);
          return Response.json({ skill, model: OPENROUTER_ASSISTANT_MODEL }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const guardrailError = assistantGuardrailErrorResponse(error, noStoreHeaders);
          if (guardrailError) return guardrailError;
          if (deadline.signal.aborted) {
            return Response.json(
              { message: 'Skill drafting exceeded its safe processing deadline.' },
              { status: 504, headers: noStoreHeaders },
            );
          }
          return internalErrorResponse('Assistant skill drafting failed', 'Failed to draft skill.', error, noStoreHeaders);
        } finally {
          deadline.clear();
        }
      },
    },
  },
});
