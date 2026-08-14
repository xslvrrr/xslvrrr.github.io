"use client"

import * as React from "react"
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { IconPlus, IconX } from "@tabler/icons-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SimpleTooltip } from "@/components/SimpleTooltip"
import styles from "@/styles/Dashboard.module.css"

export interface NotificationSidebarItem {
    id: string
    label: string
    icon: React.ReactNode
    count: number
}

interface NotificationsSidebarProps {
    items: NotificationSidebarItem[]
    /** Entries that exist but are not currently in the sidebar, offered by the add button. */
    hiddenItems: NotificationSidebarItem[]
    selectedId: string
    onSelect: (id: string) => void
    isEditing: boolean
    onReorder: (orderedIds: string[]) => void
    onRemove: (id: string) => void
    onAdd: (id: string) => void
}

function SidebarItem({
    item,
    isSelected,
    isEditing,
    onSelect,
    onRemove,
}: {
    item: NotificationSidebarItem
    isSelected: boolean
    isEditing: boolean
    onSelect: () => void
    onRemove: () => void
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id, disabled: !isEditing })

    const button = (
        <div
            ref={setNodeRef}
            className={styles.categoryItemSlot}
            style={{
                transform: CSS.Transform.toString(transform),
                transition: isDragging ? 'none' : transition,
                zIndex: isDragging ? 30 : undefined,
            }}
        >
            <button
                type="button"
                aria-label={item.label}
                className={`${styles.categoryItem} ${isSelected ? styles.active : ''}`}
                data-editing={isEditing ? 'true' : undefined}
                data-dragging={isDragging ? 'true' : undefined}
                {...(isEditing ? attributes : {})}
                {...(isEditing ? listeners : {})}
                onClick={() => { if (!isEditing) onSelect() }}
            >
                <div className={styles.categoryIcon}>{item.icon}</div>
                {!isEditing && item.count > 0 && (
                    <span className={styles.categoryCount}>{item.count}</span>
                )}
            </button>
            {isEditing && (
                <button
                    type="button"
                    className={styles.categoryRemove}
                    aria-label={`Remove ${item.label} from the sidebar`}
                    // Pointer events are stopped so grabbing the X never starts a drag.
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation()
                        onRemove()
                    }}
                >
                    <IconX size={11} stroke={2.5} />
                </button>
            )}
        </div>
    )

    // The tooltip wraps a drag target during editing, where a hover card only gets in the way.
    return isEditing ? button : (
        <SimpleTooltip text={item.label} position="right">{button}</SimpleTooltip>
    )
}

export function NotificationsSidebar({
    items,
    hiddenItems,
    selectedId,
    onSelect,
    isEditing,
    onReorder,
    onRemove,
    onAdd,
}: NotificationsSidebarProps) {
    const [addOpen, setAddOpen] = React.useState(false)
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const itemIds = React.useMemo(() => items.map((item) => item.id), [items])

    // Closing the picker once it empties avoids leaving an empty popover on screen.
    React.useEffect(() => {
        if (hiddenItems.length === 0) setAddOpen(false)
    }, [hiddenItems.length])

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const from = itemIds.indexOf(String(active.id))
        const to = itemIds.indexOf(String(over.id))
        if (from < 0 || to < 0) return
        onReorder(arrayMove(itemIds, from, to))
    }

    return (
        <div className={styles.notificationsSidebar} data-editing={isEditing ? 'true' : undefined}>
            <div className={styles.sidebarContent}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                        <div className={styles.categoryList}>
                            {items.map((item) => (
                                <SidebarItem
                                    key={item.id}
                                    item={item}
                                    isSelected={selectedId === item.id}
                                    isEditing={isEditing}
                                    onSelect={() => onSelect(item.id)}
                                    onRemove={() => onRemove(item.id)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {isEditing && (
                    <>
                        <div className={styles.sidebarAddSeparator} role="separator" />
                        <Popover open={addOpen} onOpenChange={setAddOpen}>
                            <PopoverTrigger
                                render={
                                    <button
                                        type="button"
                                        className={styles.sidebarAddButton}
                                        aria-label="Add an entry to the sidebar"
                                        disabled={hiddenItems.length === 0}
                                    />
                                }
                            >
                                <IconPlus size={18} stroke={1.5} />
                            </PopoverTrigger>
                            <PopoverContent side="right" align="end" className="w-56 p-1">
                                {hiddenItems.length === 0 ? (
                                    <p className="px-2 py-3 text-xs text-[var(--text-tertiary)]">
                                        Everything is already in the sidebar.
                                    </p>
                                ) : hiddenItems.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={styles.sidebarAddOption}
                                        onClick={() => {
                                            onAdd(item.id)
                                            setAddOpen(false)
                                        }}
                                    >
                                        <span className={styles.sidebarAddOptionIcon}>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </button>
                                ))}
                            </PopoverContent>
                        </Popover>
                    </>
                )}
            </div>

            <div className={styles.sidebarFooter} />
        </div>
    )
}
