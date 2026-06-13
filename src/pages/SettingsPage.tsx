import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { useTheme, COLOR_THEMES } from '../contexts/ThemeContext';

export default function SettingsPage() {
    const { showToast } = useToast();
    const { currentTheme, setTheme } = useTheme();
    const [cardCommissionRate, setCardCommissionRate] = useState<number>(0);

    useEffect(() => {
        const storedRate = localStorage.getItem('cardCommissionRate');
        if (storedRate) {
            setCardCommissionRate(parseFloat(storedRate));
        }
    }, []);

    const handleSave = () => {
        if (cardCommissionRate < 0 || cardCommissionRate > 100) {
            showToast('Komisyon oranı 0 ile 100 arasında olmalıdır!', 'error');
            return;
        }
        localStorage.setItem('cardCommissionRate', cardCommissionRate.toString());
        showToast('Ayarlar başarıyla kaydedildi!', 'success');
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin space-y-8">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Başlık */}
                <div>
                    <h2 className="text-2xl font-bold text-white">Uygulama Ayarları</h2>
                    <p className="text-slate-400 text-sm mt-1">Sitenin görünümünü kişiselleştirin ve sistem tercihlerini yönetin</p>
                </div>

                {/* Renk Teması Kartı */}
                <div className="bg-surface-dark rounded-2xl border border-slate-800 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl bg-primary/20">
                            <span className="material-symbols-outlined text-primary">palette</span>
                        </div>
                        <div>
                            <h3 className="text-white font-semibold">Renk Teması</h3>
                            <p className="text-slate-400 text-xs">Aktif tema: <span className="text-primary font-medium">{currentTheme.emoji} {currentTheme.name}</span></p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                        {COLOR_THEMES.map((theme) => {
                            const isActive = currentTheme.id === theme.id;
                            return (
                                <button
                                    key={theme.id}
                                    onClick={() => setTheme(theme.id)}
                                    className={`relative group rounded-xl p-4 text-left transition-all duration-200 border-2 ${isActive
                                            ? 'border-primary bg-primary/10 scale-[1.02]'
                                            : 'border-slate-800 bg-surface-hover/30 hover:border-slate-600 hover:scale-[1.01]'
                                        }`}
                                >
                                    {/* Aktif rozeti */}
                                    {isActive && (
                                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                            <span className="material-symbols-outlined text-white text-xs" style={{ fontSize: '12px' }}>check</span>
                                        </div>
                                    )}

                                    {/* Renk önizleme */}
                                    <div className="flex gap-1.5 mb-3">
                                        {theme.previewColors.map((color, i) => (
                                            <div
                                                key={i}
                                                className="rounded-full border border-white/10"
                                                style={{
                                                    backgroundColor: color,
                                                    width: i === 0 ? '28px' : '18px',
                                                    height: i === 0 ? '28px' : '18px',
                                                }}
                                            />
                                        ))}
                                    </div>

                                    {/* İsim & açıklama */}
                                    <p className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-white'}`}>
                                        {theme.emoji} {theme.name}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5 leading-tight">{theme.description}</p>

                                    {/* Hex kodu */}
                                    <p className="text-[10px] text-slate-500 mt-2 font-mono">{theme.primary}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Mevcut tema detayları */}
                <div className="bg-surface-dark rounded-2xl border border-slate-800 p-6">
                    <h3 className="text-white font-semibold mb-4">
                        {currentTheme.emoji} {currentTheme.name} — Renk Paleti
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {[
                            { label: 'Ana Renk', color: currentTheme.primary },
                            { label: 'Hover', color: currentTheme.primaryHover },
                            { label: 'Arkaplan', color: currentTheme.bgDark },
                            { label: 'Yüzey', color: currentTheme.surfaceDark },
                            { label: 'Hover Yüzey', color: currentTheme.surfaceHover },
                        ].map(({ label, color }) => (
                            <div key={label} className="text-center">
                                <div
                                    className="w-full h-14 rounded-xl border border-white/10 mb-2"
                                    style={{ backgroundColor: color }}
                                />
                                <p className="text-xs text-slate-300 font-medium">{label}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{color}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Ödeme Ayarları */}
                <div className="bg-surface-dark border flex flex-col gap-4 border-slate-700/50 p-6 rounded-2xl">
                    <div className="flex items-center gap-3 border-b border-slate-700/50 pb-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary">credit_card</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Ödeme Ayarları</h3>
                            <p className="text-sm text-slate-400">Kredi kartı işlemleri için uygulanacak komisyon oranını belirleyin.</p>
                        </div>
                    </div>

                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Kredi Kartı Komisyon Oranı (%)
                            </label>
                            <div className="relative max-w-sm">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={cardCommissionRate === 0 ? '' : cardCommissionRate}
                                    onChange={(e) => setCardCommissionRate(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 pr-10 text-white focus:border-primary outline-none font-medium"
                                    placeholder="Örn: 3.5"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                            </div>
                            <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                                * Satış, tamir veya diğer işlemlerinde ödeme yöntemi <strong>"Kart"</strong> seçildiğinde, net kâr hesaplanırken toplam tutar üzerinden <strong>%{(cardCommissionRate || 0).toString()}</strong> komisyon kesintisi yapılır.
                            </p>
                        </div>

                        <div className="pt-4 flex justify-start">
                            <button
                                onClick={handleSave}
                                className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-black font-semibold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">save</span>
                                Ayarları Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
