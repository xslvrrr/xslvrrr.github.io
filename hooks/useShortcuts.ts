import { useEffect, useCallback, useState, useMemo } from 'react';
import { scopedBrowserStorageKey } from '../lib/storage-scope';

// ============================================
// TYPES
// ============================================

export interface ShortcutDefinition {
  id: string;
  label: string;
  description: string;
  category: 'navigation' | 'actions' | 'calendar' | 'notifications' | 'settings' | 'tabs';
  defaultKeys: string[]; // e.g., ['g', 'h'] for sequence, ['mod', 'k'] for combo
  isSequence?: boolean; // true for "g then h" style shortcuts
  isModifier?: boolean; // true for platform-aware modifier combos
  contextAware?: boolean; // true if should only work on specific pages
  contexts?: string[]; // pages where this shortcut is active (e.g., ['calendar', 'timetable'])
}

export interface ShortcutBinding {
  id: string;
  keys: string[];
  isSequence?: boolean;
  isModifier?: boolean;
}

export interface ShortcutHandlers {
  // Navigation
  'nav-home'?: () => void;
  'nav-account'?: () => void;
  'nav-notifications'?: () => void;
  'nav-calendar'?: () => void;
  'nav-classes'?: () => void;
  'nav-timetable'?: () => void;
  'nav-reports'?: () => void;
  'nav-attendance'?: () => void;
  'nav-classroom'?: () => void;
  'nav-settings'?: () => void;
  // Tabs
  'tab-new'?: () => void;
  'tab-close'?: () => void;
  'tab-next'?: () => void;
  'tab-previous'?: () => void;
  // Actions
  'action-search'?: () => void;
  'action-logout'?: () => void;
  // Calendar
  'calendar-create-event'?: () => void;
  'calendar-day-view'?: () => void;
  'calendar-week-view'?: () => void;
  'calendar-month-view'?: () => void;
  'calendar-today'?: () => void;
  'calendar-prev'?: () => void;
  'calendar-next'?: () => void;
  // Timetable
  'timetable-week-a'?: () => void;
  'timetable-week-b'?: () => void;
  // Notifications
  'notifications-inbox'?: () => void;
  'notifications-pinned'?: () => void;
  'notifications-alerts'?: () => void;
  'notifications-events'?: () => void;
  'notifications-assignments'?: () => void;
  'notifications-archive'?: () => void;
  // Settings
  'settings-general'?: () => void;
  'settings-appearance'?: () => void;
  'settings-animations'?: () => void;
  'settings-notifications'?: () => void;
  'settings-theme-builder'?: () => void;
  'settings-class-colors'?: () => void;
  'settings-shortcuts'?: () => void;
  'settings-sync'?: () => void;
  'settings-export'?: () => void;
}

