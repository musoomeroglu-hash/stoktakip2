import { createContext, useContext, useState, type ReactNode } from 'react';

interface PriceVisibilityContextType {
    visible: boolean;
    toggle: () => void;
    mask: (value: string | number) => string;
}

const PriceVisibilityContext = createContext<PriceVisibilityContextType>({
    visible: true,
    toggle: () => { },
    mask: (v) => String(v),
});

export function usePriceVisibility() {
    return useContext(PriceVisibilityContext);
}

export function useFormatPrice() {
    const { visible } = usePriceVisibility();
    return (value: number): string => {
        const formatted = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(value);
        return visible ? formatted : formatted.replace(/[\d.,]+/g, '***');
    };
}

export function PriceVisibilityProvider({ children }: { children: ReactNode }) {
    const [visible, setVisible] = useState(true);

    const toggle = () => setVisible(prev => !prev);

    const mask = (value: string | number): string => {
        if (visible) return String(value);
        // Replace digits with asterisks but keep ₺ and structure
        return String(value).replace(/[\d.,]+/g, '***');
    };

    return (
        <PriceVisibilityContext.Provider value={{ visible, toggle, mask }}>
            {children}
        </PriceVisibilityContext.Provider>
    );
}
