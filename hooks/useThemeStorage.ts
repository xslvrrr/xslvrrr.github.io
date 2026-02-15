"use client"

import { useState, useEffect, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

export interface ThemeColors {
    // Background colors
    bgBase: string;
    bgSurface: string;
    bgElevated: string;
    bgOverlay: string;
    bgHover: string;

    // Border colors
    borderSubtle: string;
    borderDefault: string;
    borderStrong: string;

    // Text colors
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textPlaceholder: string;

    // Accent colors
    accent: string;
    accentHover: string;
    accentLight: string;
    accentTextColor?: 'white' | 'black';

    // Semantic colors
    errorColor?: string;
    errorBg?: string;
    successColor?: string;
    successBg?: string;
    warningColor?: string;
    warningBg?: string;
}

export interface StoredTheme {
    id: string;
    name: string;
    colors: ThemeColors;
    isDark: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface ThemeStorage {
    activePresetId: string | null;
    activeCustomThemeId: string | null;
    customThemes: StoredTheme[];
    isAdvanced: boolean;
    draftColors?: Partial<ThemeColors>;
    isDarkMode: boolean;
}

const DEFAULT_STORAGE: ThemeStorage = {
    activePresetId: 'dark-default',
    activeCustomThemeId: null,
    customThemes: [],
    isAdvanced: false,
    isDarkMode: true,
};

const STORAGE_KEY = 'millennium-theme-v2';

// ============================================
// COLOR UTILITIES
// ============================================

/**
 * Calculate relative luminance of a color
 */
export function getLuminance(hex: string): number {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return 0;

    const rgb = [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
    ].map(val => val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4));

    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * Detect if a color is "light" (luminance > 0.5)
 */
export function isLightColor(hex: string): boolean {
    return getLuminance(hex) > 0.5;
}

/**
 * Get optimal text color for a given background
 */
export function getContrastTextColor(bgColor: string): 'white' | 'black' {
    return isLightColor(bgColor) ? 'black' : 'white';
}

/**
 * Auto-detect light/dark mode from background color
 */
export function detectLightMode(bgColor: string): boolean {
    return getLuminance(bgColor) > 0.35;
}

// ============================================
// HOOK
// ============================================

export function useThemeStorage() {
    const [storage, setStorage] = useState<ThemeStorage>(DEFAULT_STORAGE);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setStorage({ ...DEFAULT_STORAGE, ...parsed });
            }
        } catch (e) {
            console.error('Failed to load theme storage:', e);
        }
        setIsLoaded(true);
    }, []);

    // Save to localStorage when storage changes
    useEffect(() => {
        if (!isLoaded) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
        } catch (e) {
            console.error('Failed to save theme storage:', e);
        }
    }, [storage, isLoaded]);

    // Select a preset theme
    const selectPreset = useCallback((presetId: string) => {
        setStorage(prev => ({
            ...prev,
            activePresetId: presetId,
            activeCustomThemeId: null,
            draftColors: undefined,
        }));
    }, []);

    // Select a custom theme
    const selectCustomTheme = useCallback((themeId: string) => {
        setStorage(prev => ({
            ...prev,
            activePresetId: null,
            activeCustomThemeId: themeId,
            draftColors: undefined,
        }));
    }, []);

    // Start editing (creates draft)
    const startEditing = useCallback((baseColors?: Partial<ThemeColors>) => {
        setStorage(prev => ({
            ...prev,
            draftColors: baseColors || {},
        }));
    }, []);

    // Update draft colors (doesn't apply or save)
    const updateDraft = useCallback((colors: Partial<ThemeColors>) => {
        setStorage(prev => ({
            ...prev,
            draftColors: { ...prev.draftColors, ...colors },
        }));
    }, []);

    // Discard draft
    const discardDraft = useCallback(() => {
        setStorage(prev => ({
            ...prev,
            draftColors: undefined,
        }));
    }, []);

    // Save custom theme
    const saveCustomTheme = useCallback((name: string, colors: ThemeColors, isDark: boolean): string => {
        const newTheme: StoredTheme = {
            id: `custom-${Date.now()}`,
            name,
            colors,
            isDark,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        setStorage(prev => ({
            ...prev,
            customThemes: [...prev.customThemes, newTheme],
            activePresetId: null,
            activeCustomThemeId: newTheme.id,
            draftColors: undefined,
        }));

        return newTheme.id;
    }, []);

    // Update existing custom theme
    const updateCustomTheme = useCallback((themeId: string, updates: Partial<Omit<StoredTheme, 'id' | 'createdAt'>>) => {
        setStorage(prev => ({
            ...prev,
            customThemes: prev.customThemes.map(theme =>
                theme.id === themeId
                    ? { ...theme, ...updates, updatedAt: Date.now() }
                    : theme
            ),
        }));
    }, []);

    // Delete custom theme
    const deleteCustomTheme = useCallback((themeId: string) => {
        setStorage(prev => {
            const newState = {
                ...prev,
                customThemes: prev.customThemes.filter(t => t.id !== themeId),
            };

            // If deleted theme was active, switch to default
            if (prev.activeCustomThemeId === themeId) {
                newState.activeCustomThemeId = null;
                newState.activePresetId = 'dark-default';
            }

            return newState;
        });
    }, []);

    // Toggle advanced mode
    const setAdvanced = useCallback((isAdvanced: boolean) => {
        setStorage(prev => ({ ...prev, isAdvanced }));
    }, []);

    // Toggle dark mode
    const setDarkMode = useCallback((isDarkMode: boolean) => {
        setStorage(prev => ({ ...prev, isDarkMode }));
    }, []);

    // Get current active theme (preset id or custom theme)
    const getActiveTheme = useCallback(() => {
        if (storage.activeCustomThemeId) {
            return storage.customThemes.find(t => t.id === storage.activeCustomThemeId);
        }
        return null;
    }, [storage.activeCustomThemeId, storage.customThemes]);

    return {
        // State
        storage,
        isLoaded,
        activePresetId: storage.activePresetId,
        activeCustomThemeId: storage.activeCustomThemeId,
        customThemes: storage.customThemes,
        isAdvanced: storage.isAdvanced,
        isDarkMode: storage.isDarkMode,
        draftColors: storage.draftColors,
        hasDraft: !!storage.draftColors,

        // Actions
        selectPreset,
        selectCustomTheme,
        startEditing,
        updateDraft,
        discardDraft,
        saveCustomTheme,
        updateCustomTheme,
        deleteCustomTheme,
        setAdvanced,
        setDarkMode,
        getActiveTheme,

        // Utilities
        getLuminance,
        isLightColor,
        getContrastTextColor,
        detectLightMode,
    };
}

export default useThemeStorage;
