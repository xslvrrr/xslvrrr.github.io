"use client"

import * as React from "react"
import {
    IconArrowLeft,
    IconChevronDown,
    IconSettings,
    IconPalette,
    IconBell,
    IconRefresh,
    IconDownload,
    IconSchool,
    IconKeyboard,
    IconSparkles,
} from "@tabler/icons-react"
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarHeader,
    SidebarRail,
} from "./ui/sidebar"

interface SettingsSidebarProps {
    currentSection: string
    onSectionChange: (section: string) => void
    onBackToApp: () => void
    hideClassroom?: boolean
}

const settingsSections = [
    {
        category: "Settings",
        items: [
            { id: "general", label: "General", icon: IconSettings },
            { id: "animations", label: "Animations", icon: IconSparkles },
            { id: "notifications", label: "Notifications", icon: IconBell },
            { id: "shortcuts", label: "Shortcuts", icon: IconKeyboard },
        ]
    },
    {
        category: "Customization",
        items: [
            { id: "theme-builder", label: "Theme Builder", icon: IconPalette },
            { id: "class-colors", label: "Class Colors", icon: IconSchool },
        ]
    },
    {
        category: "Data",
        items: [
            { id: "sync", label: "Sync", icon: IconRefresh },
            { id: "export", label: "Export", icon: IconDownload },
        ]
    }
]

export function SettingsSidebar({ currentSection, onSectionChange, onBackToApp, hideClassroom }: SettingsSidebarProps) {
    const [collapsedCategories, setCollapsedCategories] = React.useState<string[]>([])

    const toggleCategory = React.useCallback((category: string) => {
        setCollapsedCategories((prev) =>
            prev.includes(category)
                ? prev.filter((entry) => entry !== category)
                : [...prev, category]
        )
    }, [])

    const filteredSections = React.useMemo(() => {
        if (!hideClassroom) return settingsSections;

        return settingsSections.map(section => ({
            ...section,
            items: section.items.filter(item => {
                if (item.id === 'class-colors' || item.id === 'sync') return false;
                return true;
            })
        })).filter(section => section.items.length > 0);
    }, [hideClassroom]);

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                {/* Back to App button */}
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            onClick={onBackToApp}
                            tooltip="Back to app"
                            className="settings-back-button"
                            style={{
                                marginBottom: '8px',
                                paddingTop: '12px',
                                paddingBottom: '12px',
                            }}
                        >
                            <IconArrowLeft style={{ color: 'var(--text-tertiary)' }} />
                            <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>Back to app</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {filteredSections.map((section) => (
                    <SidebarGroup key={section.category}>
                        <SidebarGroupLabel
                            data-collapsible
                            data-collapsed={collapsedCategories.includes(section.category)}
                            onClick={() => toggleCategory(section.category)}
                            className="cursor-pointer"
                        >
                            <IconChevronDown className="size-3 shrink-0" />
                            <span>{section.category}</span>
                        </SidebarGroupLabel>
                        <SidebarGroupContent data-collapsed={collapsedCategories.includes(section.category)}>
                            <SidebarMenu>
                                {section.items.map((item) => (
                                    <SidebarMenuItem key={item.id}>
                                        <SidebarMenuButton
                                            isActive={currentSection === item.id}
                                            onClick={() => onSectionChange(item.id)}
                                            tooltip={item.label}
                                        >
                                            <item.icon />
                                            <span>{item.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>

            <SidebarRail />
        </Sidebar>
    )
}
