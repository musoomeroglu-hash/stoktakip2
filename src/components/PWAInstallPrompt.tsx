import { useState, useEffect } from 'react';

export default function PWAInstallPrompt() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [prompt, setPrompt] = useState<any>(null);

    useEffect(() => {
        const handler = (e: Event) => { e.preventDefault(); setPrompt(e); };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    if (!prompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-gradient-to-r from-primary to-blue-700 rounded-2xl p-5 shadow-2xl z-40">
            <button onClick={() => setPrompt(null)}
                className="absolute top-3 right-3 w-7 h-7 bg-black/20 rounded-full text-white flex items-center justify-center hover:bg-black/40">
                <span className="material-symbols-outlined text-sm">close</span>
            </button>
            <div className="flex items-start gap-3 mb-4">
                <span className="material-symbols-outlined text-3xl text-white">download</span>
                <div>
                    <h3 className="text-white font-bold">Uygulamayı Yükle</h3>
                    <p className="text-white/80 text-sm mt-0.5">Hızlı erişim ve offline çalışma için yükleyin</p>
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={async () => { prompt.prompt(); const { outcome } = await prompt.userChoice; if (outcome === 'accepted') setPrompt(null); }}
                    className="flex-1 py-2 bg-white text-primary rounded-xl font-bold text-sm hover:bg-white/90">Yükle</button>
                <button onClick={() => setPrompt(null)}
                    className="flex-1 py-2 bg-black/20 text-white rounded-xl text-sm hover:bg-black/30">Daha Sonra</button>
            </div>
        </div>
    );
}
