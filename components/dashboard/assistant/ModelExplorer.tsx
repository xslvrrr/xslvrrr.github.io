"use client";

import { useMemo, useState, type RefObject } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconLock,
  IconSearch,
  IconStar,
  IconSparkles,
} from "@tabler/icons-react";
import Anthropic from "@lobehub/icons/es/Anthropic/components/Mono";
import Gemini from "@lobehub/icons/es/Gemini/components/Mono";
import Moonshot from "@lobehub/icons/es/Moonshot/components/Mono";
import Nvidia from "@lobehub/icons/es/Nvidia/components/Mono";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenRouter from "@lobehub/icons/es/OpenRouter/components/Mono";
import XAI from "@lobehub/icons/es/XAI/components/Mono";
import Zhipu from "@lobehub/icons/es/Zhipu/components/Mono";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ModelTier = "free" | "study" | "frontier";

export interface ExplorerAiModel {
  id: string;
  label: string;
  description: string;
  minimumTier: ModelTier;
  lab: string;
  recommended?: boolean;
  locked?: boolean;
  priceBand?: 1 | 2 | 3;
  externalBilling?: boolean;
}

interface ModelExplorerProps {
  models: ExplorerAiModel[];
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  portalContainer?: RefObject<HTMLElement | ShadowRoot | null>;
}

const LAB_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  moonshot: "Moonshot",
  "z-ai": "Z.ai",
  "x-ai": "xAI",
  nvidia: "NVIDIA",
};

const LAB_ORDER = ["openrouter", "anthropic", "openai", "google", "moonshot", "z-ai", "x-ai", "nvidia"];

function tierLabel(tier: ModelTier) {
  if (tier === "frontier") return "Frontier";
  if (tier === "study") return "Study";
  return "Free";
}

function LabLogo({ lab }: { lab: string }) {
  const className = "size-4";
  if (lab === "openrouter") return <OpenRouter className={className} />;
  if (lab === "anthropic") return <Anthropic className={className} />;
  if (lab === "openai") return <OpenAI className={className} />;
  if (lab === "google") return <Gemini className={className} />;
  if (lab === "moonshot") return <Moonshot className={className} />;
  if (lab === "z-ai") return <Zhipu className={className} />;
  if (lab === "x-ai") return <XAI className={className} />;
  if (lab === "nvidia") return <Nvidia className={className} />;
  return <IconSparkles className={className} />;
}

function priceLabel(priceBand: 1 | 2 | 3) {
  if (priceBand === 3) return "Expensive";
  if (priceBand === 2) return "Mid-range";
  return "Affordable";
}

export function ModelExplorer({
  models,
  selectedModelId,
  onSelect,
  portalContainer,
}: ModelExplorerProps) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("recommended");
  const [query, setQuery] = useState("");
  const selected = models.find((model) => model.id === selectedModelId) || models[0];
  const labs = useMemo(() => (
    LAB_ORDER.filter((lab) => models.some((model) => model.lab === lab))
  ), [models]);
  const visibleModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return models.filter((model) => {
      if (section === "recommended" && !model.recommended) return false;
      if (section !== "recommended" && model.lab !== section) return false;
      if (!normalizedQuery) return true;
      return `${model.label} ${model.description} ${LAB_LABELS[model.lab] || model.lab}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [models, query, section]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 min-w-0 max-w-44 gap-1.5 px-2 text-xs"
            aria-label="Open model explorer"
          />
        )}
      >
        <span className="truncate">{selected?.label || "Choose model"}</span>
        <Badge variant="outline" className="hidden h-5 px-1.5 text-[9px] sm:inline-flex">
          {selected ? tierLabel(selected.minimumTier) : "Free"}
        </Badge>
        <IconChevronDown className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        portalContainer={portalContainer}
        side="top"
        align="start"
        className="h-[440px] w-[min(580px,calc(100vw-24px))] max-h-[min(440px,calc(100vh-24px))] max-w-[calc(100vw-24px)] gap-0 overflow-hidden p-0"
      >
        <div className="shrink-0 border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <IconSparkles className="size-4 text-[var(--accent-color,var(--primary))]" />
            <div className="min-w-0">
              <p className="font-medium">Model explorer</p>
              {/* Every catalogue model is available in this release; the lock and tier badges
                  below stay in place for when paid tiers return. */}
              <p className="text-[11px] text-muted-foreground">Built-in and your own provider models</p>
            </div>
          </div>
          <div className="relative mt-2">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 pl-8 text-xs"
              placeholder="Search models"
            />
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[52px_minmax(0,1fr)]">
          <aside className="overflow-y-auto border-r border-border bg-muted/35 p-1.5" aria-label="Model labs">
            <Tooltip>
              <TooltipTrigger
                render={(
                  <button
                    type="button"
                    aria-label="Recommended models"
                    onClick={() => setSection("recommended")}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md transition-colors",
                      section === "recommended" ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:bg-background/70",
                    )}
                  />
                )}
              >
                <IconStar className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="right">Recommended</TooltipContent>
            </Tooltip>
            <div className="my-1 h-px bg-border" />
            <div className="grid gap-0.5">
              {labs.map((lab) => (
                <Tooltip key={lab}>
                  <TooltipTrigger
                    render={(
                      <button
                        type="button"
                        aria-label={`${LAB_LABELS[lab] || lab} models`}
                        onClick={() => setSection(lab)}
                        className={cn(
                          "flex size-9 items-center justify-center rounded-md transition-colors",
                          section === lab ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:bg-background/70",
                        )}
                      />
                    )}
                  >
                    <LabLogo lab={lab} />
                  </TooltipTrigger>
                  <TooltipContent side="right">{LAB_LABELS[lab] || lab}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </aside>
          <div className="min-h-0 overflow-y-auto p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium">
                {section === "recommended" ? "Recommended" : LAB_LABELS[section] || section}
              </span>
              <span className="text-[10px] text-muted-foreground">{visibleModels.length} models</span>
            </div>
            <div className="grid gap-1.5">
              {visibleModels.map((model) => {
                const active = model.id === selectedModelId;
                return (
                  <button
                    type="button"
                    key={model.id}
                    aria-disabled={model.locked || undefined}
                    onClick={() => {
                      if (model.locked) return;
                      onSelect(model.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-2.5 text-left transition-colors",
                      active
                        ? "border-[var(--accent-color,var(--primary))] bg-accent"
                        : "border-border hover:bg-accent/60",
                      model.locked && "cursor-not-allowed opacity-65 hover:bg-transparent",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium">{model.label}</span>
                        {active ? <IconCheck className="size-3.5 shrink-0 text-[var(--accent-color,var(--primary))]" /> : null}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                        {model.description}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span
                        className="min-w-6 text-right font-mono text-[10px] font-semibold text-muted-foreground"
                        aria-label={model.externalBilling ? "Billed by your provider" : `${priceLabel(model.priceBand || 1)} model pricing`}
                        title={model.externalBilling ? "Billed by your provider" : priceLabel(model.priceBand || 1)}
                      >
                        {model.externalBilling ? "BYOK" : "$".repeat(model.priceBand || 1)}
                      </span>
                      <Badge
                        variant={model.minimumTier === "frontier" ? "default" : "outline"}
                        className="h-5 shrink-0 gap-1 px-1.5 text-[9px]"
                      >
                        {model.locked ? <IconLock className="size-2.5" /> : null}
                        {model.externalBilling ? "Yours" : tierLabel(model.minimumTier)}
                      </Badge>
                    </span>
                  </button>
                );
              })}
              {visibleModels.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">No matching models.</p>
              ) : null}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
