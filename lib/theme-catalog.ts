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

type GradientStop = readonly [color: string, position: number]

/**
 * Accents with more than the usual two stops. The stop list is written out in full so a ramp can
 * bunch its colours where it needs to rather than spacing them evenly, and the angle is required
 * so these read as deliberately rotated next to the 135° two-stop entries.
 */
function ramp(angle: number, stops: readonly GradientStop[]): string {
    return `linear-gradient(${angle}deg, ${stops.map(([color, position]) => `${color} ${position}%`).join(', ')})`
}

/** Sweep accents: colour rotates around a point instead of running along an axis. */
function sweep(from: number, stops: readonly GradientStop[]): string {
    return `conic-gradient(from ${from}deg, ${stops.map(([color, position]) => `${color} ${position}%`).join(', ')})`
}

/** Bloom accents: colour radiates outward, so the first stop reads as a light source. */
function bloom(stops: readonly GradientStop[]): string {
    return `radial-gradient(circle, ${stops.map(([color, position]) => `${color} ${position}%`).join(', ')})`
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
    { id: 'catalog-alabaster', name: 'Alabaster', isDark: false, background: '#FCFCFD', accent: '#1F2937', contrast: 28, uiTint: 10 },
    { id: 'catalog-parchment', name: 'Parchment', isDark: false, background: '#FBF6EC', accent: '#8A5A2B', contrast: 30, uiTint: 20 },
    { id: 'catalog-frostlight', name: 'Frostlight', isDark: false, background: '#F4F9FD', accent: '#1D4ED8', contrast: 30, uiTint: 16 },
    { id: 'catalog-eggshell', name: 'Eggshell', isDark: false, background: '#FDFCF7', accent: '#4B5563', contrast: 28, uiTint: 14 },
    { id: 'catalog-cloud', name: 'Cloud', isDark: false, background: '#F5F7FA', accent: '#1E40AF', contrast: 28, uiTint: 14 },
    { id: 'catalog-shell-pink', name: 'Shell Pink', isDark: false, background: '#FFF4F6', accent: '#BE123C', contrast: 30, uiTint: 20 },
    { id: 'catalog-honeydew', name: 'Honeydew', isDark: false, background: '#F2FBF3', accent: '#15803D', contrast: 30, uiTint: 18 },
    { id: 'catalog-oat', name: 'Oat', isDark: false, background: '#F7F3EC', accent: '#7C5E3B', contrast: 30, uiTint: 18 },
    { id: 'catalog-marble', name: 'Marble', isDark: false, background: '#F6F7F9', accent: '#0F172A', contrast: 28, uiTint: 10 },
    { id: 'catalog-tea-green', name: 'Tea Green', isDark: false, background: '#F4F9EF', accent: '#3F6212', contrast: 30, uiTint: 18 },
    { id: 'catalog-powder-blue', name: 'Powder Blue', isDark: false, background: '#EEF6FE', accent: '#0369A1', contrast: 30, uiTint: 18 },
    { id: 'catalog-apricot-cream', name: 'Apricot Cream', isDark: false, background: '#FFF7ED', accent: '#C2410C', contrast: 30, uiTint: 20 },
    { id: 'catalog-orchid-light', name: 'Orchid Light', isDark: false, background: '#FBF4FE', accent: '#7E22CE', contrast: 30, uiTint: 20 },
    { id: 'catalog-glacier', name: 'Glacier', isDark: false, background: '#EFF7FA', accent: '#0E7490', contrast: 30, uiTint: 18 },
    { id: 'catalog-vanilla', name: 'Vanilla', isDark: false, background: '#FFFDF5', accent: '#92400E', contrast: 30, uiTint: 20 },
    { id: 'catalog-dove-grey', name: 'Dove Grey', isDark: false, background: '#F3F4F6', accent: '#374151', contrast: 28, uiTint: 10 },
    { id: 'catalog-lilac-paper', name: 'Lilac Paper', isDark: false, background: '#F7F5FD', accent: '#5B21B6', contrast: 30, uiTint: 20 },
    { id: 'catalog-pistachio', name: 'Pistachio', isDark: false, background: '#F6FAF0', accent: '#365314', contrast: 30, uiTint: 18 },
    { id: 'catalog-almond', name: 'Almond', isDark: false, background: '#FAF5EF', accent: '#8B5E34', contrast: 30, uiTint: 18 },
    { id: 'catalog-sea-salt', name: 'Sea Salt', isDark: false, background: '#F4FAFA', accent: '#115E59', contrast: 30, uiTint: 18 },
    { id: 'catalog-rosewater', name: 'Rosewater', isDark: false, background: '#FFF6F5', accent: '#BE185D', contrast: 30, uiTint: 20 },
    { id: 'catalog-cornsilk', name: 'Cornsilk', isDark: false, background: '#FFFCF0', accent: '#854D0E', contrast: 30, uiTint: 20 },
    { id: 'catalog-morning-dew', name: 'Morning Dew', isDark: false, background: '#F1FAF6', accent: '#047857', contrast: 30, uiTint: 18 },
    { id: 'catalog-quartz', name: 'Quartz', isDark: false, background: '#F7F5F7', accent: '#7C3AED', contrast: 30, uiTint: 16 },
    { id: 'catalog-oyster', name: 'Oyster', isDark: false, background: '#F5F4F1', accent: '#57534E', contrast: 28, uiTint: 12 },
    { id: 'catalog-harbour-light', name: 'Harbour Light', isDark: false, background: '#F0F6FA', accent: '#155E75', contrast: 30, uiTint: 18 },
    { id: 'catalog-mulberry-light', name: 'Mulberry Light', isDark: false, background: '#FDF4FA', accent: '#A21CAF', contrast: 30, uiTint: 20 },
    { id: 'catalog-flax', name: 'Flax', isDark: false, background: '#FDFAEF', accent: '#78716C', contrast: 28, uiTint: 16 },
    { id: 'catalog-slate-paper', name: 'Slate Paper', isDark: false, background: '#F2F4F7', accent: '#1E293B', contrast: 28, uiTint: 12 },
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

    // Experimental dark accents: three or more stops, and rotations well off the 135° default.
    { id: 'catalog-prism-dusk', name: 'Prism Dusk', isDark: true, background: '#0A0913', accent: ramp(205, [['#6366F1', 0], ['#A855F7', 38], ['#EC4899', 70], ['#F97316', 100]]), contrast: 38, uiTint: 20 },
    { id: 'catalog-ion-trail', name: 'Ion Trail', isDark: true, background: '#050D14', accent: sweep(210, [['#22D3EE', 0], ['#3B82F6', 35], ['#8B5CF6', 68], ['#22D3EE', 100]]), contrast: 38, uiTint: 22 },
    { id: 'catalog-spectral', name: 'Spectral', isDark: true, background: '#0B0B0F', accent: ramp(90, [['#F43F5E', 0], ['#FB923C', 26], ['#FDE047', 50], ['#4ADE80', 74], ['#38BDF8', 100]]), contrast: 40, uiTint: 16 },
    { id: 'catalog-oil-slick', name: 'Oil Slick', isDark: true, background: '#08080C', accent: ramp(315, [['#0EA5E9', 0], ['#8B5CF6', 34], ['#EC4899', 66], ['#14B8A6', 100]]), contrast: 38, uiTint: 18 },
    { id: 'catalog-nebula-drift', name: 'Nebula Drift', isDark: true, background: '#090714', accent: bloom([['#F0ABFC', 0], ['#8B5CF6', 45], ['#1E1B4B', 100]]), contrast: 38, uiTint: 22 },
    { id: 'catalog-solar-wind', name: 'Solar Wind', isDark: true, background: '#130D07', accent: ramp(20, [['#FDE047', 0], ['#FB923C', 48], ['#DC2626', 100]]), contrast: 36, uiTint: 16 },
    { id: 'catalog-chromatic-abyss', name: 'Chromatic Abyss', isDark: true, background: '#04070E', accent: ramp(160, [['#0F172A', 0], ['#1D4ED8', 30], ['#06B6D4', 64], ['#A7F3D0', 100]]), contrast: 38, uiTint: 24 },
    { id: 'catalog-plasma', name: 'Plasma', isDark: true, background: '#0C0710', accent: sweep(45, [['#F97316', 0], ['#EC4899', 30], ['#8B5CF6', 60], ['#F97316', 100]]), contrast: 40, uiTint: 18 },
    { id: 'catalog-neon-horizon', name: 'Neon Horizon', isDark: true, background: '#0A0A16', accent: ramp(75, [['#F15BB5', 0], ['#9B5DE5', 52], ['#00BBF9', 100]]), contrast: 40, uiTint: 20 },
    { id: 'catalog-ultra-prism', name: 'Ultra Prism', isDark: true, background: '#060612', accent: ramp(250, [['#312E81', 0], ['#4F46E5', 24], ['#7C3AED', 50], ['#C026D3', 76], ['#F472B6', 100]]), contrast: 38, uiTint: 22 },
    { id: 'catalog-void-bloom', name: 'Void Bloom', isDark: true, background: '#0A0610', accent: bloom([['#FB7185', 0], ['#A21CAF', 52], ['#1E1035', 100]]), contrast: 38, uiTint: 20 },
    { id: 'catalog-ember-circuit', name: 'Ember Circuit', isDark: true, background: '#120A06', accent: ramp(300, [['#7C2D12', 0], ['#EA580C', 44], ['#FACC15', 100]]), contrast: 36, uiTint: 16 },
    { id: 'catalog-glacier-fault', name: 'Glacier Fault', isDark: true, background: '#060F16', accent: ramp(200, [['#E0F2FE', 0], ['#38BDF8', 34], ['#0369A1', 68], ['#082F49', 100]]), contrast: 36, uiTint: 24 },
    { id: 'catalog-signal-static', name: 'Signal Static', isDark: true, background: '#0B0D0B', accent: ramp(45, [['#4ADE80', 0], ['#A3E635', 33], ['#FACC15', 66], ['#22D3EE', 100]]), contrast: 38, uiTint: 14 },
    { id: 'catalog-astral-vein', name: 'Astral Vein', isDark: true, background: '#08061A', accent: ramp(120, [['#2DD4BF', 0], ['#6366F1', 54], ['#C084FC', 100]]), contrast: 38, uiTint: 22 },
    { id: 'catalog-fusion-core', name: 'Fusion Core', isDark: true, background: '#0E0A08', accent: sweep(0, [['#FACC15', 0], ['#F97316', 25], ['#DC2626', 55], ['#FACC15', 100]]), contrast: 38, uiTint: 16 },
    { id: 'catalog-duskfall', name: 'Duskfall', isDark: true, background: '#0B0912', accent: ramp(190, [['#FCA5A5', 0], ['#A855F7', 50], ['#1E3A8A', 100]]), contrast: 36, uiTint: 20 },
    { id: 'catalog-terminal-glow', name: 'Terminal Glow', isDark: true, background: '#050A07', accent: ramp(60, [['#065F46', 0], ['#10B981', 46], ['#A7F3D0', 100]]), contrast: 36, uiTint: 18 },
    { id: 'catalog-deep-current', name: 'Deep Current', isDark: true, background: '#04101A', accent: ramp(260, [['#0C4A6E', 0], ['#0891B2', 32], ['#2DD4BF', 66], ['#CCFBF1', 100]]), contrast: 36, uiTint: 24 },
    { id: 'catalog-ionosphere', name: 'Ionosphere', isDark: true, background: '#060A18', accent: ramp(100, [['#1E3A8A', 0], ['#3B82F6', 30], ['#22D3EE', 62], ['#BBF7D0', 100]]), contrast: 38, uiTint: 24 },
    { id: 'catalog-molten-glass', name: 'Molten Glass', isDark: true, background: '#140C0A', accent: ramp(330, [['#F87171', 0], ['#FB923C', 50], ['#FDE68A', 100]]), contrast: 36, uiTint: 16 },
    { id: 'catalog-starfield', name: 'Starfield', isDark: true, background: '#04050C', accent: bloom([['#E0E7FF', 0], ['#6366F1', 40], ['#0F172A', 100]]), contrast: 38, uiTint: 22 },
    { id: 'catalog-polar-vortex', name: 'Polar Vortex', isDark: true, background: '#061218', accent: ramp(210, [['#F0FDFA', 0], ['#5EEAD4', 30], ['#0EA5E9', 64], ['#4338CA', 100]]), contrast: 38, uiTint: 24 },
    { id: 'catalog-signal-flare', name: 'Signal Flare', isDark: true, background: '#120806', accent: ramp(15, [['#FFEDD5', 0], ['#FB923C', 45], ['#B91C1C', 100]]), contrast: 38, uiTint: 14 },
    { id: 'catalog-quantum', name: 'Quantum', isDark: true, background: '#070610', accent: ramp(275, [['#0EA5E9', 0], ['#6366F1', 25], ['#A855F7', 50], ['#EC4899', 75], ['#FB7185', 100]]), contrast: 40, uiTint: 20 },

    // Light gradient accents, matched to the same spread of stop counts and rotations.
    { id: 'catalog-sorbet', name: 'Sorbet', isDark: false, background: '#FFF8F4', accent: ramp(70, [['#FDE68A', 0], ['#FDA4AF', 52], ['#C084FC', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-watercolour', name: 'Watercolour', isDark: false, background: '#F7FAFF', accent: ramp(205, [['#BFDBFE', 0], ['#818CF8', 40], ['#F0ABFC', 72], ['#FBCFE8', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-macaron', name: 'Macaron', isDark: false, background: '#FFF6FA', accent: ramp(300, [['#F9A8D4', 0], ['#C4B5FD', 50], ['#A5F3FC', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-prism-paper', name: 'Prism Paper', isDark: false, background: '#FCFCFF', accent: ramp(90, [['#60A5FA', 0], ['#A78BFA', 26], ['#F472B6', 52], ['#FB923C', 78], ['#FACC15', 100]]), contrast: 30, uiTint: 18 },
    { id: 'catalog-meadow', name: 'Meadow', isDark: false, background: '#F4FBF2', accent: ramp(35, [['#86EFAC', 0], ['#34D399', 48], ['#0E7490', 100]]), contrast: 30, uiTint: 18 },
    { id: 'catalog-sunrise-paper', name: 'Sunrise Paper', isDark: false, background: '#FFFAF2', accent: ramp(15, [['#FDE68A', 0], ['#FB923C', 45], ['#F43F5E', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-tidal-light', name: 'Tidal Light', isDark: false, background: '#F1FAFD', accent: ramp(245, [['#67E8F9', 0], ['#38BDF8', 42], ['#4F46E5', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-orchard', name: 'Orchard', isDark: false, background: '#FBFAF0', accent: ramp(120, [['#BEF264', 0], ['#FACC15', 50], ['#FB923C', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-hydrangea', name: 'Hydrangea', isDark: false, background: '#F6F6FE', accent: ramp(190, [['#A5B4FC', 0], ['#7DD3FC', 44], ['#F0ABFC', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-opal', name: 'Opal', isDark: false, background: '#F8FCFC', accent: bloom([['#FFFFFF', 0], ['#A5F3FC', 42], ['#818CF8', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-sherbet-swirl', name: 'Sherbet Swirl', isDark: false, background: '#FFF7F9', accent: sweep(140, [['#FDBA74', 0], ['#F9A8D4', 33], ['#93C5FD', 66], ['#FDBA74', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-linen-fade', name: 'Linen Fade', isDark: false, background: '#FBF8F2', accent: ramp(310, [['#D6BCA0', 0], ['#B45309', 55], ['#7C2D12', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-jellybean', name: 'Jellybean', isDark: false, background: '#FFF9FC', accent: ramp(55, [['#F472B6', 0], ['#C084FC', 34], ['#60A5FA', 68], ['#34D399', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-lagoon-light', name: 'Lagoon Light', isDark: false, background: '#EFFBFA', accent: ramp(160, [['#5EEAD4', 0], ['#0EA5E9', 52], ['#1E40AF', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-peony', name: 'Peony', isDark: false, background: '#FFF5F8', accent: ramp(225, [['#FBCFE8', 0], ['#F472B6', 45], ['#BE185D', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-clementine', name: 'Clementine', isDark: false, background: '#FFF9F0', accent: gradient('#FDBA74', '#EA580C', 25), contrast: 30, uiTint: 20 },
    { id: 'catalog-wisteria', name: 'Wisteria', isDark: false, background: '#F9F6FE', accent: gradient('#C4B5FD', '#7C3AED', 200), contrast: 30, uiTint: 22 },
    { id: 'catalog-eucalyptus', name: 'Eucalyptus', isDark: false, background: '#F3FAF6', accent: gradient('#6EE7B7', '#0F766E', 320), contrast: 30, uiTint: 18 },
    { id: 'catalog-porcelain-blue', name: 'Porcelain Blue', isDark: false, background: '#F4F8FD', accent: gradient('#93C5FD', '#1D4ED8', 75), contrast: 30, uiTint: 18 },
    { id: 'catalog-marzipan', name: 'Marzipan', isDark: false, background: '#FEFBF0', accent: gradient('#FDE68A', '#B45309', 160), contrast: 30, uiTint: 20 },
    { id: 'catalog-driftwood', name: 'Driftwood', isDark: false, background: '#F8F5F1', accent: ramp(280, [['#D4C3AE', 0], ['#A8A29E', 50], ['#44403C', 100]]), contrast: 30, uiTint: 16 },
    { id: 'catalog-cherry-blossom', name: 'Cherry Blossom', isDark: false, background: '#FFF6F9', accent: ramp(100, [['#FECDD3', 0], ['#FB7185', 48], ['#9F1239', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-dawn-chorus', name: 'Dawn Chorus', isDark: false, background: '#FDF8FF', accent: ramp(215, [['#FDE68A', 0], ['#F0ABFC', 38], ['#818CF8', 72], ['#38BDF8', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-limeade', name: 'Limeade', isDark: false, background: '#F9FDF0', accent: ramp(40, [['#D9F99D', 0], ['#65A30D', 55], ['#166534', 100]]), contrast: 30, uiTint: 18 },
    { id: 'catalog-saltwater', name: 'Saltwater', isDark: false, background: '#F0FAFC', accent: ramp(175, [['#CFFAFE', 0], ['#22D3EE', 36], ['#0E7490', 70], ['#164E63', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-fresco', name: 'Fresco', isDark: false, background: '#FCF9F4', accent: ramp(135, [['#FDBA74', 0], ['#F87171', 34], ['#C084FC', 68], ['#60A5FA', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-mineral', name: 'Mineral', isDark: false, background: '#F5F7F8', accent: ramp(255, [['#CBD5E1', 0], ['#64748B', 50], ['#1E293B', 100]]), contrast: 28, uiTint: 14 },
    { id: 'catalog-lemon-ice', name: 'Lemon Ice', isDark: false, background: '#FEFEF0', accent: ramp(85, [['#FEF08A', 0], ['#A3E635', 50], ['#0D9488', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-tulip', name: 'Tulip', isDark: false, background: '#FFF6F6', accent: gradient('#FCA5A5', '#DC2626', 195), contrast: 30, uiTint: 20 },
    { id: 'catalog-cobalt-paper', name: 'Cobalt Paper', isDark: false, background: '#F3F6FF', accent: gradient('#818CF8', '#1E3A8A', 300), contrast: 30, uiTint: 20 },
    { id: 'catalog-verbena', name: 'Verbena', isDark: false, background: '#FAF6FF', accent: sweep(320, [['#C4B5FD', 0], ['#F0ABFC', 35], ['#93C5FD', 70], ['#C4B5FD', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-nectarine', name: 'Nectarine', isDark: false, background: '#FFF8F3', accent: ramp(240, [['#FED7AA', 0], ['#FB7185', 50], ['#9333EA', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-sea-glass', name: 'Sea Glass', isDark: false, background: '#F2FBF8', accent: bloom([['#FFFFFF', 0], ['#5EEAD4', 40], ['#0F766E', 100]]), contrast: 30, uiTint: 18 },
    { id: 'catalog-heather', name: 'Heather', isDark: false, background: '#F8F6FB', accent: ramp(20, [['#DDD6FE', 0], ['#A78BFA', 46], ['#6D28D9', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-honeycomb', name: 'Honeycomb', isDark: false, background: '#FFFBEF', accent: ramp(150, [['#FDE047', 0], ['#F59E0B', 48], ['#B45309', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-stonewash', name: 'Stonewash', isDark: false, background: '#F4F6F8', accent: ramp(200, [['#E2E8F0', 0], ['#7DD3FC', 40], ['#0369A1', 100]]), contrast: 30, uiTint: 16 },
    { id: 'catalog-guava', name: 'Guava', isDark: false, background: '#FFF7F6', accent: ramp(65, [['#FDA4AF', 0], ['#FB923C', 40], ['#FDE68A', 75], ['#86EFAC', 100]]), contrast: 30, uiTint: 20 },
    { id: 'catalog-alpine-light', name: 'Alpine Light', isDark: false, background: '#F4F9FB', accent: gradient('#A5F3FC', '#155E75', 110), contrast: 30, uiTint: 18 },
    { id: 'catalog-orchid-paper', name: 'Orchid Paper', isDark: false, background: '#FDF6FE', accent: gradient('#F0ABFC', '#86198F', 235), contrast: 30, uiTint: 22 },
    { id: 'catalog-ceramic', name: 'Ceramic', isDark: false, background: '#FAFAF7', accent: ramp(330, [['#E7E5E4', 0], ['#A8A29E', 45], ['#292524', 100]]), contrast: 28, uiTint: 12 },
    { id: 'catalog-plumeria', name: 'Plumeria', isDark: false, background: '#FFF9F5', accent: ramp(115, [['#FEF3C7', 0], ['#FBCFE8', 40], ['#C4B5FD', 75], ['#7DD3FC', 100]]), contrast: 30, uiTint: 22 },
    { id: 'catalog-juniper', name: 'Juniper', isDark: false, background: '#F4F8F5', accent: ramp(285, [['#BBF7D0', 0], ['#14B8A6', 48], ['#1E3A8A', 100]]), contrast: 30, uiTint: 18 },
    { id: 'catalog-apricot-sky', name: 'Apricot Sky', isDark: false, background: '#FFFAF6', accent: ramp(180, [['#FED7AA', 0], ['#FDBA74', 30], ['#93C5FD', 68], ['#4F46E5', 100]]), contrast: 30, uiTint: 20 },
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
