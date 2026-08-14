import { useMemo, useRef, useState } from "react";
import {
  IconBallBasketball,
  IconBulb,
  IconCar,
  IconFlag,
  IconHeart,
  IconLeaf,
  IconMoodSmile,
  IconPizza,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import emojiData from "emojibase-data/en/compact.json";
import cldrShortcodes from "emojibase-data/en/shortcodes/cldr.json";
import emojibaseShortcodes from "emojibase-data/en/shortcodes/emojibase.json";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import styles from "./AssistantChat.module.css";

const EMOJI_GROUPS = [
  { id: "faces", label: "Smileys", icon: IconMoodSmile, group: 0 },
  { id: "people", label: "People", icon: IconUser, group: 1 },
  { id: "nature", label: "Nature", icon: IconLeaf, group: 2 },
  { id: "food", label: "Food", icon: IconPizza, group: 3 },
  { id: "travel", label: "Travel", icon: IconCar, group: 4 },
  { id: "activities", label: "Activities", icon: IconBallBasketball, group: 5 },
  { id: "objects", label: "Objects", icon: IconBulb, group: 6 },
  { id: "symbols", label: "Symbols", icon: IconHeart, group: 7 },
  { id: "flags", label: "Flags", icon: IconFlag, group: 8 },
] as const;

interface EmojiRecord {
  unicode?: string;
  hexcode: string;
  label: string;
  tags?: string[];
  group?: number;
  emoticon?: string;
}

const shortcodeValues = (shortcodes: string | string[] | undefined) => (
  Array.isArray(shortcodes) ? shortcodes : shortcodes ? [shortcodes] : []
);

const normalizeSearch = (value: string) => value.replace(/^:+|:+$/g, "").replace(/[_-]+/g, " ").toLowerCase();
const stringAliases = (values: unknown[]) => values.filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

const cldrAliases = cldrShortcodes as Record<string, string | string[] | undefined>;
const emojibaseAliases = emojibaseShortcodes as Record<string, string | string[] | undefined>;

const EMOJIS = (emojiData as EmojiRecord[])
  .flatMap((item) => {
    if (!item.unicode || typeof item.group !== "number") return [];
    const group = EMOJI_GROUPS.find((entry) => entry.group === item.group) || EMOJI_GROUPS[0];
    const aliases = stringAliases([
      item.label,
      ...(item.tags || []),
      ...shortcodeValues(cldrAliases[item.hexcode]),
      ...shortcodeValues(emojibaseAliases[item.hexcode]),
      item.emoticon || "",
    ]);
    return [{
      emoji: item.unicode,
      label: item.label,
      search: aliases.flatMap((alias) => [alias, normalizeSearch(alias)]).join(" ").toLowerCase(),
      groupId: group.id,
    }];
  });

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  portalContainer?: React.RefObject<HTMLElement | ShadowRoot | null>;
}

export function EmojiPicker({ onSelect, portalContainer }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<(typeof EMOJI_GROUPS)[number]["id"]>("faces");
  const gridRef = useRef<HTMLDivElement | null>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => (
    normalizedQuery
      ? EMOJIS.filter((item) => item.search.includes(normalizeSearch(normalizedQuery)) || item.emoji === normalizedQuery)
      : EMOJIS
  ), [normalizedQuery]);

  const scrollToGroup = (groupId: (typeof EMOJI_GROUPS)[number]["id"]) => {
    setQuery("");
    setActiveGroup(groupId);
    requestAnimationFrame(() => groupRefs.current[groupId]?.scrollIntoView({ block: "start" }));
  };

  const updateActiveGroup = () => {
    const grid = gridRef.current;
    if (!grid || normalizedQuery) return;
    let next: (typeof EMOJI_GROUPS)[number]["id"] = EMOJI_GROUPS[0].id;
    for (const group of EMOJI_GROUPS) {
      const node = groupRefs.current[group.id];
      if (node && node.offsetTop - grid.scrollTop < 24) next = group.id;
    }
    setActiveGroup(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="icon" className={styles.iconButton} aria-label="Insert emoji" />}
      >
        <IconMoodSmile size={18} />
      </PopoverTrigger>
      <PopoverContent
        className={styles.emojiPicker}
        side="top"
        align="start"
        portalContainer={portalContainer}
        onPointerDownCapture={(event) => event.stopPropagation()}
        onMouseDownCapture={(event) => event.stopPropagation()}
      >
        <label className={styles.emojiSearch}>
          <IconSearch size={13} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search emojis" />
        </label>
        <div ref={gridRef} className={styles.emojiGrid} onScroll={updateActiveGroup}>
          {normalizedQuery ? (
            <div className={styles.emojiGroupGrid}>
              {filtered.map(({ emoji, label }, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                className={styles.emojiOption}
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
                aria-label={`Insert ${label}`}
              >
                {emoji}
              </button>
              ))}
            </div>
          ) : EMOJI_GROUPS.map((group) => (
              <div
                key={group.id}
                ref={(node) => {
                  groupRefs.current[group.id] = node;
                }}
                className={styles.emojiGroup}
              >
                <div className={styles.emojiGroupLabel}>{group.label}</div>
                <div className={styles.emojiGroupGrid}>
                  {filtered.filter((item) => item.groupId === group.id).map(({ emoji, label }, index) => (
                    <button
                      key={`${group.id}-${emoji}-${index}`}
                      type="button"
                      className={styles.emojiOption}
                      onClick={() => {
                        onSelect(emoji);
                        setOpen(false);
                      }}
                      aria-label={`Insert ${label}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
        <div className={styles.emojiCategoryBar} aria-label="Emoji categories">
          {EMOJI_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <button
                key={group.id}
                type="button"
                className={styles.emojiCategoryButton}
                data-active={!normalizedQuery && activeGroup === group.id ? "true" : "false"}
                onClick={() => scrollToGroup(group.id)}
                aria-label={group.label}
              >
                <GroupIcon size={14} />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