// ============================================
// DEFAULT SHORTCUTS
// ============================================

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  // Navigation - "g then x" pattern (context-aware disabled by default)
  { id: 'nav-home', label: 'Go to Home', description: 'Navigate to dashboard home', category: 'navigation', defaultKeys: ['g', 'h'], isSequence: true, contextAware: false },
  { id: 'nav-account', label: 'Go to Account', description: 'Navigate to account page', category: 'navigation', defaultKeys: ['g', 'a'], isSequence: true, contextAware: false },
  { id: 'nav-notifications', label: 'Go to Notifications', description: 'Navigate to notifications', category: 'navigation', defaultKeys: ['g', 'n'], isSequence: true, contextAware: false },
  { id: 'nav-calendar', label: 'Go to Calendar', description: 'Navigate to calendar', category: 'navigation', defaultKeys: ['g', 'c'], isSequence: true, contextAware: false },
  { id: 'nav-classes', label: 'Go to Classes', description: 'Navigate to classes', category: 'navigation', defaultKeys: ['g', 'l'], isSequence: true, contextAware: false },
  { id: 'nav-timetable', label: 'Go to Timetable', description: 'Navigate to timetable', category: 'navigation', defaultKeys: ['g', 't'], isSequence: true, contextAware: false },
  { id: 'nav-reports', label: 'Go to Reports', description: 'Navigate to reports', category: 'navigation', defaultKeys: ['g', 'r'], isSequence: true, contextAware: false },
  { id: 'nav-attendance', label: 'Go to Attendance', description: 'Navigate to attendance', category: 'navigation', defaultKeys: ['g', 'd'], isSequence: true, contextAware: false },
  { id: 'nav-classroom', label: 'Go to Google Classroom', description: 'Navigate to Classroom assignments and classwork', category: 'navigation', defaultKeys: ['g', 'x'], isSequence: true, contextAware: false },
  { id: 'nav-settings', label: 'Go to Settings', description: 'Navigate to settings', category: 'navigation', defaultKeys: ['g', 's'], isSequence: true, contextAware: false },

  // Tabs.
  // Deliberately avoids ⌘⌥W (macOS "Close All Windows") and ⌘⌥←/→ (Chrome's own tab
  // switcher): the browser consumes those before the page ever sees a keydown.
  { id: 'tab-new', label: 'New Tab', description: 'Open a new dashboard tab', category: 'tabs', defaultKeys: ['mod', 'alt', 't'], isModifier: true },
  { id: 'tab-close', label: 'Close Tab', description: 'Close the active dashboard tab', category: 'tabs', defaultKeys: ['mod', 'alt', 'x'], isModifier: true },
  { id: 'tab-next', label: 'Next Tab', description: 'Cycle to the next dashboard tab', category: 'tabs', defaultKeys: ['mod', 'alt', 'n'], isModifier: true },
  { id: 'tab-previous', label: 'Previous Tab', description: 'Cycle to the previous dashboard tab', category: 'tabs', defaultKeys: ['mod', 'alt', 'p'], isModifier: true },

  // Actions
  { id: 'action-search', label: 'Open Search', description: 'Open command menu / search', category: 'actions', defaultKeys: ['mod', 'k'], isModifier: true },
  { id: 'action-logout', label: 'Log Out', description: 'Sign out of your account', category: 'actions', defaultKeys: ['mod', 'alt', 'q'], isModifier: true },

  // Calendar views (context-aware)
  { id: 'calendar-create-event', label: 'Create Event', description: 'Open create calendar event modal', category: 'calendar', defaultKeys: ['c'], isSequence: false, contextAware: true, contexts: ['calendar'] },
  { id: 'calendar-day-view', label: 'Day View', description: 'Switch to calendar day view', category: 'calendar', defaultKeys: ['1'], isSequence: false, contextAware: true, contexts: ['calendar'] },
  { id: 'calendar-week-view', label: 'Week View', description: 'Switch to calendar week view', category: 'calendar', defaultKeys: ['2'], isSequence: false, contextAware: true, contexts: ['calendar'] },
  { id: 'calendar-month-view', label: 'Month View', description: 'Switch to calendar month view', category: 'calendar', defaultKeys: ['3'], isSequence: false, contextAware: true, contexts: ['calendar'] },
  { id: 'calendar-today', label: 'Go to Today', description: 'Navigate to today in calendar', category: 'calendar', defaultKeys: ['t'], isSequence: false, contextAware: true, contexts: ['calendar'] },
  { id: 'calendar-prev', label: 'Previous Date Range', description: 'Go to the previous day, week, or month', category: 'calendar', defaultKeys: ['arrowleft'], isSequence: false, contextAware: true, contexts: ['calendar'] },
  { id: 'calendar-next', label: 'Next Date Range', description: 'Go to the next day, week, or month', category: 'calendar', defaultKeys: ['arrowright'], isSequence: false, contextAware: true, contexts: ['calendar'] },

  // Timetable (context-aware)
  { id: 'timetable-week-a', label: 'Week A', description: 'Switch to Week A in timetable', category: 'calendar', defaultKeys: ['a'], isSequence: false, contextAware: true, contexts: ['timetable'] },
  { id: 'timetable-week-b', label: 'Week B', description: 'Switch to Week B in timetable', category: 'calendar', defaultKeys: ['b'], isSequence: false, contextAware: true, contexts: ['timetable'] },

  // Notification categories (context-aware disabled by default)
  { id: 'notifications-inbox', label: 'Inbox', description: 'View inbox notifications', category: 'notifications', defaultKeys: ['n', 'i'], isSequence: true, contextAware: false, contexts: ['notifications'] },
  { id: 'notifications-pinned', label: 'Pinned', description: 'View pinned notifications', category: 'notifications', defaultKeys: ['n', 'p'], isSequence: true, contextAware: false, contexts: ['notifications'] },
  { id: 'notifications-alerts', label: 'Alerts', description: 'View alert notifications', category: 'notifications', defaultKeys: ['n', 'a'], isSequence: true, contextAware: false, contexts: ['notifications'] },
  { id: 'notifications-events', label: 'Events', description: 'View event notifications', category: 'notifications', defaultKeys: ['n', 'e'], isSequence: true, contextAware: false, contexts: ['notifications'] },
  { id: 'notifications-assignments', label: 'Assignments', description: 'View assignment notifications', category: 'notifications', defaultKeys: ['n', 's'], isSequence: true, contextAware: false, contexts: ['notifications'] },
  { id: 'notifications-archive', label: 'Archive', description: 'View archived notifications', category: 'notifications', defaultKeys: ['n', 'r'], isSequence: true, contextAware: false, contexts: ['notifications'] },

  // Settings sections (context-aware disabled by default)
  { id: 'settings-general', label: 'General Settings', description: 'Open general settings', category: 'settings', defaultKeys: ['s', 'g'], isSequence: true, contextAware: false, contexts: ['settings'] },
  { id: 'settings-appearance', label: 'Appearance Settings', description: 'Open appearance settings', category: 'settings', defaultKeys: ['s', 'a'], isSequence: true, contextAware: false, contexts: ['settings'] },
  { id: 'settings-animations', label: 'Animation Settings', description: 'Open animation settings', category: 'settings', defaultKeys: ['s', 'm'], isSequence: true, contextAware: false, contexts: ['settings'] },
  { id: 'settings-notifications', label: 'Notification Settings', description: 'Open notification settings', category: 'settings', defaultKeys: ['s', 'n'], isSequence: true, contextAware: false, contexts: ['settings'] },
  { id: 'settings-theme-builder', label: 'Theme Builder', description: 'Open theme builder', category: 'settings', defaultKeys: ['s', 't'], isSequence: true, contextAware: false, contexts: ['settings'] },
  { id: 'settings-class-colors', label: 'Class Colours', description: 'Open class colours settings', category: 'settings', defaultKeys: ['s', 'c'], isSequence: true, contextAware: false, contexts: ['settings'] },
  { id: 'settings-shortcuts', label: 'Shortcuts', description: 'Open shortcuts settings', category: 'settings', defaultKeys: ['s', 'k'], isSequence: true, contextAware: false, contexts: ['settings'] },
  { id: 'settings-sync', label: 'Sync Settings', description: 'Open data sync, fetch, and range settings', category: 'settings', defaultKeys: ['s', 'y'], isSequence: true, contextAware: false, contexts: ['settings'] },
  { id: 'settings-export', label: 'Export Settings', description: 'Open export settings', category: 'settings', defaultKeys: ['s', 'e'], isSequence: true, contextAware: false, contexts: ['settings'] },
];

