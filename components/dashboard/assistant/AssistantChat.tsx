import { type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowLeft,
  IconArrowsDiagonal,
  IconBell,
  IconChevronDown,
  IconCube,
  IconCheck,
  IconFilePlus,
  IconLayoutGrid,
  IconLoader2,
  IconPaperclip,
  IconPencil,
  IconPin,
  IconPlus,
  IconSchool,
  IconSearch,
  IconSend,
  IconTrash,
  IconTool,
  IconX,
} from "@tabler/icons-react";

import { markdownToHtml } from "@/components/markdown/markdown";
import { Button } from "@/components/ui/button";
import {
  STUDY_TRIAL_DISPLAY_PROMPT,
  STUDY_TRIAL_FINISHED_EVENT,
  STUDY_TRIAL_PENDING_KEY,
  STUDY_TRIAL_REQUEST_EVENT,
} from "@/lib/study-trial-shared";
import AILoadingState from "@/src/components/kokonutui/ai-loading";
import { useAutoResizeTextarea } from "@/src/hooks/use-auto-resize-textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getIconExplorerLabel, IconExplorer, IconExplorerIcon } from "@/components/ui/icon-explorer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  detectAssistantClis,
  runAssistantCli,
  type AssistantCliProvider,
} from "@/lib/desktop/assistant-cli";
import { isDesktopApp } from "@/lib/desktop/utils";
import { EmojiPicker } from "./EmojiPicker";
import { BUILTIN_ASSISTANT_SKILLS } from "@/lib/assistant/builtin-skills";
import { ModelExplorer, type ExplorerAiModel } from "./ModelExplorer";
import styles from "./AssistantChat.module.css";

type ChatRole = "user" | "assistant";
type AssistantMode = "dock" | "main" | "page";
type SkillModalMode = "edit" | "generate";

interface ChatMessage {
  role: ChatRole;
  content: string;
  thinking?: string;
  thinkingSeconds?: number;
  attachments?: AttachedFile[];
}

interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
}

interface AssistantSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  icon: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PendingApproval {
  id: string;
  expiresAt: string;
  actions: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

type AvailableAiModel = ExplorerAiModel;

interface SkillDraft {
  name: string;
  description: string;
  instructions: string;
  icon: string;
}

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  dataUrl?: string;
  truncated: boolean;
}

interface AssistantChatProps {
  mode?: AssistantMode;
  initiallyOpen?: boolean;
  summarizeThinking?: boolean;
  onActionsApplied?: () => void;
  onOpenInMain?: () => void;
  dockBefore?: ReactNode;
  dockBeforeVisible?: boolean;
  dockAfter?: ReactNode;
}

const MAX_ATTACHMENT_CHARS = 20_000;
const THREAD_TITLE_MAX_LENGTH = 120;

const EMPTY_SKILL: SkillDraft = {
  name: "",
  description: "",
  instructions: "",
  icon: "IconBox",
};

const EMPTY_PROMPTS = [
  {
    icon: IconBell,
    label: "Organise notifications",
    prompt: "Create a practical notification folder setup for my school dashboard. First create the needed folders with short clear names, then move the current notifications into those folders using the notification ids from the dashboard. Use one bulk move when possible, keep important school updates easy to find, and tell me what you moved.",
  },
  {
    icon: IconSchool,
    label: "Plan next classes",
    prompt: "Look at my timetable and identify the next closest school day with classes. Summarise what classes are on that day and leave a concise note on Home so I can prepare.",
  },
  {
    icon: IconLayoutGrid,
    label: "Rearrange home cards",
    prompt: "Rearrange my Home cards into a more useful order for school work. Prioritise upcoming classes, calendar items, notifications, notes, assignments, and quick actions, then save the updated layout.",
  },
];

const PREVIEW_THREAD: ChatThread = {
  id: "thread-preview-home-layout",
  title: "Calendar events for this week",
  messages: [
    { role: "user", content: "Add my Physics practical revision and Chemistry draft review to today's calendar." },
  ],
  createdAt: "2026-02-14T03:08:00.000Z",
  updatedAt: "2026-02-14T03:12:00.000Z",
};

const PREVIEW_SKILLS: AssistantSkill[] = [
  {
    id: "skill-preview-dashboard",
    name: "Dashboard layout",
    description: "Reorders Home while respecting pinned sections.",
    instructions: "Use existing Home sections and avoid creating new live data.",
    icon: "IconLayoutDashboard",
    enabled: true,
    createdAt: "2026-02-14T03:08:00.000Z",
    updatedAt: "2026-02-14T03:12:00.000Z",
  },
];

function nowIso() {
  return new Date().toISOString();
}

function isAssistantPreviewMode() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("previewAssistant") === "1";
}

