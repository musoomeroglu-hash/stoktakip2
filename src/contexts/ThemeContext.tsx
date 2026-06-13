import { createContext, useContext, useEffect, useState } from 'react';

export interface ColorTheme {
    id: string;
    name: string;
    emoji: string;
    description: string;
    primary: string;
    primaryHover: string;
    bgDark: string;
    surfaceDark: string;
    surfaceHover: string;
    previewColors: string[]; // 3 renk, önizleme için
}

export const COLOR_THEMES: ColorTheme[] = [
    {
        id: 'midnight-blue',
        name: 'Mavi (Varsayılan)',
        emoji: '🔵',
        description: 'Linear tarzı mavi vurgulu açık tema',
        primary: '#2563eb',
        primaryHover: '#1d4ed8',
        bgDark: '#f6f7f9',
        surfaceDark: '#ffffff',
        surfaceHover: '#f1f5f9',
        previewColors: ['#2563eb', '#ffffff', '#f6f7f9'],
    },
    {
        id: 'steel-gray',
        name: 'Antrasit',
        emoji: '⚫',
        description: 'Nötr koyu gri vurgulu açık tema',
        primary: '#475569',
        primaryHover: '#334155',
        bgDark: '#f6f7f9',
        surfaceDark: '#ffffff',
        surfaceHover: '#f1f5f9',
        previewColors: ['#475569', '#ffffff', '#f6f7f9'],
    },
    {
        id: 'emerald-forest',
        name: 'Yeşil',
        emoji: '🟢',
        description: 'Zümrüt yeşili vurgulu açık tema',
        primary: '#16a34a',
        primaryHover: '#15803d',
        bgDark: '#f6f7f9',
        surfaceDark: '#ffffff',
        surfaceHover: '#f1f5f9',
        previewColors: ['#16a34a', '#ffffff', '#f6f7f9'],
    }
];

interface ThemeContextType {
    currentTheme: ColorTheme;
    setTheme: (themeId: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
    currentTheme: COLOR_THEMES[0],
    setTheme: () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [currentTheme, setCurrentTheme] = useState<ColorTheme>(() => {
        const savedId = localStorage.getItem('app-color-theme');
        return COLOR_THEMES.find(t => t.id === savedId) ?? COLOR_THEMES[0];
    });

    const applyTheme = (theme: ColorTheme) => {
        const root = document.documentElement;
        root.style.setProperty('--color-primary', theme.primary);
        root.style.setProperty('--color-primary-hover', theme.primaryHover);
        root.style.setProperty('--color-bg-dark', theme.bgDark);
        root.style.setProperty('--color-surface-dark', theme.surfaceDark);
        root.style.setProperty('--color-surface-hover', theme.surfaceHover);
        // body arka plan da güncelle
        document.body.style.backgroundColor = theme.bgDark;
    };

    useEffect(() => {
        applyTheme(currentTheme);
    }, [currentTheme]);

    const setTheme = (themeId: string) => {
        const theme = COLOR_THEMES.find(t => t.id === themeId);
        if (!theme) return;
        localStorage.setItem('app-color-theme', themeId);
        setCurrentTheme(theme);
        applyTheme(theme);
    };

    return (
        <ThemeContext.Provider value={{ currentTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