const STORAGE_KEY = 'millennium-shortcuts';
const CONTEXT_AWARE_KEY = 'millennium-shortcuts-context-aware-categories';

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = navigatorWithUserAgentData.userAgentData?.platform
    || navigator.platform
    || navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

function isInputElement(element: Element | null): boolean {
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  const isContentEditable = element.getAttribute('contenteditable') === 'true';
  return isInput || isContentEditable;
}

/**
 * Physical keys that `KeyboardEvent.code` reports positionally. Letters and digits are
 * derived by pattern; only punctuation needs an explicit table.
 */
const PHYSICAL_KEY_BY_CODE: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/**
 * Resolves the key a shortcut should match against.
 *
 * macOS composes Option with the pressed key, so `event.key` for Option+T is `†` and for
 * Option+Q is `œ` — matching on it means no `alt` combo can ever fire. `event.code` reports the
 * physical key regardless of composition, so it is preferred whenever Alt is held. Keys that do
 * not compose (arrows, Escape, Enter) keep using `event.key`, which stays correct across layouts.
 */
export function resolvePhysicalKey(event: Pick<KeyboardEvent, 'key' | 'code' | 'altKey'>): string {
  if (!event.altKey || !event.code) return event.key;

  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter) return letter[1].toLowerCase();

  const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
  if (digit) return digit[1];

  return PHYSICAL_KEY_BY_CODE[event.code] ?? event.key;
}

