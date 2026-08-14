import { deriveFullColors, type ThemeColors } from './theme'

/**
 * Curated themes shown in Explore. Each entry is stored as a seed (background + accent + a couple
 * of derivation knobs) and expanded into a full palette with the same routine the theme builder
 * uses, so catalog themes stay in step with any change to colour derivation.
 */
export type ExploreThemeCategory = 'solid' | 'gradient'

export interface ExploreThemeSeed {
    id: string
    name: string
    isDark: boolean
    background: string
    accent: string
    contrast?: number
    uiTint?: number
}

export interface ExploreTheme {
    id: string
    name: string
    isDark: boolean
    isAdvanced: boolean
    category: ExploreThemeCategory
    colors: ThemeColors
    authorName?: string
    isCommunity: boolean
}

function gradient(from: string, to: string, angle = 135): string {
    return `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`
}

const SOLID_SEEDS: ExploreThemeSeed[] = [
    { id: 'catalog-midnight-indigo', name: 'Midnight Indigo', isDark: true, background: '#09090B', accent: '#4338CA', contrast: 34 },
    { id: 'catalog-obsidian', name: 'Obsidian', isDark: true, background: '#0A0A0A', accent: '#9CA3AF', contrast: 28 },
    { id: 'catalog-tokyo-night', name: 'Tokyo Night', isDark: true, background: '#1A1B26', accent: '#7AA2F7', contrast: 36, uiTint: 18 },
    { id: 'catalog-dracula', name: 'Dracula', isDark: true, background: '#282A36', accent: '#BD93F9', contrast: 38, uiTint: 22 },
    { id: 'catalog-nord', name: 'Nord', isDark: true, background: '#2E3440', accent: '#88C0D0', contrast: 34, uiTint: 26 },
    { id: 'catalog-gruvbox', name: 'Gruvbox', isDark: true, background: '#282828', accent: '#FE8019', contrast: 36, uiTint: 16 },
    { id: 'catalog-mocha', name: 'Mocha', isDark: true, background: '#1E1E2E', accent: '#CBA6F7', contrast: 36, uiTint: 20 },
    { id: 'catalog-rose-pine', name: 'Rosé Pine', isDark: true, background: '#191724', accent: '#EBBCBA', contrast: 34, uiTint: 24 },
    { id: 'catalog-everforest', name: 'Everforest', isDark: true, background: '#2B3339', accent: '#A7C080', contrast: 34, uiTint: 22 },
    { id: 'catalog-solarized-dark', name: 'Solarized Dark', isDark: true, background: '#002B36', accent: '#268BD2', contrast: 36, uiTint: 30 },
    { id: 'catalog-monokai', name: 'Monokai', isDark: true, background: '#272822', accent: '#A6E22E', contrast: 38, uiTint: 14 },
    { id: 'catalog-cobalt', name: 'Cobalt', isDark: true, background: '#0B2942', accent: '#38BDF8', contrast: 38, uiTint: 28 },
    { id: 'catalog-crimson-noir', name: 'Crimson Noir', isDark: true, background: '#120A0C', accent: '#F43F5E', contrast: 36, uiTint: 12 },
    { id: 'catalog-deep-sea', name: 'Deep Sea', isDark: true, background: '#04141A', accent: '#2DD4BF', contrast: 34, uiTint: 20 },
    { id: 'catalog-matcha', name: 'Matcha', isDark: true, background: '#0F1611', accent: '#4ADE80', contrast: 32, uiTint: 16 },
    { id: 'catalog-ember', name: 'Ember', isDark: true, background: '#14100D', accent: '#F97316', contrast: 34, uiTint: 14 },
    { id: 'catalog-catppuccin-frappe', name: 'Frappé', isDark: true, background: '#303446', accent: '#8CAAEE', contrast: 36, uiTint: 22 },
    { id: 'catalog-catppuccin-macchiato', name: 'Macchiato', isDark: true, background: '#24273A', accent: '#8AADF4', contrast: 36, uiTint: 22 },
    { id: 'catalog-one-dark', name: 'One Dark', isDark: true, background: '#282C34', accent: '#61AFEF', contrast: 36, uiTint: 18 },
    { id: 'catalog-night-owl', name: 'Night Owl', isDark: true, background: '#011627', accent: '#82AAFF', contrast: 38, uiTint: 26 },
    { id: 'catalog-palenight', name: 'Palenight', isDark: true, background: '#292D3E', accent: '#C792EA', contrast: 36, uiTint: 22 },
    { id: 'catalog-ayu-mirage', name: 'Ayu Mirage', isDark: true, background: '#1F2430', accent: '#FFCC66', contrast: 36, uiTint: 20 },
    { id: 'catalog-ayu-dark', name: 'Ayu Dark', isDark: true, background: '#0B0E14', accent: '#E6B450', contrast: 36, uiTint: 16 },
    { id: 'catalog-synthwave', name: 'Synthwave', isDark: true, background: '#241B2F', accent: '#FF7EDB', contrast: 40, uiTint: 24 },
    { id: 'catalog-horizon', name: 'Horizon', isDark: true, background: '#1C1E26', accent: '#E95678', contrast: 36, uiTint: 18 },
    { id: 'catalog-kanagawa', name: 'Kanagawa', isDark: true, background: '#1F1F28', accent: '#7E9CD8', contrast: 36, uiTint: 20 },
    { id: 'catalog-oxocarbon', name: 'Oxocarbon', isDark: true, background: '#161616', accent: '#33B1FF', contrast: 36, uiTint: 10 },
    { id: 'catalog-material-ocean', name: 'Material Ocean', isDark: true, background: '#0F111A', accent: '#80CBC4', contrast: 36, uiTint: 24 },
    { id: 'catalog-github-dark', name: 'GitHub Dark', isDark: true, background: '#0D1117', accent: '#58A6FF', contrast: 34, uiTint: 18 },
    { id: 'catalog-vitesse-dark', name: 'Vitesse Dark', isDark: true, background: '#121212', accent: '#4D9375', contrast: 32, uiTint: 10 },
    { id: 'catalog-nightfox', name: 'Nightfox', isDark: true, background: '#192330', accent: '#719CD6', contrast: 36, uiTint: 24 },
    { id: 'catalog-moonlight', name: 'Moonlight', isDark: true, background: '#212337', accent: '#82AAFF', contrast: 36, uiTint: 24 },
    { id: 'catalog-poimandres', name: 'Poimandres', isDark: true, background: '#1B1E28', accent: '#5DE4C7', contrast: 36, uiTint: 20 },
    { id: 'catalog-arc-reactor', name: 'Arc Reactor', isDark: true, background: '#1B1D2A', accent: '#00E8C6', contrast: 38, uiTint: 20 },
    { id: 'catalog-slate-grey', name: 'Slate Grey', isDark: true, background: '#101014', accent: '#94A3B8', contrast: 32, uiTint: 12 },
    { id: 'catalog-carbon', name: 'Carbon', isDark: true, background: '#131313', accent: '#F97583', contrast: 34, uiTint: 10 },
    { id: 'catalog-espresso', name: 'Espresso', isDark: true, background: '#1C1410', accent: '#C89F73', contrast: 34, uiTint: 18 },
    { id: 'catalog-wine', name: 'Wine', isDark: true, background: '#170A12', accent: '#C2407A', contrast: 36, uiTint: 16 },
    { id: 'catalog-blackcurrant', name: 'Blackcurrant', isDark: true, background: '#120C1A', accent: '#A78BFA', contrast: 36, uiTint: 18 },
    { id: 'catalog-abyss', name: 'Abyss', isDark: true, background: '#050B14', accent: '#3B82F6', contrast: 38, uiTint: 22 },
    { id: 'catalog-forest-night', name: 'Forest Night', isDark: true, background: '#10160F', accent: '#6EE7B7', contrast: 34, uiTint: 18 },
    { id: 'catalog-cyan-terminal', name: 'Cyan Terminal', isDark: true, background: '#001014', accent: '#22D3EE', contrast: 38, uiTint: 26 },
    { id: 'catalog-amber-glow', name: 'Amber Glow', isDark: true, background: '#14100A', accent: '#FBBF24', contrast: 34, uiTint: 16 },
    { id: 'catalog-rust', name: 'Rust', isDark: true, background: '#16100D', accent: '#EA580C', contrast: 34, uiTint: 16 },
    { id: 'catalog-plum-noir', name: 'Plum Noir', isDark: true, background: '#150E18', accent: '#D946EF', contrast: 36, uiTint: 20 },
    { id: 'catalog-steel-blue', name: 'Steel Blue', isDark: true, background: '#0D1219', accent: '#60A5FA', contrast: 34, uiTint: 20 },
    { id: 'catalog-sakura-night', name: 'Sakura Night', isDark: true, background: '#17101A', accent: '#F9A8D4', contrast: 34, uiTint: 20 },
    { id: 'catalog-olive-drab', name: 'Olive Drab', isDark: true, background: '#14160E', accent: '#A3E635', contrast: 34, uiTint: 16 },
    { id: 'catalog-ultraviolet', name: 'Ultraviolet', isDark: true, background: '#0B0716', accent: '#8B5CF6', contrast: 38, uiTint: 22 },
    { id: 'catalog-ice', name: 'Ice', isDark: true, background: '#0A1016', accent: '#7DD3FC', contrast: 34, uiTint: 22 },
    { id: 'catalog-copper', name: 'Copper', isDark: true, background: '#150F0C', accent: '#D98E5B', contrast: 34, uiTint: 16 },
    { id: 'catalog-teal-slate', name: 'Teal Slate', isDark: true, background: '#0A1414', accent: '#14B8A6', contrast: 34, uiTint: 22 },
    { id: 'catalog-royal', name: 'Royal', isDark: true, background: '#0B0D1F', accent: '#6366F1', contrast: 38, uiTint: 24 },
    { id: 'catalog-graphite-lime', name: 'Graphite Lime', isDark: true, background: '#101210', accent: '#84CC16', contrast: 34, uiTint: 12 },
    { id: 'catalog-void-pink', name: 'Void Pink', isDark: true, background: '#0E0A10', accent: '#FB7185', contrast: 36, uiTint: 16 },
    { id: 'catalog-midnight-sun', name: 'Midnight Sun', isDark: true, background: '#0C1116', accent: '#FDE047', contrast: 36, uiTint: 20 },
    { id: 'catalog-paper-white', name: 'Paper White', isDark: false, background: '#FFFFFF', accent: '#111827', contrast: 26 },
    { id: 'catalog-nordic-light', name: 'Nordic Light', isDark: false, background: '#ECEFF4', accent: '#5E81AC', contrast: 30, uiTint: 18 },
    { id: 'catalog-solarized-light', name: 'Solarized Light', isDark: false, background: '#FDF6E3', accent: '#B58900', contrast: 32, uiTint: 22 },
    { id: 'catalog-latte', name: 'Latte', isDark: false, background: '#EFF1F5', accent: '#8839EF', contrast: 30, uiTint: 16 },
    { id: 'catalog-rose-dawn', name: 'Rosé Dawn', isDark: false, background: '#FAF4ED', accent: '#B4637A', contrast: 30, uiTint: 20 },
    { id: 'catalog-sandstone', name: 'Sandstone', isDark: false, background: '#F5F0E8', accent: '#A16207', contrast: 30, uiTint: 18 },
    { id: 'catalog-mint-paper', name: 'Mint Paper', isDark: false, background: '#F1F8F4', accent: '#0F766E', contrast: 30, uiTint: 16 },
    { id: 'catalog-lavender-light', name: 'Lavender Light', isDark: false, background: '#F4F2FB', accent: '#6D28D9', contrast: 30, uiTint: 20 },
    { id: 'catalog-github-light', name: 'GitHub Light', isDark: false, background: '#FFFFFF', accent: '#0969DA', contrast: 28, uiTint: 12 },
    { id: 'catalog-vitesse-light', name: 'Vitesse Light', isDark: false, background: '#FAFAFA', accent: '#2E8F82', contrast: 28, uiTint: 12 },
    { id: 'catalog-one-light', name: 'One Light', isDark: false, background: '#FAFAFA', accent: '#4078F2', contrast: 30, uiTint: 14 },
    { id: 'catalog-ayu-light', name: 'Ayu Light', isDark: false, background: '#FCFCFC', accent: '#FF9940', contrast: 30, uiTint: 14 },
    { id: 'catalog-porcelain', name: 'Porcelain', isDark: false, background: '#F7F7F8', accent: '#334155', contrast: 28, uiTint: 10 },
    { id: 'catalog-linen', name: 'Linen', isDark: false, background: '#FBF7F0', accent: '#9A6E3A', contrast: 30, uiTint: 20 },
    { id: 'catalog-cotton', name: 'Cotton', isDark: false, background: '#F9FAFB', accent: '#2563EB', contrast: 30, uiTint: 14 },
    { id: 'catalog-seafoam', name: 'Seafoam', isDark: false, background: '#F0FAF8', accent: '#0D9488', contrast: 30, uiTint: 18 },
    { id: 'catalog-blossom', name: 'Blossom', isDark: false, background: '#FFF5F8', accent: '#DB2777', contrast: 30, uiTint: 20 },
    { id: 'catalog-sky-paper', name: 'Sky Paper', isDark: false, background: '#F2F8FF', accent: '#0284C7', contrast: 30, uiTint: 18 },
    { id: 'catalog-butter', name: 'Butter', isDark: false, background: '#FFFBEB', accent: '#D97706', contrast: 30, uiTint: 20 },
    { id: 'catalog-sage', name: 'Sage', isDark: false, background: '#F3F7F1', accent: '#4D7C0F', contrast: 30, uiTint: 18 },
    { id: 'catalog-periwinkle', name: 'Periwinkle', isDark: false, background: '#F4F6FF', accent: '#4F46E5', contrast: 30, uiTint: 20 },
    { id: 'catalog-clay', name: 'Clay', isDark: false, background: '#F6F1EE', accent: '#B45309', contrast: 30, uiTint: 18 },
    { id: 'catalog-ash-light', name: 'Ash Light', isDark: false, background: '#F1F2F4', accent: '#475569', contrast: 28, uiTint: 12 },
    { id: 'catalog-grape-light', name: 'Grape Light', isDark: false, background: '#F8F4FD', accent: '#9333EA', contrast: 30, uiTint: 20 },
    { id: 'catalog-coral-light', name: 'Coral Light', isDark: false, background: '#FFF6F3', accent: '#EA580C', contrast: 30, uiTint: 18 },
    { id: 'catalog-aqua-light', name: 'Aqua Light', isDark: false, background: '#EFFAFC', accent: '#0891B2', contrast: 30, uiTint: 18 },
    { id: 'catalog-ruby-light', name: 'Ruby Light', isDark: false, background: '#FFF4F5', accent: '#E11D48', contrast: 30, uiTint: 20 },
]

