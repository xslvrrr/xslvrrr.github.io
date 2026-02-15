"use client"

import * as React from 'react';
import { cn } from '../lib/utils';
import {
    IconChevronLeft,
    IconChevronRight,
} from '@tabler/icons-react';
import styles from './ContentTopbar.module.css';

// ============================================
// TYPES
// ============================================

export interface ContentTopbarProps {
    /** Title to display in the center */
    title: string;
    /** Icon to display before the title */
    icon?: React.ReactNode;
    /** Content to render on the left side (page-specific actions) */
    leftContent?: React.ReactNode;
    /** Content to render on the right side (page-specific actions) */
    rightContent?: React.ReactNode;
    /** Whether to show navigation buttons (back/forward/refresh) */
    showNavigation?: boolean;
    /** Callback when back is clicked */
    onBack?: () => void;
    /** Callback when forward is clicked */
    onForward?: () => void;
    /** Whether back button is disabled */
    backDisabled?: boolean;
    /** Whether forward button is disabled */
    forwardDisabled?: boolean;
    /** Additional CSS class */
    className?: string;
}

// ============================================
// NAVIGATION BUTTON COMPONENT
// ============================================

interface NavButtonProps {
    onClick?: () => void;
    disabled?: boolean;
    children: React.ReactNode;
    tooltip?: string;
}

function NavButton({ onClick, disabled, children, tooltip }: NavButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={styles.navButton}
            title={tooltip}
        >
            {children}
        </button>
    );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ContentTopbar({
    title,
    icon,
    leftContent,
    rightContent,
    showNavigation = true,
    onBack,
    onForward,
    backDisabled = true,
    forwardDisabled = true,
    className,
}: ContentTopbarProps) {
    return (
        <div className={cn(styles.topbar, className)}>
            {/* Left Section - Navigation */}
            <div className={styles.leftSection}>
                {showNavigation && (
                    <div className={styles.navButtons}>
                        <NavButton
                            onClick={onBack}
                            disabled={backDisabled}
                            tooltip="Go back"
                        >
                            <IconChevronLeft size={16} />
                        </NavButton>
                        <NavButton
                            onClick={onForward}
                            disabled={forwardDisabled}
                            tooltip="Go forward"
                        >
                            <IconChevronRight size={16} />
                        </NavButton>
                    </div>
                )}
                {leftContent && (
                    <div className={styles.leftContent}>
                        {leftContent}
                    </div>
                )}
            </div>

            {/* Center Section - Title */}
            <div className={styles.centerSection}>
                {icon && <span className={styles.titleIcon}>{icon}</span>}
                <span className={styles.title}>{title}</span>
            </div>

            {/* Right Section - Page Actions */}
            <div className={styles.rightSection}>
                {rightContent}
            </div>
        </div>
    );
}

// ============================================
// ACTION BUTTON FOR RIGHT SECTION
// ============================================

export interface TopbarActionProps {
    onClick?: () => void;
    icon?: React.ReactNode;
    children?: React.ReactNode;
    variant?: 'default' | 'primary' | 'danger' | 'ghost';
    disabled?: boolean;
    className?: string;
}

export function TopbarSeparator({ className }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn(styles.actionSeparator, className)}
        />
    );
}

export function TopbarAction({
    onClick,
    icon,
    children,
    variant = 'default',
    disabled,
    className,
}: TopbarActionProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                styles.actionButton,
                styles[`actionButton--${variant}`],
                className
            )}
        >
            {icon && <span className={styles.actionIcon}>{icon}</span>}
            {children && <span>{children}</span>}
        </button>
    );
}

// ============================================
// TOGGLE GROUP FOR RIGHT SECTION (e.g., Day/Week/Month)
// ============================================

export interface TopbarToggleOption {
    value: string;
    label: string;
}

export interface TopbarToggleGroupProps {
    options: TopbarToggleOption[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

export function TopbarToggleGroup({
    options,
    value,
    onChange,
    className,
}: TopbarToggleGroupProps) {
    const [indicatorStyle, setIndicatorStyle] = React.useState<React.CSSProperties>({});
    const containerRef = React.useRef<HTMLDivElement>(null);
    const buttonRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

    React.useEffect(() => {
        const activeButton = buttonRefs.current.get(value);
        const container = containerRef.current;

        if (activeButton && container) {
            const containerRect = container.getBoundingClientRect();
            const buttonRect = activeButton.getBoundingClientRect();

            setIndicatorStyle({
                width: buttonRect.width,
                transform: `translateX(${buttonRect.left - containerRect.left}px)`,
            });
        }
    }, [value, options]);

    return (
        <div ref={containerRef} className={cn(styles.toggleGroup, className)}>
            <div className={styles.toggleIndicator} style={indicatorStyle} />
            {options.map((option) => (
                <button
                    key={option.value}
                    ref={(el) => {
                        if (el) buttonRefs.current.set(option.value, el);
                    }}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        styles.toggleButton,
                        value === option.value && styles.toggleButtonActive
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export default ContentTopbar;