function normalizeKey(key: string): string {
  // Normalize special keys
  const keyMap: Record<string, string> = {
    'meta': 'mod',
    'command': 'mod',
    'cmd': 'mod',
    '⌘': 'mod',
    'ctrl': 'mod',
    'control': 'mod',
    '⌃': 'mod',
    'alt': 'alt',
    'option': 'alt',
    '⌥': 'alt',
    'shift': 'shift',
    '⇧': 'shift',
  };
  return keyMap[key.toLowerCase()] || key.toLowerCase();
}

export function formatShortcutKey(raw: string): string {
  const key = normalizeKey(raw);
  const isApple = isApplePlatform();
  if (key === 'mod') return isApple ? '⌘' : 'Ctrl';
  if (key === 'alt') return isApple ? '⌥' : 'Alt';
  if (key === 'shift') return isApple ? '⇧' : 'Shift';
  if (key === 'arrowleft') return 'Left Arrow';
  if (key === 'arrowright') return 'Right Arrow';
  if (key === 'arrowup') return 'Up Arrow';
  if (key === 'arrowdown') return 'Down Arrow';
  return key.toUpperCase();
}

export function formatShortcutDisplay(keys: string[], isSequence?: boolean): string {
  if (isSequence && keys.length === 2) {
    return `${formatShortcutKey(keys[0])} then ${formatShortcutKey(keys[1])}`;
  }
  return keys.map(formatShortcutKey).join(' + ');
}

// ============================================
// HOOK
// ============================================