function createLocalThread(): ChatThread {
  const timestamp = nowIso();
  return {
    id: `thread-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    messages: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function orderThreads(threads: ChatThread[]) {
  return [...threads].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * The threads worth writing back to `/api/assistant/state`, with attachment payloads dropped.
 *
 * An attachment's decoded text and data URL are only inputs to the one request that carried them —
 * history renders nothing but the name and size. Keeping them made a single image large enough to
 * push the whole state body past ASSISTANT_STATE_BODY_MAX_BYTES, and because that request carries
 * every thread the rejection meant no chat saved again for that account.
 */
function persistableThreads(threads: ChatThread[]): ChatThread[] {
  return threads
    .filter((thread) => thread.messages.length > 0)
    .map((thread) => ({
      ...thread,
      messages: thread.messages.map((message) => (
        message.attachments?.length
          ? {
            ...message,
            attachments: message.attachments.map((file) => ({
              ...file,
              content: "",
              dataUrl: undefined,
            })),
          }
          : message
      )),
    }));
}

function renderMarkdown(content: string) {
  return markdownToHtml(content);
}

function AssistantTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function displayMessageContent(content: string) {
  return content.split("\n\n## Attachments\n")[0] || content;
}

function appendThinking(current = "", patch = "") {
  if (!patch) return current || undefined;
  if (!current) return patch;
  if (patch.startsWith(current)) return patch;
  if (current.endsWith(patch)) return current;
  return `${current}${patch}`;
}

function collapseRepeatedWords(input: string) {
  return input.replace(/\b([\p{L}\p{N}_'-]+)(?:\s+\1\b)+/giu, "$1");
}

function cleanThinkingText(value = "") {
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const merged: string[] = [];
  let prose = "";
  const flushProse = () => {
    if (!prose) return;
    merged.push(collapseRepeatedWords(prose.replace(/\s+/g, " ").trim()));
    prose = "";
  };

  lines.forEach((line) => {
    const looksStructured = /^(tool|called|finished|using|error|result|[-*•]|\d+\.|\[)/i.test(line) || line.length > 90;
    if (looksStructured) {
      flushProse();
      merged.push(collapseRepeatedWords(line));
      return;
    }
    prose = prose ? `${prose} ${line}` : line;
    if (/[.!?:;)]$/.test(line)) flushProse();
  });

  flushProse();
  return merged.join("\n");
}

function isToolThinkingLine(line: string) {
  return /^(using|created|updated|deleted|renamed|wrote|added|removed|found|failed|moved|folder)\b/i.test(line.trim());
}

function summarizeThinkingText(value: string) {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const seen = new Set<string>();
  const summary: string[] = [];

  lines.forEach((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    summary.push(line);
  });

  return summary.slice(-80).join("\n");
}

function formatWorkingTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatSkillCount(count: number) {
  if (count === 0) return "Skills";
  return `${count} ${count === 1 ? "skill" : "skills"}`;
}

function renderIcon(iconName: string, size = 15) {
  return <IconExplorerIcon name={iconName || "IconBox"} size={size} />;
}

function isReadableFile(file: File) {
  return file.type.startsWith("text/") || /\.(csv|css|html|js|jsx|json|log|md|ts|tsx|txt|xml|ya?ml)$/i.test(file.name);
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatActionName(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatActionArguments(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function AssistantChat({ mode = "dock", initiallyOpen = false, summarizeThinking = true, onActionsApplied, onOpenInMain, dockBefore, dockBeforeVisible = false, dockAfter }: AssistantChatProps) {
  const assistantPreview = isAssistantPreviewMode();
  const [open, setOpen] = useState(mode !== "dock" || initiallyOpen);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [workingSeconds, setWorkingSeconds] = useState(0);
  const [generatingThreadId, setGeneratingThreadId] = useState("");
  const [error, setError] = useState("");
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [skills, setSkills] = useState<AssistantSkill[]>([]);
  const [skillsMenuOpen, setSkillsMenuOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [skillModalMode, setSkillModalMode] = useState<SkillModalMode>("edit");
  const [skillDraft, setSkillDraft] = useState<SkillDraft>(EMPTY_SKILL);
  const [editingSkillId, setEditingSkillId] = useState("");
  const [skillPrompt, setSkillPrompt] = useState("");
  const [skillWriterBusy, setSkillWriterBusy] = useState(false);
  const [skillContextMenu, setSkillContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [deleteThreadId, setDeleteThreadId] = useState("");
  const [renameThreadId, setRenameThreadId] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [threadMenu, setThreadMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [threadMenuClosing, setThreadMenuClosing] = useState(false);
  const [openThinkingKeys, setOpenThinkingKeys] = useState<Record<string, boolean>>({});
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [composerFocused, setComposerFocused] = useState(false);
  const [liveStatusLines, setLiveStatusLines] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableAiModel[]>([
    {
      id: "fast-free",
      label: "Auto Free",
      description: "Routes to an available free tool-capable model.",
      minimumTier: "free",
      lab: "openrouter",
      recommended: true,
      locked: false,
      priceBand: 1,
    },
  ]);
  const [selectedModelId, setSelectedModelId] = useState("fast-free");
  const { textareaRef, adjustHeight: adjustComposerHeight } = useAutoResizeTextarea({
    minHeight: 64,
    maxHeight: mode === "dock" ? 160 : 240,
  });
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const threadMenuRef = useRef<HTMLDivElement | null>(null);
  const skillContextMenuRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closePanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeThreadMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeThread = useMemo(() => {
    return threads.find((thread) => thread.id === activeThreadId) || null;
  }, [activeThreadId, threads]);

  const lastMessageScrollKey = activeThread
    ? `${activeThread.messages.length}:${activeThread.messages.at(-1)?.content.length || 0}:${activeThread.messages.at(-1)?.thinking?.length || 0}`
    : "";

  const sortedThreads = useMemo(() => orderThreads(threads), [threads]);
  const pinnedThreads = useMemo(() => sortedThreads.filter((thread) => thread.pinned), [sortedThreads]);
  const unpinnedThreads = useMemo(() => sortedThreads.filter((thread) => !thread.pinned), [sortedThreads]);

  const filteredSkills = useMemo(() => {
    const query = skillSearch.trim().toLowerCase();
    if (!query) return skills;
    return skills.filter((skill) => (
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.instructions.toLowerCase().includes(query)
    ));
  }, [skillSearch, skills]);

  const activeSkillCount = useMemo(() => skills.filter((skill) => skill.enabled).length, [skills]);
  /**
   * Built-in skills are part of the app, always applied, and not editable. They are listed so the
   * assistant's behaviour is legible rather than mysterious — a student who wonders why it keeps
   * checking the calendar before answering can see that it is meant to.
   */
  const filteredBuiltinSkills = useMemo(() => {
    const query = skillSearch.trim().toLowerCase();
    if (!query) return BUILTIN_ASSISTANT_SKILLS;
    return BUILTIN_ASSISTANT_SKILLS.filter((skill) => (
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query)
    ));
  }, [skillSearch]);
  const composerPreviewHtml = useMemo(() => renderMarkdown(input), [input]);
  const showComposerPreview = Boolean(input.trim()) && /[`*_#>|~\[\]-]|\n|\d+\.\s/.test(input);
  useEffect(() => {
    if (assistantPreview) return;
    let active = true;
    void Promise.all([
      fetch("/api/billing/status", { cache: "no-store" }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.models)) return [];
        return data.models.filter((model: unknown): model is AvailableAiModel => (
          Boolean(model && typeof model === "object")
          && typeof (model as AvailableAiModel).id === "string"
          && typeof (model as AvailableAiModel).label === "string"
          && typeof (model as AvailableAiModel).minimumTier === "string"
          && typeof (model as AvailableAiModel).lab === "string"
        ));
      }),
      isDesktopApp() ? detectAssistantClis().catch(() => []) : Promise.resolve([]),
    ])
      .then(([remoteModels, cliStatuses]) => {
        if (!active) return;
        const cliModels: AvailableAiModel[] = cliStatuses
          .filter((status) => status.installed && status.authenticated)
          .map((status) => ({
            id: `cli:${status.provider}`,
            label: status.provider === "openai" ? "ChatGPT account" : "Claude account",
            description: `${status.provider === "openai" ? "Codex" : "Claude"} CLI on this device · read-only`,
            minimumTier: "free",
            lab: status.provider,
            recommended: true,
            locked: false,
            priceBand: 1,
            externalBilling: true,
          }));
        const models = [...cliModels, ...remoteModels];
        if (models.length === 0) return;
        setAvailableModels(models);
        setSelectedModelId((current) => models.some((model: AvailableAiModel) => model.id === current) ? current : models[0].id);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [assistantPreview]);

  // A failed save used to reject into nothing, so a chat that never reached the server looked
  // saved until the next reload dropped it. Say so instead.
  const reportPersistError = useCallback((persistError: unknown) => {
    setError(persistError instanceof Error && persistError.message
      ? persistError.message
      : "Failed to save AI Agent state.");
  }, []);

  const persistAssistantState = useCallback(async (nextThreads: ChatThread[], nextSkills = skills) => {
    if (assistantPreview) {
      setThreads(orderThreads(nextThreads));
      setSkills(nextSkills);
      return;
    }

    const savedThreads = persistableThreads(nextThreads);
    const response = await fetch("/api/assistant/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threads: savedThreads, skills: nextSkills }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || "Failed to save AI Agent state.");
    setThreads(orderThreads(Array.isArray(data.threads) ? data.threads : savedThreads));
    setSkills(Array.isArray(data.skills) ? data.skills : nextSkills);
  }, [assistantPreview, skills]);

  const loadAssistantState = useCallback(async () => {
    if (assistantPreview) {
      setThreads([PREVIEW_THREAD]);
      setSkills(PREVIEW_SKILLS);
      setActiveThreadId("");
      setInput("");
      setError("");
      return;
    }

    try {
      const response = await fetch("/api/assistant/state");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Failed to load AI Agent state.");
      const loadedThreads: ChatThread[] = Array.isArray(data.threads) ? data.threads : [];
      const ordered = orderThreads(loadedThreads);
      setThreads(ordered);
      setSkills(Array.isArray(data.skills) ? data.skills : []);
      // Falling back to "" left the panel on an empty draft even though saved chats had just
      // loaded, which read as the history having been lost. Reopen on the most recent thread.
      setActiveThreadId((current) => (
        current && loadedThreads.some((thread) => thread.id === current)
          ? current
          : ordered[0]?.id || ""
      ));
      setError(data.hasApiKey === false ? "OPENROUTER_API_KEY is not configured." : "");
    } catch (loadError: any) {
      setError(loadError?.message || "Failed to load AI Agent state.");
    }
  }, [assistantPreview]);

  const closeThreadMenu = useCallback((afterClose?: () => void) => {
    if (!threadMenu) {
      afterClose?.();
      return;
    }
    setThreadMenuClosing(true);
    if (closeThreadMenuTimerRef.current) clearTimeout(closeThreadMenuTimerRef.current);
    closeThreadMenuTimerRef.current = setTimeout(() => {
      setThreadMenu(null);
      setThreadMenuClosing(false);
      afterClose?.();
    }, 160);
  }, [threadMenu]);

  useEffect(() => {
    if (!threadMenu) return undefined;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && threadMenuRef.current?.contains(target)) return;
      closeThreadMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeThreadMenu();
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeThreadMenu, threadMenu]);

  useEffect(() => {
    if (!skillContextMenu) return undefined;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && skillContextMenuRef.current?.contains(target)) return;
      setSkillContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSkillContextMenu(null);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [skillContextMenu]);

  useEffect(() => {
    if (mode !== "dock" || open) {
      loadAssistantState();
    }
  }, [loadAssistantState, mode, open]);

  useEffect(() => () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (closePanelTimerRef.current) clearTimeout(closePanelTimerRef.current);
    if (closeThreadMenuTimerRef.current) clearTimeout(closeThreadMenuTimerRef.current);
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!busy) {
      setWorkingSeconds(0);
      return undefined;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setWorkingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [busy]);

  const closeSkillsMenu = useCallback(() => {
    setSkillsMenuOpen(false);
  }, []);

  const openSkillsMenu = useCallback(() => {
    setSkillsMenuOpen(true);
  }, []);

  const closeDockPanel = useCallback((afterClose?: () => void) => {
    if (mode !== "dock") return;
    closeSkillsMenu();
    setPanelClosing(true);
    if (closePanelTimerRef.current) clearTimeout(closePanelTimerRef.current);
    closePanelTimerRef.current = setTimeout(() => {
      setOpen(false);
      setPanelClosing(false);
      afterClose?.();
    }, 210);
  }, [closeSkillsMenu, mode]);

  useEffect(() => {
    if (mode !== "dock" || !open || skillModalOpen || deleteThreadId || renameThreadId || threadMenu || skillContextMenu) return undefined;
    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (floatingRef.current?.contains(target)) return;
      if (launcherRef.current?.contains(target)) return;
      closeDockPanel();
    };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, [closeDockPanel, deleteThreadId, mode, open, renameThreadId, skillContextMenu, skillModalOpen, threadMenu]);

  const scrollMessagesToBottom = useCallback(() => {
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = requestAnimationFrame(() => {
        const container = messagesRef.current;
        if (!container || !stickToBottomRef.current) return;
        container.scrollTop = container.scrollHeight;
      });
    });
  }, []);

  useEffect(() => {
    if (!open && mode === "dock") return;
    scrollMessagesToBottom();
  }, [activeThreadId, busy, lastMessageScrollKey, mode, open, scrollMessagesToBottom]);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = window.setInterval(() => {
      const container = messagesRef.current;
      if (!container || !stickToBottomRef.current) return;
      container.scrollTop = container.scrollHeight;
    }, 250);
    return () => window.clearInterval(timer);
  }, [busy]);

  const trackMessageScroll = () => {
    const container = messagesRef.current;
    if (!container) return;
    stickToBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 96;
  };

  const startNewChat = useCallback(() => {
    const thread = createLocalThread();
    setThreads((current) => orderThreads([
      thread,
      ...current.filter((item) => item.messages.length > 0),
    ]));
    setActiveThreadId(thread.id);
    setInput("");
    setAttachments([]);
    setError("");
  }, []);

  const deleteThread = async (threadId: string) => {
    const nextThreads = orderThreads(threads.filter((thread) => thread.id !== threadId));
    setThreads(nextThreads);
    if (activeThreadId === threadId) {
      setActiveThreadId(nextThreads[0]?.id || "");
    }
    setDeleteThreadId("");
    await persistAssistantState(nextThreads).catch(reportPersistError);
  };

  const openRenameThread = (threadId: string) => {
    const thread = threads.find((item) => item.id === threadId);
    if (!thread) return;
    setRenameThreadId(threadId);
    setRenameTitle(thread.title || "New chat");
  };

  const renameThread = async () => {
    const title = renameTitle.trim();
    const threadId = renameThreadId;
    if (!title) return;
    const nextThreads = orderThreads(threads.map((item) => (
      item.id === threadId ? { ...item, title: title.slice(0, THREAD_TITLE_MAX_LENGTH), updatedAt: nowIso() } : item
    )));
    setThreads(nextThreads);
    setRenameThreadId("");
    setRenameTitle("");
    await persistAssistantState(nextThreads).catch(reportPersistError);
  };

  const togglePinThread = async (threadId: string) => {
    const nextThreads = orderThreads(threads.map((thread) => (
      thread.id === threadId ? { ...thread, pinned: !thread.pinned, updatedAt: nowIso() } : thread
    )));
    setThreads(nextThreads);
    await persistAssistantState(nextThreads).catch(reportPersistError);
  };

  const openThreadMenu = (event: React.MouseEvent, threadId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (closeThreadMenuTimerRef.current) clearTimeout(closeThreadMenuTimerRef.current);
    setThreadMenuClosing(false);
    const width = 172;
    const height = 106;
    const rect = mode === "dock" ? null : shellRef.current?.getBoundingClientRect();
    setThreadMenu({
      id: threadId,
      x: Math.max(8, Math.min(event.clientX - (rect?.left || 0), (rect?.width || window.innerWidth) - width - 8)),
      y: Math.max(8, Math.min(event.clientY - (rect?.top || 0), (rect?.height || window.innerHeight) - height - 8)),
    });
  };

  useEffect(() => {
    if (!renameThreadId) return;
    requestAnimationFrame(() => renameInputRef.current?.focus());
  }, [renameThreadId]);

  const openSkillModal = () => {
    setSkillDraft(EMPTY_SKILL);
    setEditingSkillId("");
    setSkillPrompt("");
    setSkillModalMode("edit");
    setSkillModalOpen(true);
    closeSkillsMenu();
  };

  const openSkillEditor = (skill: AssistantSkill) => {
    setSkillDraft({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      icon: skill.icon,
    });
    setEditingSkillId(skill.id);
    setSkillPrompt("");
    setSkillModalMode("edit");
    setSkillModalOpen(true);
    setSkillContextMenu(null);
    closeSkillsMenu();
  };

  const openSkillContextMenu = (event: React.MouseEvent, skillId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const width = 156;
    const height = 72;
    const rect = mode === "dock" ? null : shellRef.current?.getBoundingClientRect();
    setSkillContextMenu({
      id: skillId,
      x: Math.max(8, Math.min(event.clientX - (rect?.left || 0), (rect?.width || window.innerWidth) - width - 8)),
      y: Math.max(8, Math.min(event.clientY - (rect?.top || 0), (rect?.height || window.innerHeight) - height - 8)),
    });
  };

  const saveSkill = async () => {
    const name = skillDraft.name.trim();
    const instructions = skillDraft.instructions.trim();
    if (!name || !instructions) {
      setError("Skill name and instructions are required.");
      return;
    }

    const timestamp = nowIso();
    const existing = editingSkillId ? skills.find((skill) => skill.id === editingSkillId) : null;
    const skill: AssistantSkill = {
      id: existing?.id || `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      description: skillDraft.description.trim(),
      instructions,
      icon: skillDraft.icon || "IconBox",
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const nextSkills = existing
      ? skills.map((item) => (item.id === existing.id ? skill : item))
      : [...skills, skill];
    setSkills(nextSkills);
    setSkillDraft(EMPTY_SKILL);
    setEditingSkillId("");
    setSkillModalOpen(false);
    await persistAssistantState(threads, nextSkills);
  };

  const draftSkillForMe = async () => {
    const description = skillPrompt.trim();
    if (!description) {
      setError("Describe what the skill should do.");
      return;
    }
    setSkillWriterBusy(true);
    setError("");
    try {
      const response = await fetch("/api/assistant/skill-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Failed to write skill.");
      setSkillDraft({
        name: data.skill?.name || skillDraft.name,
        description: data.skill?.description || skillDraft.description,
        instructions: data.skill?.instructions || skillDraft.instructions,
        icon: data.skill?.icon || skillDraft.icon || "IconBox",
      });
      setSkillModalMode("edit");
    } catch (writerError: any) {
      setError(writerError?.message || "Failed to write skill.");
    } finally {
      setSkillWriterBusy(false);
    }
  };

  const toggleSkill = async (skillId: string) => {
    const nextSkills = skills.map((skill) => (
      skill.id === skillId ? { ...skill, enabled: !skill.enabled, updatedAt: nowIso() } : skill
    ));
    setSkills(nextSkills);
    await persistAssistantState(threads, nextSkills);
  };

  const deleteSkill = async (skillId: string) => {
    const nextSkills = skills.filter((skill) => skill.id !== skillId);
    setSkills(nextSkills);
    if (editingSkillId === skillId) {
      setEditingSkillId("");
      setSkillModalOpen(false);
    }
    setSkillContextMenu(null);
    await persistAssistantState(threads, nextSkills);
  };

  const selectThread = (threadId: string) => {
    if (threadId === "__new__") {
      startNewChat();
      return;
    }
    if (threadId === "__empty__") {
      setActiveThreadId("");
      return;
    }
    setActiveThreadId(threadId);
  };

  const usePrompt = (prompt: string) => {
    sendMessage(prompt);
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setInput((current) => `${current}${emoji}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setInput((current) => `${current.slice(0, start)}${emoji}${current.slice(end)}`);
    requestAnimationFrame(() => {
      adjustComposerHeight();
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const attachFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const nextAttachments = await Promise.all(Array.from(files).map(async (file) => {
      const readable = isReadableFile(file);
      const rawContent = readable ? await file.text() : "";
      const content = rawContent.slice(0, MAX_ATTACHMENT_CHARS);
      return {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        content,
        dataUrl: readable ? undefined : await readAsDataUrl(file),
        truncated: rawContent.length > content.length,
      };
    }));
    setAttachments((current) => [...current, ...nextAttachments]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (fileId: string) => {
    setAttachments((current) => current.filter((file) => file.id !== fileId));
  };

  const sendMessage = async (
    content: string,
    options: { studyTrial?: boolean; forceNewThread?: boolean } = {},
  ) => {
    const trimmed = content.trim();
    if ((!trimmed && attachments.length === 0) || busy) return;

    const baseThread = options.forceNewThread ? createLocalThread() : activeThread || createLocalThread();
    const userContent = trimmed || "Please review the attached file(s).";
    const userMessage: ChatMessage = { role: "user", content: userContent, attachments };
    const optimisticThread: ChatThread = {
      ...baseThread,
      title: baseThread.messages.length === 0 ? "New chat" : baseThread.title,
      messages: [...baseThread.messages, userMessage],
      updatedAt: nowIso(),
    };
    const assistantMessageKey = `${optimisticThread.id}-${optimisticThread.messages.length}`;
    const requestStartedAt = Date.now();
    const optimisticThreads = orderThreads([
      optimisticThread,
      ...threads.filter((thread) => thread.id !== optimisticThread.id),
    ]);
    const appendStreamingAssistant = (patch: Partial<ChatMessage>) => {
      setThreads((current) => current.map((thread) => {
        if (thread.id !== optimisticThread.id) return thread;
        const messages = [...thread.messages];
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
          messages[messages.length - 1] = {
            ...last,
            content: `${last.content}${patch.content || ""}`,
            thinking: appendThinking(last.thinking, patch.thinking),
          };
        } else {
          messages.push({
            role: "assistant",
            content: patch.content || "",
            thinking: patch.thinking,
          });
        }
        return { ...thread, messages, updatedAt: nowIso() };
      }));
    };

    setThreads(optimisticThreads);
    setActiveThreadId(optimisticThread.id);
    setInput("");
    adjustComposerHeight(true);
    setAttachments([]);
    setBusy(true);
    setGeneratingThreadId(optimisticThread.id);
    setLiveStatusLines(["Connecting to AI Agent"]);
    stickToBottomRef.current = true;
    setError("");
    // Not surfaced: the chat route writes the authoritative thread itself, so a failed optimistic
    // save is recoverable and an error banner beside a working reply would only confuse.
    await persistAssistantState(optimisticThreads).catch(() => undefined);
    appendStreamingAssistant({});

    if (assistantPreview) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => {
        setThreads([{
          ...optimisticThread,
          messages: [
            ...optimisticThread.messages,
            {
              role: "assistant",
              content: "Done. Home now puts today's calendar work first, with the rest of the dashboard following in priority order.",
              thinkingSeconds: Math.max(1, Math.ceil((Date.now() - requestStartedAt) / 1000)),
            },
          ],
          updatedAt: nowIso(),
        }]);
        setOpenThinkingKeys((current) => ({ ...current, [assistantMessageKey]: false }));
        setBusy(false);
        setGeneratingThreadId("");
        window.parent?.postMessage({ type: "millennium-preview-agent-applied" }, window.location.origin);
      }, 3000);
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    const readStreamingResponse = async (response: Response) => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("AI Agent stream was empty.");

      const decoder = new TextDecoder();
      let buffer = "";
      let donePayload: any = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const event = /^event:\s*(.+)$/m.exec(chunk)?.[1]?.trim() || "message";
          const rawData = /^data:\s*(.+)$/m.exec(chunk)?.[1];
          if (!rawData) continue;
          const data = JSON.parse(rawData);
          if (event === "delta") {
            appendStreamingAssistant({ content: data.content || "", thinking: data.thinking || "" });
          } else if (event === "status") {
            if (data.message) {
              setLiveStatusLines((current) => {
                const next = current.at(-1) === data.message ? current : [...current, data.message];
                return next.slice(-6);
              });
            }
          } else if (event === "done") {
            donePayload = data;
          } else if (event === "error") {
            throw new Error(data?.message || "The AI Agent request failed.");
          }
        }
      }
      return donePayload;
    };
    try {
      const cliMatch = /^cli:(openai|anthropic)$/.exec(selectedModelId);
      let data: any;
      if (cliMatch && !options.studyTrial) {
        setLiveStatusLines(["Loading dashboard context", "Running provider CLI on this device"]);
        const contextResponse = await fetch("/api/assistant/context", {
          cache: "no-store",
          signal: abortController.signal,
        });
        const contextData = await contextResponse.json().catch(() => ({}));
        if (!contextResponse.ok) {
          throw new Error(contextData?.message || "Could not load dashboard context.")
        }
        const cliResponse = await runAssistantCli(
          cliMatch[1] as AssistantCliProvider,
          optimisticThread.messages,
          contextData.snapshot,
          abortController.signal,
        );
        const completedThread = {
          ...optimisticThread,
          title: optimisticThread.messages.length === 1
            ? userContent.slice(0, THREAD_TITLE_MAX_LENGTH)
            : optimisticThread.title,
          messages: [
            ...optimisticThread.messages,
            { role: "assistant" as const, content: cliResponse.content },
          ],
          updatedAt: nowIso(),
        };
        await persistAssistantState([
          completedThread,
          ...optimisticThreads.filter((thread) => thread.id !== completedThread.id),
        ]);
        data = { thread: completedThread };
      } else {
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          signal: abortController.signal,
          body: JSON.stringify({
            threadId: optimisticThread.id,
            messages: optimisticThread.messages,
            summarizeThinking,
            modelId: selectedModelId,
            studyTrial: options.studyTrial === true,
          }),
        });
        const isStream = response.headers.get("content-type")?.includes("text/event-stream");
        data = isStream ? await readStreamingResponse(response) : await response.json().catch(() => ({}));

        if (!response.ok) {
          const upstream = data?.upstream?.error?.message || data?.upstream?.message;
          throw new Error(upstream || data?.message || `AI Agent request failed with HTTP ${response.status}`);
        }
      }

      if (data.thread) {
        const elapsedSeconds = Math.max(1, Math.ceil((Date.now() - requestStartedAt) / 1000));
        const completedThread = {
          ...data.thread,
          messages: data.thread.messages.map((message: ChatMessage, index: number, messages: ChatMessage[]) => (
            index === messages.length - 1 && message.role === "assistant"
              ? { ...message, thinkingSeconds: elapsedSeconds }
              : message
          )),
        };
        setOpenThinkingKeys((current) => ({ ...current, [assistantMessageKey]: false }));
        setThreads((current) => orderThreads([
          completedThread,
          ...current.filter((thread) => thread.id !== completedThread.id),
        ]));
        setActiveThreadId(completedThread.id);
      }

      if (Array.isArray(data.actions) && data.actions.some((action: any) => action?.ok)) {
        window.dispatchEvent(new Event("assistant-actions-applied"));
        onActionsApplied?.();
        loadAssistantState();
      }
      if (data.pendingApproval?.id && Array.isArray(data.pendingApproval.actions)) {
        setPendingApproval(data.pendingApproval);
      }
      if (options.studyTrial) {
        window.dispatchEvent(new CustomEvent(STUDY_TRIAL_FINISHED_EVENT, {
          detail: { trial: data.trial || null },
        }));
      }
    } catch (sendError: any) {
      const cancelled = sendError?.name === "AbortError";
      const message = cancelled ? "Cancelled." : sendError?.message || "The AI Agent request failed.";
      if (!cancelled) setError(message);
      if (options.studyTrial) {
        window.dispatchEvent(new CustomEvent(STUDY_TRIAL_FINISHED_EVENT, {
          detail: { error: message },
        }));
      }
      setThreads(orderThreads(optimisticThreads.map((thread) => (
        thread.id === optimisticThread.id
          ? {
            ...thread,
            messages: [
              ...thread.messages,
              { role: "assistant", content: message },
            ],
          }
          : thread
      ))));
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
      setBusy(false);
      setGeneratingThreadId("");
      setLiveStatusLines([]);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  useEffect(() => {
    if (mode !== "dock" || typeof window === "undefined") return;
    const startStudyTrial = () => {
      if (busy || sessionStorage.getItem(STUDY_TRIAL_PENDING_KEY) !== "true") return;
      sessionStorage.removeItem(STUDY_TRIAL_PENDING_KEY);
      setOpen(true);
      void sendMessage(STUDY_TRIAL_DISPLAY_PROMPT, { studyTrial: true, forceNewThread: true });
    };
    startStudyTrial();
    window.addEventListener(STUDY_TRIAL_REQUEST_EVENT, startStudyTrial);
    return () => window.removeEventListener(STUDY_TRIAL_REQUEST_EVENT, startStudyTrial);
  }, [busy, mode]);

  const applyPendingApproval = async () => {
    if (!pendingApproval || approvalBusy) return;
    setApprovalBusy(true);
    setError("");
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: pendingApproval.id, actions: pendingApproval.actions }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) {
        if (data?.approvalConsumed || response.status === 409) setPendingApproval(null);
        throw new Error(data?.message || "Failed to apply approved changes.");
      }
      const failedAction = Array.isArray(data.actions) ? data.actions.find((action: any) => !action?.ok) : null;
      setPendingApproval(null);
      if (Array.isArray(data.actions) && data.actions.some((action: any) => action?.ok)) {
        window.dispatchEvent(new Event("assistant-actions-applied"));
        onActionsApplied?.();
        await loadAssistantState();
      }
      if (failedAction) setError(failedAction.message || "Some approved changes could not be applied.");
    } catch (approvalError: any) {
      setError(approvalError?.message || "Failed to apply approved changes.");
    } finally {
      setApprovalBusy(false);
    }
  };

  const cancelMessage = () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    abortRef.current?.abort();
    setBusy(false);
    setGeneratingThreadId("");
  };

  const pendingDeleteThread = threads.find((thread) => thread.id === deleteThreadId) || null;
  const pendingRenameThread = threads.find((thread) => thread.id === renameThreadId) || null;
  const menuThread = threadMenu ? threads.find((thread) => thread.id === threadMenu.id) : null;
  const menuSkill = skillContextMenu ? skills.find((skill) => skill.id === skillContextMenu.id) : null;
  const threadContextMenu = menuThread ? (
    <div
      ref={threadMenuRef}
      className={styles.threadContextMenu}
      data-closing={threadMenuClosing ? "true" : "false"}
      style={{ left: threadMenu?.x, top: threadMenu?.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => closeThreadMenu(() => togglePinThread(menuThread.id).catch((pinError: any) => setError(pinError?.message || "Failed to update thread.")))}>
        <IconPin size={14} />
        <span>{menuThread.pinned ? "Unpin thread" : "Pin thread"}</span>
      </button>
      <button type="button" onClick={() => closeThreadMenu(() => openRenameThread(menuThread.id))}>
        <IconPencil size={14} />
        <span>Rename thread</span>
      </button>
      <button
        type="button"
        className={styles.destructiveMenuItem}
        onClick={(event) => closeThreadMenu(() => {
          if (event.shiftKey) deleteThread(menuThread.id).catch((deleteError: any) => setError(deleteError?.message || "Failed to delete chat."));
          else setDeleteThreadId(menuThread.id);
        })}
      >
        <IconTrash size={14} />
        <span>Delete thread</span>
      </button>
    </div>
  ) : null;
  const skillContextMenuElement = menuSkill ? (
    <div
      ref={skillContextMenuRef}
      className={styles.threadContextMenu}
      style={{ left: skillContextMenu?.x, top: skillContextMenu?.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => openSkillEditor(menuSkill)}>
        <IconPencil size={14} />
        <span>Edit skill</span>
      </button>
      <button
        type="button"
        className={styles.destructiveMenuItem}
        onClick={() => deleteSkill(menuSkill.id).catch((deleteError: any) => setError(deleteError?.message || "Failed to delete skill."))}
      >
        <IconTrash size={14} />
        <span>Delete skill</span>
      </button>
    </div>
  ) : null;

  const renameThreadModal = pendingRenameThread ? (
    <div className={styles.modalBackdrop} onMouseDown={() => setRenameThreadId("")}>
      <form
        className={styles.confirmModal}
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Rename chat"
        onSubmit={(event) => {
          event.preventDefault();
          renameThread().catch((renameError: any) => setError(renameError?.message || "Failed to rename chat."));
        }}
      >
        <header className={styles.confirmModalHeader}>
          <h3>Rename chat</h3>
          <button type="button" onClick={() => setRenameThreadId("")} aria-label="Close">
            <IconX size={15} />
          </button>
        </header>
        <label className={styles.renameField}>
          <span>Thread name</span>
          <input
            ref={renameInputRef}
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            maxLength={THREAD_TITLE_MAX_LENGTH}
          />
        </label>
        <div className={styles.confirmModalActions}>
          <Button type="button" variant="outline" onClick={() => setRenameThreadId("")}>
            Cancel
          </Button>
          <Button type="submit" disabled={!renameTitle.trim()}>
            Rename
          </Button>
        </div>
      </form>
    </div>
  ) : null;

  const actionApprovalModal = pendingApproval ? (
    <AlertDialog open onOpenChange={(nextOpen) => {
      if (!nextOpen && !approvalBusy) setPendingApproval(null);
    }}>
      <AlertDialogContent className={styles.approvalDialog}>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve dashboard changes</AlertDialogTitle>
          <AlertDialogDescription>Review exact changes. Nothing below runs until approved.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className={styles.approvalActionList}>
          {pendingApproval.actions.map((action) => (
            <article key={action.id} className={styles.approvalAction}>
              <strong>{formatActionName(action.name)}</strong>
              <pre>{formatActionArguments(action.arguments)}</pre>
            </article>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingApproval(null)} disabled={approvalBusy}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction type="button" onClick={() => applyPendingApproval()} disabled={approvalBusy}>
            {approvalBusy ? <IconLoader2 size={15} className={styles.spin} /> : <IconCheck size={15} />}
            Apply changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  const skillMenu = (
    <div className={styles.skillsMenu}>
      <div className={styles.skillsMenuHeader}>
        <div>
          <strong>Skills</strong>
          <span>{BUILTIN_ASSISTANT_SKILLS.length} built in · {activeSkillCount} of yours active</span>
        </div>
        <Button type="button" size="sm" className={styles.newSkillMenuButton} onClick={openSkillModal}>
          <IconPlus size={14} />
          <span>Add skill</span>
        </Button>
      </div>
      <label className={styles.skillSearch}>
        <IconSearch size={13} />
        <input
          value={skillSearch}
          onChange={(event) => setSkillSearch(event.target.value)}
          placeholder="Search skills"
        />
      </label>
      <div className={styles.skillMenuList}>
        {filteredBuiltinSkills.map((skill) => (
          <div key={skill.id} className={styles.skillMenuItem} data-enabled="true" data-builtin="true">
            <span className={styles.skillIcon}>{renderIcon(skill.icon, 15)}</span>
            <div className={styles.skillMenuText}>
              <strong>{skill.name}</strong>
              <span>{skill.description}</span>
            </div>
            <span className={styles.skillBuiltinTag}>Built in</span>
          </div>
        ))}
        {filteredSkills.length === 0 ? (
          <div className={styles.emptyThreads}>{skills.length === 0 ? "No skills of your own yet" : "No matching skills"}</div>
        ) : filteredSkills.map((skill) => (
          <div
            key={skill.id}
            className={styles.skillMenuItem}
            data-enabled={skill.enabled ? "true" : "false"}
            onContextMenu={(event) => openSkillContextMenu(event, skill.id)}
          >
            <button
              type="button"
              className={styles.skillToggle}
              data-enabled={skill.enabled ? "true" : "false"}
              onClick={() => toggleSkill(skill.id)}
              aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
            >
              <IconCheck size={13} />
            </button>
            <span className={styles.skillIcon}>{renderIcon(skill.icon, 15)}</span>
            <div className={styles.skillMenuText}>
              <strong>{skill.name}</strong>
              <span>{skill.description || skill.instructions}</span>
            </div>
            <button
              type="button"
              className={styles.skillDelete}
              onClick={(event) => {
                event.stopPropagation();
                deleteSkill(skill.id).catch((deleteError: any) => setError(deleteError?.message || "Failed to delete skill."));
              }}
              aria-label={`Delete ${skill.name}`}
            >
              <IconTrash size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const deleteThreadModal = pendingDeleteThread ? (
    <div className={styles.modalBackdrop} onMouseDown={() => setDeleteThreadId("")}>
      <section className={styles.confirmModal} onMouseDown={(event) => event.stopPropagation()} aria-label="Delete chat">
        <header className={styles.confirmModalHeader}>
          <h3>Delete chat?</h3>
          <button type="button" onClick={() => setDeleteThreadId("")} aria-label="Close">
            <IconX size={15} />
          </button>
        </header>
        <p>
          This will permanently remove "{pendingDeleteThread.title || "New chat"}" from your saved AI Agent chats.
        </p>
        <div className={styles.confirmModalActions}>
          <Button type="button" variant="outline" onClick={() => setDeleteThreadId("")}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => deleteThread(pendingDeleteThread.id).catch((deleteError: any) => setError(deleteError?.message || "Failed to delete chat."))}
          >
            Delete chat
          </Button>
        </div>
      </section>
    </div>
  ) : null;

  const skillModal = skillModalOpen ? (
    <div className={styles.modalBackdrop} onMouseDown={() => setSkillModalOpen(false)}>
      <section className={styles.skillModal} onMouseDown={(event) => event.stopPropagation()} aria-label="New Skill">
        <header className={styles.skillModalHeader}>
          {skillModalMode === "generate" ? (
            <button type="button" onClick={() => setSkillModalMode("edit")} aria-label="Back">
              <IconArrowLeft size={15} />
            </button>
          ) : <span className={styles.skillModalIcon}>{renderIcon(skillDraft.icon, 15)}</span>}
          <h3>{skillModalMode === "generate" ? "Make Skill" : editingSkillId ? "Edit Skill" : "New Skill"}</h3>
          <button type="button" onClick={() => setSkillModalOpen(false)} aria-label="Close">
            <IconX size={15} />
          </button>
        </header>

        {skillModalMode === "generate" ? (
          <div className={styles.skillModalBody}>
            <textarea
              value={skillPrompt}
              onChange={(event) => setSkillPrompt(event.target.value)}
              placeholder="Describe what this skill should help with..."
              rows={8}
            />
            <AssistantTooltip label={skillWriterBusy ? "Writing the skill..." : "Write this skill"}>
              <span className={styles.tooltipButtonWrap}>
                <button type="button" className={styles.primaryButton} onClick={draftSkillForMe} disabled={skillWriterBusy || !skillPrompt.trim()}>
                  {skillWriterBusy ? <IconLoader2 size={15} className={styles.spin} /> : <IconCube size={15} />}
                  <span>Write skill</span>
                </button>
              </span>
            </AssistantTooltip>
          </div>
        ) : (
          <div className={styles.skillModalBody}>
            <input
              value={skillDraft.name}
              onChange={(event) => setSkillDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Name"
            />
            <div className={styles.iconPickerRow}>
              <IconExplorer
                value={skillDraft.icon}
                onSelect={(icon) => setSkillDraft((current) => ({ ...current, icon }))}
                trigger={(
                  <button type="button" className={styles.iconPickerButton}>
                    {renderIcon(skillDraft.icon, 15)}
                    <span>{getIconExplorerLabel(skillDraft.icon)}</span>
                  </button>
                )}
              />
              <input
                value={skillDraft.description}
                onChange={(event) => setSkillDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Short description"
              />
            </div>
            <textarea
              value={skillDraft.instructions}
              onChange={(event) => setSkillDraft((current) => ({ ...current, instructions: event.target.value }))}
              placeholder="Write the instructions this skill should add to future chats"
              rows={8}
            />
            {skillDraft.instructions.trim() ? (
              <div
                className={styles.skillInstructionsPreview}
                aria-label="Skill instruction markdown preview"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(skillDraft.instructions) }}
              />
            ) : null}
            <div className={styles.skillModalActions}>
              <button type="button" onClick={() => setSkillModalMode("generate")}>
                <IconCube size={15} />
                <span>Make it for me</span>
              </button>
              <button type="button" className={styles.primaryButton} onClick={saveSkill}>
                <IconCheck size={15} />
                <span>{editingSkillId ? "Update skill" : "Save skill"}</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  ) : null;

  const renderThreadItem = (thread: ChatThread) => (
    <div
      key={thread.id}
      className={styles.threadItem}
      data-active={thread.id === activeThread?.id ? "true" : "false"}
      onContextMenu={(event) => openThreadMenu(event, thread.id)}
    >
      <button type="button" className={styles.threadSelectButton} onClick={() => setActiveThreadId(thread.id)}>
        {thread.pinned ? <IconPin size={16} className={styles.threadPinIcon} /> : null}
        <span>{thread.title || "New chat"}</span>
      </button>
      <button
        type="button"
        className={styles.threadDeleteButton}
        aria-label={`Delete ${thread.title || "chat"}`}
        onClick={(event) => {
          event.stopPropagation();
          if (event.shiftKey) deleteThread(thread.id).catch((deleteError: any) => setError(deleteError?.message || "Failed to delete chat."));
          else setDeleteThreadId(thread.id);
        }}
      >
        <IconTrash size={14} />
      </button>
    </div>
  );

  const panel = (
    <section
      className={mode === "dock" ? styles.chatPanel : styles.mainPanel}
      aria-label="AI Agent"
      data-tour-id="page-assistant"
      data-mode={mode}
      data-preview-agent={assistantPreview ? "true" : "false"}
    >
      <aside className={styles.threadList}>
        <button type="button" className={styles.newChatButton} onClick={startNewChat}>
          <IconPlus size={15} />
          <span>New chat</span>
        </button>
        <div className={styles.threadSeparator} />
        <div className={styles.threadItems}>
          {sortedThreads.length === 0 ? (
            <div className={styles.emptyThreads}>No chats yet</div>
          ) : (
            <>
              {pinnedThreads.length > 0 ? (
                <>
                  <div className={styles.threadSectionLabel}>Pinned</div>
                  {pinnedThreads.map(renderThreadItem)}
                  {unpinnedThreads.length > 0 ? <div className={styles.threadSeparator} /> : null}
                </>
              ) : null}
              {unpinnedThreads.length > 0 ? (
                <>
                  {pinnedThreads.length > 0 ? <div className={styles.threadSectionLabel}>Chats</div> : null}
                  {unpinnedThreads.map(renderThreadItem)}
                </>
              ) : null}
            </>
          )}
        </div>
      </aside>

      <div className={styles.chatArea}>
        <header className={styles.chatHeader}>
          <div className={styles.titleGroup}>
            <Select value={activeThread?.id || "__empty__"} onValueChange={(value) => value && selectThread(value)}>
              <SelectTrigger className={styles.threadSelect} aria-label="Active thread">
                <span className={styles.threadSelectLabel}>{activeThread?.title || "New chat"}</span>
              </SelectTrigger>
              <SelectContent className={styles.threadSelectContent} portalContainer={mode === "dock" ? floatingRef : undefined}>
                {!activeThread ? <SelectItem value="__empty__" className={styles.threadSelectItem}>Current draft</SelectItem> : null}
                {pinnedThreads.length > 0 ? <div className={styles.threadSelectGroupLabel}>Pinned</div> : null}
                {pinnedThreads.map((thread) => (
                  <SelectItem key={thread.id} value={thread.id} className={styles.threadSelectItem} onContextMenu={(event) => openThreadMenu(event, thread.id)}>
                    <IconPin size={15} className={styles.threadPinIcon} />
                    <span className={styles.threadOptionText}>{thread.title || "New chat"}</span>
                  </SelectItem>
                ))}
                {pinnedThreads.length > 0 && unpinnedThreads.length > 0 ? <div className={styles.threadSelectGroupLabel}>Chats</div> : null}
                {unpinnedThreads.map((thread) => (
                  <SelectItem key={thread.id} value={thread.id} className={styles.threadSelectItem} onContextMenu={(event) => openThreadMenu(event, thread.id)}>
                    <span className={styles.threadOptionText}>{thread.title || "New chat"}</span>
                  </SelectItem>
                ))}
                <SelectItem value="__new__" className={styles.threadSelectItem}>
                  <IconPlus size={14} />
                  <span>New chat</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={styles.windowActions}>
            {mode === "dock" && (
              <>
                <AssistantTooltip label="Open in main content">
                  <button
                    type="button"
                    onClick={() => closeDockPanel(onOpenInMain)}
                    aria-label="Open in main content"
                  >
                    <IconArrowsDiagonal size={15} />
                  </button>
                </AssistantTooltip>
                <AssistantTooltip label="Close AI Agent">
                  <button type="button" onClick={() => closeDockPanel()} aria-label="Close AI Agent">
                    <IconX size={15} />
                  </button>
                </AssistantTooltip>
              </>
            )}
          </div>
        </header>

        <div ref={messagesRef} className={styles.messages} onScroll={trackMessageScroll}>
          {!activeThread || activeThread.messages.length === 0 ? (
            <div className={styles.emptyChat}>
              <img src="/Assets/Millennium Logo White.png" alt="" aria-hidden="true" className={styles.emptyLogo} />
              <h3>Welcome to Millennium</h3>
              <p>Ask anything or tell Millennium what you need.</p>
              <div className={styles.emptyPrompts}>
                {EMPTY_PROMPTS.map(({ icon: PromptIcon, label, prompt }) => (
                  <button key={label} type="button" onClick={() => usePrompt(prompt)} disabled={busy}>
                    <PromptIcon size={15} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : activeThread.messages.map((message, index) => {
            const messageKey = `${activeThread.id}-${index}`;
            const isWorking = message.role === "assistant" && busy && activeThread.id === generatingThreadId && index === activeThread.messages.length - 1;
            const thinkingId = `${messageKey}-thinking`;
            const visibleContent = displayMessageContent(message.content).trim();
            const visibleThinking = cleanThinkingText(message.thinking || "");
            const thinkingText = summarizeThinking ? summarizeThinkingText(visibleThinking) : visibleThinking;
            const hasThinking = message.role === "assistant" && (isWorking || Boolean(thinkingText));
            const thinkingOpen = !summarizeThinking && (openThinkingKeys[messageKey] ?? false);
            const workedLabel = message.thinkingSeconds ? `Worked for ${formatWorkingTime(message.thinkingSeconds)}` : "Worked through reasoning";
            return (
              <article key={messageKey} className={styles.message} data-role={message.role} data-has-thinking={hasThinking ? "true" : undefined}>
                {hasThinking ? (
                  isWorking ? (
                    <AILoadingState
                      className={styles.aiLoadingState}
                      status={liveStatusLines.at(-1) || `Working for ${formatWorkingTime(workingSeconds)}`}
                      lines={liveStatusLines}
                    />
                  ) : (
                    <div className={styles.thinkingDetails} data-open={summarizeThinking || thinkingOpen ? "true" : "false"} data-summary={summarizeThinking ? "true" : undefined}>
                      {summarizeThinking ? (
                        <div className={styles.thinkingSummary}>
                          <span>{workedLabel}</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={styles.thinkingSummary}
                          aria-expanded={thinkingOpen}
                          aria-controls={thinkingId}
                          onClick={() => setOpenThinkingKeys((current) => ({ ...current, [messageKey]: !thinkingOpen }))}
                        >
                          <span>{workedLabel}</span>
                          <IconChevronDown size={14} aria-hidden="true" />
                        </button>
                      )}
                      <div id={thinkingId} className={styles.thinkingBody}>
                        <div className={styles.thinkingBodyInner}>
                          <div className={styles.thinkingLines}>
                            {thinkingText.split("\n").map((line, lineIndex) => {
                              const toolLine = isToolThinkingLine(line);
                              return (
                                <div key={`${messageKey}-thinking-${lineIndex}`} className={styles.thinkingLine} data-tool={toolLine ? "true" : undefined}>
                                  {toolLine ? <IconTool size={13} aria-hidden="true" /> : null}
                                  <span>{line}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                ) : null}
                {visibleContent ? (
                  <div
                    className={styles.messageBubble}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(visibleContent) }}
                  />
                ) : null}
                {message.attachments?.length ? (
                  <div className={styles.messageAttachments} aria-label="Message attachments">
                    {message.attachments.map((file) => (
                      <span key={file.id || `${file.name}-${file.size}`} className={styles.messageAttachmentCard}>
                        <IconPaperclip size={13} />
                        <span>{file.name}</span>
                        <em>{formatFileSize(file.size)}</em>
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage(input);
          }}
        >
          <div className={styles.composerInputWrap} data-preview={showComposerPreview && !composerFocused ? "true" : "false"}>
            {showComposerPreview && !composerFocused ? (
              <div
                className={styles.composerInlinePreview}
                role="button"
                tabIndex={0}
                aria-label="Edit markdown message"
                onMouseDown={(event) => {
                  event.preventDefault();
                  textareaRef.current?.focus();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    textareaRef.current?.focus();
                  }
                }}
                dangerouslySetInnerHTML={{ __html: composerPreviewHtml }}
              />
            ) : null}
            <textarea
              ref={textareaRef}
              value={input}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              onChange={(event) => {
                setInput(event.target.value);
                adjustComposerHeight();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask AI Agent..."
              rows={2}
            />
          </div>
          {attachments.length > 0 ? (
            <div className={styles.attachmentList} aria-label="Attached files">
              {attachments.map((file) => (
                <span key={file.id} className={styles.attachmentChip}>
                  <IconPaperclip size={13} />
                  <span>{file.name}</span>
                  <em>{formatFileSize(file.size)}</em>
                  <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`Remove ${file.name}`}>
                    <IconX size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className={styles.composerFooter}>
            <div className={styles.composerActions}>
              <ModelExplorer
                models={availableModels}
                selectedModelId={selectedModelId}
                onSelect={setSelectedModelId}
                portalContainer={mode === "dock" ? floatingRef : undefined}
              />
              <EmojiPicker onSelect={insertEmoji} portalContainer={mode === "dock" ? floatingRef : undefined} />
              <AssistantTooltip label="Attach files">
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach files"
                >
                  <IconFilePlus size={18} />
                </button>
              </AssistantTooltip>
              <Popover
                open={skillsMenuOpen}
                onOpenChange={(nextOpen) => nextOpen ? openSkillsMenu() : closeSkillsMenu()}
              >
                <PopoverTrigger
                  render={(
                    <button
                      type="button"
                      className={styles.skillsButton}
                      aria-label="Skills"
                      aria-expanded={skillsMenuOpen}
                    />
                  )}
                >
                  <IconCube size={17} />
                  <span>{formatSkillCount(activeSkillCount)}</span>
                </PopoverTrigger>
                <PopoverContent
                  className={styles.skillsPopover}
                  side="top"
                  align="end"
                  portalContainer={mode === "dock" ? floatingRef : undefined}
                >
                  {skillMenu}
                </PopoverContent>
              </Popover>
              <input
                ref={fileInputRef}
                className={styles.fileInput}
                type="file"
                multiple
                onChange={(event) => attachFiles(event.target.files).catch((attachError: any) => setError(attachError?.message || "Failed to attach file."))}
              />
            </div>
            {busy ? (
              <AssistantTooltip label="Cancel message">
                <button type="button" className={styles.cancelButton} aria-label="Cancel message" onClick={cancelMessage}>
                  <IconX size={16} />
                </button>
              </AssistantTooltip>
            ) : (
              <AssistantTooltip label="Send message">
                <button type="submit" className={styles.sendButton} aria-label="Send message" disabled={!input.trim() && attachments.length === 0}>
                  <IconSend size={16} />
                </button>
              </AssistantTooltip>
            )}
          </div>
        </form>
      </div>
    </section>
  );

  if (mode !== "dock") {
    return (
      <>
        <main ref={shellRef} className={mode === "page" ? styles.pageShell : styles.mainShell}>{panel}{skillModal}{deleteThreadModal}{renameThreadModal}{actionApprovalModal}</main>
        {threadContextMenu}
        {skillContextMenuElement}
      </>
    );
  }

  return (
    <>
      <div className={styles.launcherBar}>
        {dockBefore}
        {dockBefore ? <span className={styles.dockSeparator} data-visible={dockBeforeVisible ? "true" : "false"} aria-hidden="true" /> : null}
        <button
          ref={launcherRef}
          type="button"
          className={styles.launcherButton}
          onClick={() => {
            if (closePanelTimerRef.current) clearTimeout(closePanelTimerRef.current);
            setPanelClosing(false);
            setOpen(true);
          }}
          aria-label="Open AI Agent"
        >
          <IconSend size={15} />
          <span>AI Agent</span>
        </button>
        {dockAfter}
      </div>
      {open ? <div ref={floatingRef} className={styles.floatingShell} data-closing={panelClosing ? "true" : "false"}>{panel}</div> : null}
      {skillModal}
      {deleteThreadModal}
      {renameThreadModal}
      {actionApprovalModal}
      {threadContextMenu}
      {skillContextMenuElement}
    </>
  );
}

export default AssistantChat;
