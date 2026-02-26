import { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface ToastItem {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning';
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => { } });

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    useEffect(() => {
        if (toasts.length === 0) return;
        const timer = setTimeout(() => {
            setToasts(prev => prev.slice(1));
        }, 3000);
        return () => clearTimeout(timer);
    }, [toasts]);

    const icons: Record<string, string> = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
    };

    const colors: Record<string, string> = {
        success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        error: 'bg-red-500/10 border-red-500/30 text-red-400',
        warning: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`animate-slide-in flex items-center gap-3 px-4 py-3 rounded-xl border ${colors[toast.type]} shadow-2xl backdrop-blur-lg`}
                    >
                        <span className="material-symbols-outlined text-lg">{icons[toast.type]}</span>
                        <span className="text-sm font-medium">{toast.message}</span>
                        <button
                            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                            className="ml-2 opacity-60 hover:opacity-100"
                        >
                            <span className="material-symbols-outlined text-base">close</span>
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