export function useShortcuts(
  handlers: ShortcutHandlers, 
  enabled: boolean = true,
  currentContext?: string, // e.g., 'calendar', 'notifications', 'timetable', 'settings'
  userId?: string,
  onBindingsChange?: (bindings: Record<string, Omit<ShortcutBinding, 'id'>>) => void,
) {
  const [customBindings, setCustomBindings] = useState<ShortcutBinding[]>([]);
  const [sequenceBuffer, setSequenceBuffer] = useState<string[]>([]);
  const [sequenceTimeout, setSequenceTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const defaultContextAwareCategories = useMemo(() => ({
    navigation: false,
    calendar: true,
    notifications: false,
    settings: false,
  }), []);
  const [contextAwareCategories, setContextAwareCategories] = useState<Record<string, boolean>>(defaultContextAwareCategories);
  const bindingsStorageKey = scopedBrowserStorageKey(STORAGE_KEY, userId);
  const contextStorageKey = scopedBrowserStorageKey(CONTEXT_AWARE_KEY, userId);

  const notifyBindingsChange = useCallback((bindings: ShortcutBinding[]) => {
    onBindingsChange?.(Object.fromEntries(bindings.map(({ id, ...binding }) => [id, binding])));
  }, [onBindingsChange]);

  useEffect(() => {
    setContextAwareCategories(defaultContextAwareCategories);
    if (!contextStorageKey) return;
    try {
      const saved = localStorage.getItem(contextStorageKey);
      if (saved) setContextAwareCategories({ ...defaultContextAwareCategories, ...JSON.parse(saved) });
    } catch {
      setContextAwareCategories(defaultContextAwareCategories);
    }
  }, [contextStorageKey, defaultContextAwareCategories]);

  // Load custom bindings from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCustomBindings([]);
    const loadBindings = async () => {
      try {
        const response = await fetch('/api/user/preferences');
        if (response.ok) {
          const payload = await response.json();
          const serverBindings = payload?.homeSettings?.shortcutBindings;
          if (serverBindings && typeof serverBindings === 'object') {
            const nextBindings = Object.entries(serverBindings)
              .map(([id, binding]) => {
                if (!binding || typeof binding !== 'object') return null;
                const raw = binding as Partial<ShortcutBinding>;
                return Array.isArray(raw.keys) ? { ...raw, id } as ShortcutBinding : null;
              })
              .filter((binding): binding is ShortcutBinding => Boolean(binding));
            setCustomBindings(nextBindings);
            if (bindingsStorageKey) localStorage.setItem(bindingsStorageKey, JSON.stringify(nextBindings));
            return;
          }
        }
      } catch {
        // Fall back to local bindings below.
      }

      try {
        const saved = bindingsStorageKey ? localStorage.getItem(bindingsStorageKey) : null;
        if (saved) {
          setCustomBindings(JSON.parse(saved));
        }
      } catch (e) {
        console.error('Failed to load shortcut bindings:', e);
      }
    };

    loadBindings();
    window.addEventListener('assistant-actions-applied', loadBindings);
    return () => window.removeEventListener('assistant-actions-applied', loadBindings);
  }, [bindingsStorageKey]);

  // Keep localStorage compatible for older screens and offline fallback.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = bindingsStorageKey ? localStorage.getItem(bindingsStorageKey) : null;
      if (saved && customBindings.length === 0) {
        setCustomBindings(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load shortcut bindings:', e);
    }
  }, [bindingsStorageKey, customBindings.length]);

  // Get effective bindings (custom overrides defaults)
  const effectiveBindings = useMemo(() => {
    const bindings: Map<string, ShortcutBinding> = new Map();
    
    // Start with defaults
    DEFAULT_SHORTCUTS.forEach(shortcut => {
      bindings.set(shortcut.id, {
        id: shortcut.id,
        keys: shortcut.defaultKeys,
        isSequence: shortcut.isSequence,
        isModifier: shortcut.isModifier,
      });
    });

    // Apply custom overrides
    customBindings.forEach(binding => {
      if (bindings.has(binding.id)) {
        bindings.set(binding.id, binding);
      }
    });

    return bindings;
  }, [customBindings]);

  // Save custom binding
  const setShortcutBinding = useCallback((id: string, keys: string[]) => {
    const shortcut = DEFAULT_SHORTCUTS.find(s => s.id === id);
    if (!shortcut) return;

    const updated = customBindings.filter(b => b.id !== id);
    if (JSON.stringify(keys) !== JSON.stringify(shortcut.defaultKeys)) {
      updated.push({
        id,
        keys,
        isSequence: shortcut.isSequence,
        isModifier: shortcut.isModifier,
      });
    }
    setCustomBindings(updated);
    if (bindingsStorageKey) localStorage.setItem(bindingsStorageKey, JSON.stringify(updated));
    notifyBindingsChange(updated);
  }, [bindingsStorageKey, customBindings, notifyBindingsChange]);

  // Reset all to defaults
  const resetAllBindings = useCallback(() => {
    setCustomBindings([]);
    if (bindingsStorageKey) localStorage.removeItem(bindingsStorageKey);
    notifyBindingsChange([]);
  }, [bindingsStorageKey, notifyBindingsChange]);

  // Reset single binding to default
  const resetBinding = useCallback((id: string) => {
    const updated = customBindings.filter(b => b.id !== id);
    setCustomBindings(updated);
    if (bindingsStorageKey) localStorage.setItem(bindingsStorageKey, JSON.stringify(updated));
    notifyBindingsChange(updated);
  }, [bindingsStorageKey, customBindings, notifyBindingsChange]);

  // Toggle context-aware for a specific category
  const toggleContextAware = useCallback((category: string, value: boolean) => {
    setContextAwareCategories(prev => {
      const updated = { ...prev, [category]: value };
      if (contextStorageKey) localStorage.setItem(contextStorageKey, JSON.stringify(updated));
      return updated;
    });
  }, [contextStorageKey]);

  // Clear sequence buffer
  const clearSequence = useCallback(() => {
    setSequenceBuffer([]);
    if (sequenceTimeout) {
      clearTimeout(sequenceTimeout);
      setSequenceTimeout(null);
    }
  }, [sequenceTimeout]);

  // Handle keyboard events
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (isInputElement(document.activeElement)) {
        clearSequence();
        return;
      }

      const key = normalizeKey(resolvePhysicalKey(e));

      // Check for modifier combos first
      if (e.metaKey || e.ctrlKey) {
        const modifiers: string[] = [];
        if (e.metaKey || e.ctrlKey) modifiers.push('mod');
        if (e.shiftKey) modifiers.push('shift');
        if (e.altKey) modifiers.push('alt');
        modifiers.push(key);

        for (const [id, binding] of effectiveBindings) {
          if (binding.isModifier) {
            const bindingKeys = binding.keys.map(k => normalizeKey(k));
            if (
              bindingKeys.length === modifiers.length &&
              bindingKeys.every(k => modifiers.includes(k))
            ) {
              const handler = handlers[id as keyof ShortcutHandlers];
              if (handler) {
                e.preventDefault();
                handler();
                clearSequence();
                return;
              }
            }
          }
        }
        return;
      }

      // Handle sequence shortcuts
      const newBuffer = [...sequenceBuffer, key];
      
      // Clear existing timeout and set new one
      if (sequenceTimeout) {
        clearTimeout(sequenceTimeout);
      }
      const timeout = setTimeout(clearSequence, 1000);
      setSequenceTimeout(timeout);
      setSequenceBuffer(newBuffer);

      // Check for matches
      for (const [id, binding] of effectiveBindings) {
        const bindingKeys = binding.keys.map(k => normalizeKey(k));
        
        // Check if this shortcut should be context-aware
        const shortcutDef = DEFAULT_SHORTCUTS.find(s => s.id === id);
        if (shortcutDef) {
          const categoryContextAware = contextAwareCategories[shortcutDef.category] ?? shortcutDef.contextAware;
          if (categoryContextAware && shortcutDef.contexts) {
            // Skip if not in the right context
            if (!currentContext || !shortcutDef.contexts.includes(currentContext)) {
              continue;
            }
          }
        }
        
        if (binding.isSequence) {
          // Sequence match (e.g., "g then h")
          if (
            newBuffer.length >= bindingKeys.length &&
            bindingKeys.every((k, i) => newBuffer[newBuffer.length - bindingKeys.length + i] === k)
          ) {
            const handler = handlers[id as keyof ShortcutHandlers];
            if (handler) {
              e.preventDefault();
              handler();
              clearSequence();
              return;
            }
          }
        } else if (!binding.isModifier && bindingKeys.length === 1) {
          // Single key match
          if (key === bindingKeys[0]) {
            const handler = handlers[id as keyof ShortcutHandlers];
            if (handler) {
              e.preventDefault();
              handler();
              clearSequence();
              return;
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeout) clearTimeout(sequenceTimeout);
    };
  }, [enabled, effectiveBindings, handlers, sequenceBuffer, sequenceTimeout, clearSequence, contextAwareCategories, currentContext]);

  return {
    shortcuts: DEFAULT_SHORTCUTS,
    bindings: effectiveBindings,
    setShortcutBinding,
    resetBinding,
    resetAllBindings,
    formatShortcutDisplay,
    contextAwareCategories,
    toggleContextAware,
  };
}

// Export for CommandMenu to use
export function getShortcutForCommand(commandId: string): string[] | undefined {
  // Map command menu IDs to shortcut IDs
  const mapping: Record<string, string> = {
    'nav-home': 'nav-home',
    'nav-account': 'nav-account',
    'nav-notifications': 'nav-notifications',
    'nav-calendar': 'nav-calendar',
    'nav-classes': 'nav-classes',
    'nav-timetable': 'nav-timetable',
    'nav-reports': 'nav-reports',
    'nav-attendance': 'nav-attendance',
    'nav-classroom': 'nav-classroom',
    'nav-settings': 'nav-settings',
    'action-create-event': 'action-create-event',
    'action-logout': 'action-logout',
  };

  const shortcutId = mapping[commandId];
  if (!shortcutId) return undefined;

  const shortcut = DEFAULT_SHORTCUTS.find(s => s.id === shortcutId);
  return shortcut?.defaultKeys;
}
