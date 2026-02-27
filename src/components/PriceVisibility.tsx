import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Currency = 'TRY' | 'USD';

interface PriceVisibilityContextType {
    visible: boolean;
    toggle: () => void;
    mask: (value: string | number) => string;
    currency: Currency;
    setCurrency: (c: Currency) => void;
    usdRate: number;
    rateLoading: boolean;
}

const PriceVisibilityContext = createContext<PriceVisibilityContextType>({
    visible: true,
    toggle: () => { },
    mask: (v) => String(v),
    currency: 'TRY',
    setCurrency: () => { },
    usdRate: 0,
    rateLoading: true,
});

export function usePriceVisibility() {
    return useContext(PriceVisibilityContext);
}

export function useFormatPrice() {
    const { visible, currency, usdRate } = usePriceVisibility();
    return (value: number): string => {
        let displayValue = value;
        if (currency === 'USD' && usdRate > 0) {
            displayValue = value / usdRate;
        }
        const formatted = new Intl.NumberFormat(currency === 'TRY' ? 'tr-TR' : 'en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
        }).format(displayValue);
        return visible ? formatted : formatted.replace(/[\d.,]+/g, '***');
    };
}

export function PriceVisibilityProvider({ children }: { children: ReactNode }) {
    const [visible, setVisible] = useState(true);
    const [currency, setCurrency] = useState<Currency>('TRY');
    const [usdRate, setUsdRate] = useState(0);
    const [rateLoading, setRateLoading] = useState(true);

    // Fetch USD/TRY rate
    useEffect(() => {
        const fetchRate = async () => {
            try {
                setRateLoading(true);
                const res = await fetch('https://api.exchangerate-data.com/latest?base=USD&symbols=TRY');
                if (res.ok) {
                    const data = await res.json();
                    if (data.rates?.TRY) {
                        setUsdRate(data.rates.TRY);
                    }
                }
            } catch {
                // Fallback: try alternative API
                try {
                    const res2 = await fetch('https://open.er-api.com/v6/latest/USD');
                    if (res2.ok) {
                        const data2 = await res2.json();
                        if (data2.rates?.TRY) {
                            setUsdRate(data2.rates.TRY);
                        }
                    }
                } catch {
                    // Use a reasonable fallback rate
                    setUsdRate(38.5);
                }
            } finally {
                setRateLoading(false);
            }
        };
        fetchRate();
    }, []);

    const toggle = () => setVisible(prev => !prev);

    const mask = (value: string | number): string => {
        if (visible) return String(value);
        return String(value).replace(/[\d.,]+/g, '***');
    };

    return (
        <PriceVisibilityContext.Provider value={{ visible, toggle, mask, currency, setCurrency, usdRate, rateLoading }}>
            {children}
        </PriceVisibilityContext.Provider>
    );
}
