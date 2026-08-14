/**
 * Standard syntax-highlighting palettes offered alongside the per-token pickers. Values are the
 * seven token colours the theme builder writes to `--syntax-*`.
 */
export interface SyntaxThemePreset {
    id: string
    label: string
    isDark: boolean
    background: string
    foreground: string
    keyword: string
    string: string
    number: string
    comment: string
    type: string
}

export const SYNTAX_THEME_PRESETS: SyntaxThemePreset[] = [
    {
        id: 'millennium-dark', label: 'Millennium Dark', isDark: true,
        background: '#0B0D12', foreground: '#D7DAE0', keyword: '#8DA2FB', string: '#7DD3C7',
        number: '#FACC6B', comment: '#737987', type: '#60A5FA',
    },
    {
        id: 'millennium-light', label: 'Millennium Light', isDark: false,
        background: '#FBFBFD', foreground: '#24292F', keyword: '#4338CA', string: '#0F766E',
        number: '#B45309', comment: '#8A8F98', type: '#1D4ED8',
    },
    {
        id: 'dracula', label: 'Dracula', isDark: true,
        background: '#282A36', foreground: '#F8F8F2', keyword: '#FF79C6', string: '#F1FA8C',
        number: '#BD93F9', comment: '#6272A4', type: '#8BE9FD',
    },
    {
        id: 'nord', label: 'Nord', isDark: true,
        background: '#2E3440', foreground: '#D8DEE9', keyword: '#81A1C1', string: '#A3BE8C',
        number: '#B48EAD', comment: '#616E88', type: '#8FBCBB',
    },
    {
        id: 'one-dark', label: 'One Dark', isDark: true,
        background: '#282C34', foreground: '#ABB2BF', keyword: '#C678DD', string: '#98C379',
        number: '#D19A66', comment: '#5C6370', type: '#E5C07B',
    },
    {
        id: 'one-light', label: 'One Light', isDark: false,
        background: '#FAFAFA', foreground: '#383A42', keyword: '#A626A4', string: '#50A14F',
        number: '#986801', comment: '#A0A1A7', type: '#C18401',
    },
    {
        id: 'monokai', label: 'Monokai', isDark: true,
        background: '#272822', foreground: '#F8F8F2', keyword: '#F92672', string: '#E6DB74',
        number: '#AE81FF', comment: '#75715E', type: '#66D9EF',
    },
    {
        id: 'solarized-dark', label: 'Solarized Dark', isDark: true,
        background: '#002B36', foreground: '#93A1A1', keyword: '#859900', string: '#2AA198',
        number: '#D33682', comment: '#586E75', type: '#B58900',
    },
    {
        id: 'solarized-light', label: 'Solarized Light', isDark: false,
        background: '#FDF6E3', foreground: '#586E75', keyword: '#859900', string: '#2AA198',
        number: '#D33682', comment: '#93A1A1', type: '#B58900',
    },
    {
        id: 'github-dark', label: 'GitHub Dark', isDark: true,
        background: '#0D1117', foreground: '#C9D1D9', keyword: '#FF7B72', string: '#A5D6FF',
        number: '#79C0FF', comment: '#8B949E', type: '#FFA657',
    },
    {
        id: 'github-light', label: 'GitHub Light', isDark: false,
        background: '#FFFFFF', foreground: '#24292F', keyword: '#CF222E', string: '#0A3069',
        number: '#0550AE', comment: '#6E7781', type: '#953800',
    },
    {
        id: 'tokyo-night', label: 'Tokyo Night', isDark: true,
        background: '#1A1B26', foreground: '#A9B1D6', keyword: '#BB9AF7', string: '#9ECE6A',
        number: '#FF9E64', comment: '#565F89', type: '#2AC3DE',
    },
    {
        id: 'catppuccin-mocha', label: 'Catppuccin Mocha', isDark: true,
        background: '#1E1E2E', foreground: '#CDD6F4', keyword: '#CBA6F7', string: '#A6E3A1',
        number: '#FAB387', comment: '#6C7086', type: '#89DCEB',
    },
    {
        id: 'catppuccin-latte', label: 'Catppuccin Latte', isDark: false,
        background: '#EFF1F5', foreground: '#4C4F69', keyword: '#8839EF', string: '#40A02B',
        number: '#FE640B', comment: '#9CA0B0', type: '#179299',
    },
    {
        id: 'gruvbox-dark', label: 'Gruvbox Dark', isDark: true,
        background: '#282828', foreground: '#EBDBB2', keyword: '#FB4934', string: '#B8BB26',
        number: '#D3869B', comment: '#928374', type: '#FABD2F',
    },
    {
        id: 'gruvbox-light', label: 'Gruvbox Light', isDark: false,
        background: '#FBF1C7', foreground: '#3C3836', keyword: '#9D0006', string: '#79740E',
        number: '#8F3F71', comment: '#928374', type: '#B57614',
    },
    {
        id: 'night-owl', label: 'Night Owl', isDark: true,
        background: '#011627', foreground: '#D6DEEB', keyword: '#C792EA', string: '#ECC48D',
        number: '#F78C6C', comment: '#637777', type: '#FFCB8B',
    },
    {
        id: 'rose-pine', label: 'Rosé Pine', isDark: true,
        background: '#191724', foreground: '#E0DEF4', keyword: '#31748F', string: '#F6C177',
        number: '#EB6F92', comment: '#6E6A86', type: '#9CCFD8',
    },
    {
        id: 'ayu-mirage', label: 'Ayu Mirage', isDark: true,
        background: '#1F2430', foreground: '#CBCCC6', keyword: '#FFA759', string: '#BAE67E',
        number: '#FFCC66', comment: '#5C6773', type: '#73D0FF',
    },
    {
        id: 'everforest-dark', label: 'Everforest Dark', isDark: true,
        background: '#2B3339', foreground: '#D3C6AA', keyword: '#E67E80', string: '#A7C080',
        number: '#D699B6', comment: '#7A8478', type: '#DBBC7F',
    },
    {
        id: 'synthwave', label: 'Synthwave', isDark: true,
        background: '#241B2F', foreground: '#F2E9FF', keyword: '#FF7EDB', string: '#72F1B8',
        number: '#F97E72', comment: '#8B7FA8', type: '#36F9F6',
    },
    {
        id: 'panda', label: 'Panda', isDark: true,
        background: '#292A2B', foreground: '#E6E6E6', keyword: '#FF75B5', string: '#19F9D8',
        number: '#FFB86C', comment: '#757575', type: '#45A9F9',
    },
]

export const DEFAULT_SYNTAX_PRESET_ID = SYNTAX_THEME_PRESETS[0].id

export function findSyntaxPreset(id: string): SyntaxThemePreset | undefined {
    return SYNTAX_THEME_PRESETS.find((preset) => preset.id === id)
}

/**
 * Matches the seven live token colours back to a preset so the picker can show what is applied
 * after a page reload or a manual per-token tweak.
 */
export function matchSyntaxPreset(colors: {
    background: string
    foreground: string
    keyword: string
    string: string
    number: string
    comment: string
    type: string
}): SyntaxThemePreset | undefined {
    const normalise = (value: string) => value.trim().toLowerCase()
    return SYNTAX_THEME_PRESETS.find((preset) =>
        normalise(preset.background) === normalise(colors.background)
        && normalise(preset.foreground) === normalise(colors.foreground)
        && normalise(preset.keyword) === normalise(colors.keyword)
        && normalise(preset.string) === normalise(colors.string)
        && normalise(preset.number) === normalise(colors.number)
        && normalise(preset.comment) === normalise(colors.comment)
        && normalise(preset.type) === normalise(colors.type)
    )
}
