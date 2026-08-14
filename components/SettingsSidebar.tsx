"use client"

import * as React from "react"
import {
    IconArrowLeft,
    IconChevronDown,
    IconSearch,
} from "@tabler/icons-react"
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "./ui/input-group"
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
import {
    getSettingsSectionsForSidebar,
    type SettingsSectionId,
} from "./dashboard/navigation/dashboardRegistry"
import {
    groupSettingsSearchResults,
    searchSettings,
    type SettingsSearchResult,
} from "./dashboard/navigation/settingsSearchIndex"
import { requestSettingsFocus } from "@/lib/settings-focus"

interface SettingsSidebarProps {
    currentSection: SettingsSectionId
    onSectionChange: (section: SettingsSectionId) => void
    onBackToApp: () => void
    isAdministrator?: boolean
}

export function SettingsSidebar({
    currentSection,
    onSectionChange,
    onBackToApp,
    isAdministrator = false,
}: SettingsSidebarProps) {
    const [collapsedCategories, setCollapsedCategories] = React.useState<string[]>([])
    const [searchQuery, setSearchQuery] = React.useState("")
    const visibleSections = React.useMemo(
        () => getSettingsSectionsForSidebar(isAdministrator),
        [isAdministrator]
    )
    const searchResults = React.useMemo(
        () => searchSettings(searchQuery, isAdministrator),
        [isAdministrator, searchQuery]
    )
    const searchGroups = React.useMemo(
        () => groupSettingsSearchResults(searchResults),
        [searchResults]
    )
    const isSearching = searchQuery.trim().length > 0

    const toggleCategory = React.useCallback((category: string) => {
        setCollapsedCategories((prev) =>
            prev.includes(category)
                ? prev.filter((entry) => entry !== category)
                : [...prev, category]
        )
    }, [])

    /**
     * Navigating to the owning page is only half of a search hit: the control itself has to
     * be scrolled to, and revealed first when it sits inside a dialog, collapsible, or
     * accordion. lib/settings-focus resolves that against the rendered page.
     */
    const openResult = React.useCallback((result: SettingsSearchResult) => {
        onSectionChange(result.section)
        if (result.anchor) {
            requestSettingsFocus({
                anchor: result.anchor,
                opener: result.opener,
                fallbackAnchor: result.fallbackAnchor,
            })
        }
    }, [onSectionChange])

    return (
        <Sidebar
            collapsible="icon"
            variant="inset"
            data-desktop-window-controls-offset="header"
        >
            <SidebarHeader>
                {/* Back to App button */}
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            data-tour-id="settings-back-to-app"
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
                {/* Same InputGroup shape as the theme explorer and every other search on the
                    site, so the addon icon and focus ring behave identically here. The wrapper
                    adds no horizontal padding of its own: the header already pads, and any
                    extra inset makes the field narrower than the menu buttons under it. */}
                <div className="pb-1 group-data-[collapsible=icon]:hidden">
                    <InputGroup className="h-8">
                        <InputGroupAddon>
                            <IconSearch aria-hidden="true" />
                        </InputGroupAddon>
                        <InputGroupInput
                            aria-label="Search settings"
                            placeholder="Search settings"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </InputGroup>
                </div>
            </SidebarHeader>

            <SidebarContent>
                {isSearching ? (
                    searchGroups.length === 0 ? (
                        <SidebarGroup>
                            <SidebarGroupLabel>
                                <span>No matches</span>
                            </SidebarGroupLabel>
                        </SidebarGroup>
                    ) : searchGroups.map((group) => (
                        <SidebarGroup key={group.section}>
                            <SidebarGroupLabel>
                                <span>{group.sectionLabel}</span>
                            </SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {group.results.map((result) => (
                                        <SidebarMenuItem key={result.id}>
                                            <SidebarMenuButton
                                                onClick={() => openResult(result)}
                                                tooltip={result.heading
                                                    ? `${result.label} — ${result.heading}`
                                                    : result.label}
                                            >
                                                <span className="truncate">{result.label}</span>
                                                {result.heading ? (
                                                    <span className="ml-auto shrink-0 text-[11px] text-[var(--text-tertiary)]">
                                                        {result.heading}
                                                    </span>
                                                ) : null}
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    ))
                ) : visibleSections.map((section) => (
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
                                            data-tour-id={`settings-nav-${item.id}`}
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
