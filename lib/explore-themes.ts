import { z } from 'zod'

import { logger } from './logger'
import { supabaseAdmin } from './supabase'
import { THEME_COLOR_ORDER, THEME_NAME_MAX_LENGTH, cssColorValueSchema } from './theme-share'
import type { ExploreTheme } from './theme-catalog'

// Same colour-value guard as share codes: an uploaded theme is rendered into other users' inline
// styles, so no fetching or escaping CSS construct may reach the table.
const colorsSchema = z.object(
    Object.fromEntries(
        THEME_COLOR_ORDER.map((key) => [key, cssColorValueSchema])
    ) as Record<(typeof THEME_COLOR_ORDER)[number], typeof cssColorValueSchema>
)

export const explorePublishSchema = z.object({
    name: z.string().trim().min(1).max(THEME_NAME_MAX_LENGTH),
    isDark: z.boolean(),
    isAdvanced: z.boolean().default(false),
    authorName: z.string().trim().max(60).optional(),
    colors: colorsSchema,
}).strict()

export type ExplorePublishInput = z.infer<typeof explorePublishSchema>

interface ExploreThemeRow {
    id: string
    name: string
    is_dark: boolean
    is_advanced: boolean
    colors: Record<string, string>
    author_name: string | null
}

function toExploreTheme(row: ExploreThemeRow): ExploreTheme {
    const accent = row.colors?.accent || ''
    return {
        id: `community-${row.id}`,
        name: row.name,
        isDark: row.is_dark,
        isAdvanced: row.is_advanced,
        category: accent.includes('gradient') ? 'gradient' : 'solid',
        colors: row.colors as unknown as ExploreTheme['colors'],
        authorName: row.author_name || undefined,
        isCommunity: true,
    }
}

/**
 * Explore themes are curated content edited only by administrators, so every write is recorded
 * in the same audit log as the rest of the administrator surface.
 */
async function recordExploreAudit(
    actorUserId: string,
    action: 'explore_theme.published' | 'explore_theme.removed',
    metadata: Record<string, unknown>
): Promise<void> {
    const { error } = await supabaseAdmin
        .from('admin_audit_log')
        .insert({
            actor_user_id: actorUserId,
            action,
            metadata,
        })

    if (error) {
        logger.error('Explore theme audit write failed', error)
    }
}

export async function listExploreThemes(limit = 100): Promise<ExploreTheme[]> {
    const { data, error } = await supabaseAdmin
        .from('explore_themes')
        .select('id, name, is_dark, is_advanced, colors, author_name')
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(limit, 200)))

    if (error) throw error
    return ((data as ExploreThemeRow[] | null) || []).map(toExploreTheme)
}

export async function publishExploreTheme(
    publishedBy: string,
    input: ExplorePublishInput
): Promise<ExploreTheme> {
    const { data, error } = await supabaseAdmin
        .from('explore_themes')
        .upsert({
            name: input.name,
            is_dark: input.isDark,
            is_advanced: input.isAdvanced,
            colors: input.colors,
            author_name: input.authorName ?? null,
            published_by: publishedBy,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'name' })
        .select('id, name, is_dark, is_advanced, colors, author_name')
        .single()

    if (error) throw error

    const theme = toExploreTheme(data as ExploreThemeRow)
    await recordExploreAudit(publishedBy, 'explore_theme.published', {
        themeId: (data as ExploreThemeRow).id,
        name: theme.name,
    })
    return theme
}

export async function deleteExploreTheme(actorUserId: string, id: string): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from('explore_themes')
        .delete()
        .eq('id', id)
        .select('name')
        .maybeSingle()

    if (error) throw error

    await recordExploreAudit(actorUserId, 'explore_theme.removed', {
        themeId: id,
        name: (data as { name: string } | null)?.name ?? null,
    })
}