const GRADIENT_SEEDS: ExploreThemeSeed[] = [
    { id: 'catalog-aurora', name: 'Aurora', isDark: true, background: '#0A0F1C', accent: gradient('#667EEA', '#764BA2'), contrast: 36, uiTint: 18 },
    { id: 'catalog-sunset', name: 'Sunset', isDark: true, background: '#150E12', accent: gradient('#F093FB', '#F5576C'), contrast: 36, uiTint: 14 },
    { id: 'catalog-ocean-drift', name: 'Ocean Drift', isDark: true, background: '#061420', accent: gradient('#4FACFE', '#00F2FE'), contrast: 36, uiTint: 24 },
    { id: 'catalog-emerald-tide', name: 'Emerald Tide', isDark: true, background: '#06140F', accent: gradient('#43E97B', '#38F9D7'), contrast: 34, uiTint: 18 },
    { id: 'catalog-neon-grape', name: 'Neon Grape', isDark: true, background: '#100B1B', accent: gradient('#A855F7', '#EC4899'), contrast: 38, uiTint: 20 },
    { id: 'catalog-cyberpunk', name: 'Cyberpunk', isDark: true, background: '#0B0B14', accent: gradient('#00F5D4', '#F15BB5'), contrast: 40, uiTint: 16 },
    { id: 'catalog-nebula', name: 'Nebula', isDark: true, background: '#0C0A18', accent: gradient('#7F5AF0', '#2CB67D'), contrast: 36, uiTint: 20 },
    { id: 'catalog-firewatch', name: 'Firewatch', isDark: true, background: '#1A0F0A', accent: gradient('#FF8008', '#FFC837'), contrast: 36, uiTint: 14 },
    { id: 'catalog-arctic-glow', name: 'Arctic Glow', isDark: true, background: '#0A1418', accent: gradient('#89F7FE', '#66A6FF'), contrast: 34, uiTint: 24 },
    { id: 'catalog-vaporwave', name: 'Vaporwave', isDark: true, background: '#0D0A1A', accent: gradient('#FF61D2', '#FE9090'), contrast: 38, uiTint: 20 },
    { id: 'catalog-solar-flare', name: 'Solar Flare', isDark: true, background: '#140B06', accent: gradient('#FF512F', '#F09819'), contrast: 36, uiTint: 16 },
    { id: 'catalog-electric-violet', name: 'Electric Violet', isDark: true, background: '#0C0918', accent: gradient('#4776E6', '#8E54E9'), contrast: 38, uiTint: 22 },
    { id: 'catalog-deep-space', name: 'Deep Space', isDark: true, background: '#05060F', accent: gradient('#000046', '#1CB5E0'), contrast: 38, uiTint: 24 },
    { id: 'catalog-kyoto', name: 'Kyoto', isDark: true, background: '#16100F', accent: gradient('#F857A6', '#FF5858'), contrast: 36, uiTint: 16 },
    { id: 'catalog-northern-lights', name: 'Northern Lights', isDark: true, background: '#06121A', accent: gradient('#00C9FF', '#92FE9D'), contrast: 36, uiTint: 24 },
    { id: 'catalog-magma', name: 'Magma', isDark: true, background: '#150A08', accent: gradient('#FF0844', '#FFB199'), contrast: 36, uiTint: 14 },
    { id: 'catalog-bioluminescence', name: 'Bioluminescence', isDark: true, background: '#04121A', accent: gradient('#00DBDE', '#FC00FF'), contrast: 38, uiTint: 24 },
    { id: 'catalog-cosmic-fusion', name: 'Cosmic Fusion', isDark: true, background: '#0B0714', accent: gradient('#FF00CC', '#333399'), contrast: 38, uiTint: 20 },
    { id: 'catalog-toxic', name: 'Toxic', isDark: true, background: '#0A1206', accent: gradient('#A8FF78', '#78FFD6'), contrast: 36, uiTint: 16 },
    { id: 'catalog-sunburst', name: 'Sunburst', isDark: true, background: '#14110A', accent: gradient('#F7971E', '#FFD200'), contrast: 36, uiTint: 16 },
    { id: 'catalog-berry-smoothie', name: 'Berry Smoothie', isDark: true, background: '#12081A', accent: gradient('#DA22FF', '#9733EE'), contrast: 38, uiTint: 20 },
    { id: 'catalog-frost', name: 'Frost', isDark: true, background: '#0A1016', accent: gradient('#E0EAFC', '#CFDEF3'), contrast: 34, uiTint: 20 },
    { id: 'catalog-neon-sea', name: 'Neon Sea', isDark: true, background: '#04101A', accent: gradient('#12C2E9', '#C471ED'), contrast: 38, uiTint: 24 },
    { id: 'catalog-retro-wave', name: 'Retro Wave', isDark: true, background: '#100A1C', accent: gradient('#F5D020', '#F53803'), contrast: 38, uiTint: 20 },
    { id: 'catalog-mystic', name: 'Mystic', isDark: true, background: '#0A0F18', accent: gradient('#7028E4', '#E5B2CA'), contrast: 36, uiTint: 22 },
    { id: 'catalog-jade-fire', name: 'Jade Fire', isDark: true, background: '#06120E', accent: gradient('#11998E', '#38EF7D'), contrast: 36, uiTint: 20 },
    { id: 'catalog-crimson-tide', name: 'Crimson Tide', isDark: true, background: '#140A0C', accent: gradient('#EB3349', '#F45C43'), contrast: 36, uiTint: 16 },
    { id: 'catalog-purple-rain', name: 'Purple Rain', isDark: true, background: '#0C0A16', accent: gradient('#8E2DE2', '#4A00E0'), contrast: 38, uiTint: 22 },
    { id: 'catalog-aquamarine', name: 'Aquamarine', isDark: true, background: '#04141A', accent: gradient('#1A2980', '#26D0CE'), contrast: 36, uiTint: 24 },
    { id: 'catalog-golden-hour', name: 'Golden Hour', isDark: true, background: '#150F09', accent: gradient('#F2994A', '#F2C94C'), contrast: 36, uiTint: 16 },
    { id: 'catalog-orchid-dusk', name: 'Orchid Dusk', isDark: true, background: '#0A0714', accent: gradient('#654EA3', '#EAAFC8'), contrast: 36, uiTint: 22 },
    { id: 'catalog-iris-bloom', name: 'Iris Bloom', isDark: false, background: '#F6F4FF', accent: gradient('#8B5CF6', '#3B82F6'), contrast: 30, uiTint: 20 },
    { id: 'catalog-peach-fizz', name: 'Peach Fizz', isDark: false, background: '#FFF7F2', accent: gradient('#FF9A8B', '#FF6A88'), contrast: 30, uiTint: 18 },
    { id: 'catalog-citrus', name: 'Citrus', isDark: false, background: '#FFFCF0', accent: gradient('#F6D365', '#FDA085'), contrast: 30, uiTint: 20 },
    { id: 'catalog-mint-lagoon', name: 'Mint Lagoon', isDark: false, background: '#F0FBF7', accent: gradient('#00C9A7', '#2AF598'), contrast: 30, uiTint: 18 },
    { id: 'catalog-blush', name: 'Blush', isDark: false, background: '#FFF5F7', accent: gradient('#FBC2EB', '#A18CD1'), contrast: 30, uiTint: 22 },
    { id: 'catalog-cotton-candy', name: 'Cotton Candy', isDark: false, background: '#FFF7FB', accent: gradient('#A18CD1', '#FBC2EB'), contrast: 30, uiTint: 22 },
    { id: 'catalog-sunny-day', name: 'Sunny Day', isDark: false, background: '#FFFDF2', accent: gradient('#FDC830', '#F37335'), contrast: 30, uiTint: 20 },
    { id: 'catalog-sea-breeze', name: 'Sea Breeze', isDark: false, background: '#F2FBFF', accent: gradient('#43CEA2', '#185A9D'), contrast: 30, uiTint: 20 },
    { id: 'catalog-lilac-mist', name: 'Lilac Mist', isDark: false, background: '#F8F5FF', accent: gradient('#C471F5', '#FA71CD'), contrast: 30, uiTint: 22 },
    { id: 'catalog-coral-reef', name: 'Coral Reef', isDark: false, background: '#FFF6F4', accent: gradient('#FF7E5F', '#FEB47B'), contrast: 30, uiTint: 18 },
    { id: 'catalog-spring', name: 'Spring', isDark: false, background: '#F5FCF2', accent: gradient('#56AB2F', '#A8E063'), contrast: 30, uiTint: 18 },
    { id: 'catalog-bubblegum', name: 'Bubblegum', isDark: false, background: '#FFF5FA', accent: gradient('#FF9A9E', '#FECFEF'), contrast: 30, uiTint: 22 },
    { id: 'catalog-morning-sky', name: 'Morning Sky', isDark: false, background: '#F4F9FF', accent: gradient('#89F7FE', '#66A6FF'), contrast: 30, uiTint: 20 },
]

export function isGradientAccent(accent: string): boolean {
    return accent.includes('gradient')
}

export function buildExploreTheme(seed: ExploreThemeSeed): ExploreTheme {
    const colors = deriveFullColors(
        seed.background,
        seed.accent,
        seed.isDark,
        seed.contrast ?? 32,
        seed.uiTint ?? 0
    )
    const isGradient = isGradientAccent(seed.accent)

    return {
        id: seed.id,
        name: seed.name,
        isDark: seed.isDark,
        isAdvanced: isGradient,
        category: isGradient ? 'gradient' : 'solid',
        colors,
        isCommunity: false,
    }
}

export const CATALOG_EXPLORE_THEMES: ExploreTheme[] = [...SOLID_SEEDS, ...GRADIENT_SEEDS].map(buildExploreTheme)
