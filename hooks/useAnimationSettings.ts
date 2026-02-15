"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';

// ============================================
// TYPES
// ============================================

export interface AnimationSettings {
    // Master toggle
    enableAnimations: boolean;

    // Category toggles
    pageTransitions: boolean;
    microInteractions: boolean;
    hoverEffects: boolean;
    loadingAnimations: boolean;
    listStagger: boolean;
    sidebarAnimations: boolean;
    modalAnimations: boolean;

    // Timing preferences
    animationSpeed: 'slow' | 'normal' | 'fast';

    // Accessibility
    reduceMotion: boolean;
}

export const defaultAnimationSettings: AnimationSettings = {
    enableAnimations: true,
    pageTransitions: true,
    microInteractions: true,
    hoverEffects: true,
    loadingAnimations: true,
    listStagger: true,
    sidebarAnimations: true,
    modalAnimations: true,
    animationSpeed: 'normal',
    reduceMotion: false,
};

// Speed multipliers for animation timing
const SPEED_MULTIPLIERS = {
    slow: 1.5,
    normal: 1,
    fast: 0.6,
} as const;

// Base durations in ms
const BASE_DURATIONS = {
    fast: 150,
    normal: 200,
    slow: 300,
    bounce: 300,
} as const;

const STORAGE_KEY = 'millennium-animations-v1';

// ============================================
// CSS VARIABLE APPLICATION
// ============================================

function applyAnimationVariables(settings: AnimationSettings): void {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const multiplier = SPEED_MULTIPLIERS[settings.animationSpeed];

    // Calculate durations based on speed preference
    const fastDuration = Math.round(BASE_DURATIONS.fast * multiplier);
    const normalDuration = Math.round(BASE_DURATIONS.normal * multiplier);
    const slowDuration = Math.round(BASE_DURATIONS.slow * multiplier);
    const bounceDuration = Math.round(BASE_DURATIONS.bounce * multiplier);

    // Apply animation durations (or 0 if disabled)
    const isEnabled = settings.enableAnimations && !settings.reduceMotion;

    // Global animation duration variables
    root.style.setProperty('--anim-duration-fast', isEnabled ? `${fastDuration}ms` : '0ms');
    root.style.setProperty('--anim-duration-normal', isEnabled ? `${normalDuration}ms` : '0ms');
    root.style.setProperty('--anim-duration-slow', isEnabled ? `${slowDuration}ms` : '0ms');
    root.style.setProperty('--anim-duration-bounce', isEnabled ? `${bounceDuration}ms` : '0ms');

    // Category-specific toggles (1 = enabled, 0 = disabled)
    root.style.setProperty('--anim-page-transitions', settings.pageTransitions && isEnabled ? '1' : '0');
    root.style.setProperty('--anim-micro-interactions', settings.microInteractions && isEnabled ? '1' : '0');
    root.style.setProperty('--anim-hover-effects', settings.hoverEffects && isEnabled ? '1' : '0');
    root.style.setProperty('--anim-loading', settings.loadingAnimations && isEnabled ? '1' : '0');
    root.style.setProperty('--anim-list-stagger', settings.listStagger && isEnabled ? '1' : '0');
    root.style.setProperty('--anim-sidebar', settings.sidebarAnimations && isEnabled ? '1' : '0');
    root.style.setProperty('--anim-modal', settings.modalAnimations && isEnabled ? '1' : '0');

    // Transition timing strings (for use in transition properties)
    const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
    const bounceEasing = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

    root.style.setProperty('--transition-fast', isEnabled ? `${fastDuration}ms ${easing}` : '0ms');
    root.style.setProperty('--transition-normal', isEnabled ? `${normalDuration}ms ${easing}` : '0ms');
    root.style.setProperty('--transition-slow', isEnabled ? `${slowDuration}ms ${easing}` : '0ms');
    root.style.setProperty('--transition-bounce', isEnabled ? `${bounceDuration}ms ${bounceEasing}` : '0ms');

    // Add data attributes for CSS selectors
    root.setAttribute('data-animations', isEnabled ? 'enabled' : 'disabled');
    root.setAttribute('data-reduce-motion', settings.reduceMotion ? 'true' : 'false');
    
    // Category-specific data attributes for CSS targeting
    root.setAttribute('data-anim-page-transitions', settings.pageTransitions && isEnabled ? 'enabled' : 'disabled');
    root.setAttribute('data-anim-micro-interactions', settings.microInteractions && isEnabled ? 'enabled' : 'disabled');
    root.setAttribute('data-anim-hover-effects', settings.hoverEffects && isEnabled ? 'enabled' : 'disabled');
    root.setAttribute('data-anim-loading', settings.loadingAnimations && isEnabled ? 'enabled' : 'disabled');
    root.setAttribute('data-anim-list-stagger', settings.listStagger && isEnabled ? 'enabled' : 'disabled');
    root.setAttribute('data-anim-sidebar', settings.sidebarAnimations && isEnabled ? 'enabled' : 'disabled');
    root.setAttribute('data-anim-modal', settings.modalAnimations && isEnabled ? 'enabled' : 'disabled');
}

