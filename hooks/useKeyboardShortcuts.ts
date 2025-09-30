import { useEffect } from 'react';

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  handler: () => void;
  description?: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrlKey === undefined || shortcut.ctrlKey === event.ctrlKey;
        const shiftMatch = shortcut.shiftKey === undefined || shortcut.shiftKey === event.shiftKey;
        const metaMatch = shortcut.metaKey === undefined || shortcut.metaKey === (event.metaKey || event.ctrlKey);
        const keyMatch = shortcut.key.toLowerCase() === event.key.toLowerCase();

        if (ctrlMatch && shiftMatch && metaMatch && keyMatch) {
          event.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

// Common keyboard shortcuts
export const createDashboardShortcuts = (handlers: {
  onSearch?: () => void;
  onHome?: () => void;
  onNotifications?: () => void;
  onRefresh?: () => void;
}) => {
  const shortcuts: KeyboardShortcut[] = [];

  if (handlers.onSearch) {
    shortcuts.push({
      key: 'k',
      metaKey: true,
      handler: handlers.onSearch,
      description: 'Open search'
    });
  }

  if (handlers.onHome) {
    shortcuts.push({
      key: 'h',
      metaKey: true,
      handler: handlers.onHome,
      description: 'Go to home'
    });
  }

  if (handlers.onNotifications) {
    shortcuts.push({
      key: 'n',
      metaKey: true,
      handler: handlers.onNotifications,
      description: 'Open notifications'
    });
  }

  if (handlers.onRefresh) {
    shortcuts.push({
      key: 'r',
      metaKey: true,
      handler: handlers.onRefresh,
      description: 'Refresh data'
    });
  }

  return shortcuts;
};