// ============================================
// HOOK
// ============================================

export function useAnimationSettings() {
    const [settings, setSettings] = useState<AnimationSettings>(defaultAnimationSettings);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount FIRST, then check system preference
    useEffect(() => {
        if (typeof window === 'undefined') return;

        let loadedSettings = { ...defaultAnimationSettings };
        let hasUserSettings = false;

        // Step 1: Load saved settings from localStorage
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                loadedSettings = { ...defaultAnimationSettings, ...parsed };
                hasUserSettings = true;
            }
        } catch (e) {
            console.error('Failed to load animation settings:', e);
        }

        // Step 2: Only check system preference if user hasn't saved any settings
        // AND only if reduceMotion hasn't been explicitly set
        if (!hasUserSettings) {
            const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            if (mediaQuery.matches) {
                loadedSettings.reduceMotion = true;
            }
        }

        setSettings(loadedSettings);
        setIsLoaded(true);

        // Apply immediately
        applyAnimationVariables(loadedSettings);
    }, []);

    // Listen for system preference changes (only affects if user enables "respect system preference")
    useEffect(() => {
        if (typeof window === 'undefined' || !isLoaded) return;

        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

        const handleChange = (e: MediaQueryListEvent) => {
            // Only update if the user has opted to respect system preference
            // This is informational - the actual reduceMotion setting is controlled by the toggle
            console.log('System prefers-reduced-motion changed:', e.matches);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [isLoaded]);

    // Apply CSS variables when settings change
    useEffect(() => {
        if (!isLoaded) return;
        applyAnimationVariables(settings);
    }, [settings, isLoaded]);

    // Save to localStorage when settings change
    useEffect(() => {
        if (!isLoaded) return;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('Failed to save animation settings:', e);
        }
    }, [settings, isLoaded]);

    // Update a single setting
    const updateSetting = useCallback(<K extends keyof AnimationSettings>(
        key: K,
        value: AnimationSettings[K]
    ) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    }, []);

    // Update multiple settings at once
    const updateSettings = useCallback((updates: Partial<AnimationSettings>) => {
        setSettings(prev => ({ ...prev, ...updates }));
    }, []);

    // Reset to defaults
    const resetSettings = useCallback(() => {
        setSettings(defaultAnimationSettings);
    }, []);

    // Toggle all animations
    const toggleAllAnimations = useCallback((enabled: boolean) => {
        setSettings(prev => ({
            ...prev,
            enableAnimations: enabled,
            pageTransitions: enabled,
            microInteractions: enabled,
            hoverEffects: enabled,
            loadingAnimations: enabled,
            listStagger: enabled,
            sidebarAnimations: enabled,
            modalAnimations: enabled,
        }));
    }, []);

    // Computed values for convenience
    const animationsEnabled = useMemo(() => 
        settings.enableAnimations && !settings.reduceMotion,
        [settings.enableAnimations, settings.reduceMotion]
    );

    return {
        settings,
        isLoaded,
        animationsEnabled,
        updateSetting,
        updateSettings,
        resetSettings,
        toggleAllAnimations,
    };
}

export default useAnimationSettings;
