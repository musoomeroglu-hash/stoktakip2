import { useState, useEffect, useRef, useCallback } from 'react';
import type { IMEICheckResult } from '../types';
import { lookupTAC, guessOrigin, lookupByPrefix } from '../utils/tacDatabase';
import { Html5Qrcode } from 'html5-qrcode';

function getBrandColor(brand: string) {
    switch (brand?.toLowerCase()) {
        case 'apple': return 'bg-gradient-to-br from-slate-700 to-slate-900 border-slate-600 shadow-slate-900/50';
        case 'samsung': return 'bg-gradient-to-br from-blue-600 to-blue-800 border-blue-500 shadow-blue-900/50';
        case 'xiaomi': return 'bg-gradient-to-br from-orange-500 to-red-600 border-orange-400 shadow-orange-900/50';
        case 'huawei':
        case 'oneplus': return 'bg-gradient-to-br from-red-600 to-red-800 border-red-500 shadow-red-900/50';
        case 'google': return 'bg-gradient-to-br from-emerald-500 to-blue-600 border-emerald-400 shadow-emerald-900/50';
        case 'nothing': return 'bg-gradient-to-br from-slate-800 to-black border-slate-700 shadow-black/50';
        case 'oppo':
        case 'vivo': return 'bg-gradient-to-br from-teal-500 to-emerald-600 border-teal-400 shadow-teal-900/50';
        case 'realme':
        case 'poco': return 'bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-400 shadow-yellow-900/50 text-slate-900';
        case 'honor': return 'bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-400 shadow-indigo-900/50';
        case 'asus': return 'bg-gradient-to-br from-red-500 to-slate-900 border-red-500 shadow-red-900/50';
        default: return 'bg-slate-800/80 border-slate-700'; // Fallback
    }
}

function luhnCheck(imei: string): boolean {
    let sum = 0;
    let isEven = false;
    for (let i = imei.length - 1; i >= 0; i--) {
        let digit = parseInt(imei[i]);
        if (isEven) { digit *= 2; if (digit > 9) digit -= 9; }
        sum += digit;
        isEven = !isEven;
    }
    return sum % 10 === 0;
}

interface Props {
    onValidated?: (result: IMEICheckResult) => void;
}

export default function IMEIChecker({ onValidated }: Props) {
    const [imei, setImei] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<IMEICheckResult | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    // TAC lookup as user types
    const tacResult = imei.length >= 8 ? lookupTAC(imei) : null;
    const prefixResult = !tacResult && imei.length >= 6 ? lookupByPrefix(imei) : null;
    const origin = imei.length >= 2 ? guessOrigin(imei) : '';

    const handleCheck = async () => {
        setLoading(true);
        try {
            const isValid = luhnCheck(imei);
            const tac = lookupTAC(imei);
            const res: IMEICheckResult = {
                imei,
                isValid,
                isBlacklisted: false,
                status: isValid ? 'VALID' : 'INVALID',
            };
            // Attach TAC info to result
            if (tac) {
                (res as any).brand = tac.brand;
                (res as any).model = tac.model;
                (res as any).lookupMethod = 'Tam eşleşme';
            } else {
                const prefix = lookupByPrefix(imei);
                if (prefix) {
                    (res as any).brand = prefix.brand;
                    (res as any).model = prefix.hint;
                    (res as any).lookupMethod = 'Prefix tahmini';
                }
            }
            setResult(res);
            onValidated?.(res);
        } finally {
            setLoading(false);
        }
    };

    // Camera scanner
    const startScanner = useCallback(async () => {
        try {
            const scanner = new Html5Qrcode('imei-checker-scanner');
            scannerRef.current = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 280, height: 100 } },
                (decodedText) => {
                    // Extract only digits
                    const digits = decodedText.replace(/\D/g, '');
                    if (digits.length >= 15) {
                        setImei(digits.slice(0, 15));
                    } else {
                        setImei(digits);
                    }
                    scanner.stop().then(() => scanner.clear()).catch(() => { });
                    scannerRef.current = null;
                    setShowScanner(false);
                },
                () => { }
            );
        } catch (err) {
            console.error('Scanner error:', err);
            setShowScanner(false);
        }
    }, []);

    const stopScanner = useCallback(() => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => { });
            scannerRef.current = null;
        }
        setShowScanner(false);
    }, []);

    useEffect(() => {
        if (showScanner) {
            const timer = setTimeout(() => startScanner(), 300);
            return () => clearTimeout(timer);
        }
    }, [showScanner, startScanner]);

    // Cleanup on unmount
    useEffect(() => {
        return () => { stopScanner(); };
    }, [stopScanner]);

    const statusStyle = result
        ? result.isBlacklisted
            ? 'border-red-500 bg-red-500/10 text-red-400'
            : result.isValid
                ? 'border-green-500 bg-green-500/10 text-green-400'
                : 'border-yellow-500 bg-yellow-500/10 text-yellow-400'
        : '';

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <input type="text" value={imei}
                    onChange={e => { setImei(e.target.value.replace(/\D/g, '').slice(0, 15)); setResult(null); }}
                    placeholder="15 haneli IMEI numarası" maxLength={15}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white" />
                <button onClick={() => setShowScanner(true)}
                    className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400 transition-all"
                    title="Kamera ile IMEI tara">
                    <span className="material-symbols-outlined text-lg">photo_camera</span>
                </button>
                <button onClick={handleCheck} disabled={loading || imei.length !== 15}
                    className="px-5 py-2 bg-primary text-white rounded-lg disabled:opacity-40 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">{loading ? 'progress_activity' : 'verified'}</span>
                    {loading ? 'Kontrol...' : 'Kontrol Et'}
                </button>
            </div>

            {/* Live TAC preview as user types */}
            {imei.length >= 2 && !result && (
                <div className="space-y-1.5 animate-fade-in text-sm">
                    {tacResult && (
                        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border shadow-lg text-white ${getBrandColor(tacResult.brand)} transition-all`}>
                            <span className="material-symbols-outlined text-xl">devices</span>
                            <span className="font-bold tracking-wide">{tacResult.brand} {tacResult.model}</span>
                            <span className="text-xs ml-auto opacity-70 bg-black/20 px-2 py-0.5 rounded-full">Kesin TAC Eşleşmesi ✓</span>
                        </div>
                    )}
                    {prefixResult && (
                        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border shadow-lg text-white ${getBrandColor(prefixResult.brand)} transition-all opacity-90`}>
                            <span className="material-symbols-outlined text-xl">memory</span>
                            <span className="font-semibold">{prefixResult.brand} <span className="text-xs opacity-75">{prefixResult.hint}</span></span>
                            <span className="text-xs ml-auto opacity-70 bg-black/20 px-2 py-0.5 rounded-full">Prefix Tahmini 🎯</span>
                        </div>
                    )}
                    {origin && !tacResult && !prefixResult && (
                        <div className="text-xs text-slate-500 px-1 mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">public</span>
                            {origin}
                        </div>
                    )}
                    <div className="flex items-center gap-3 px-1">
                        <div className="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(imei.length / 15) * 100}%` }}></div>
                        </div>
                        <span className="text-xs text-slate-500">{imei.length}/15</span>
                    </div>
                </div>
            )}

            {/* Check result */}
            {result && (
                <div className={`p-4 rounded-xl border-2 ${statusStyle}`}>
                    <div className="flex items-center gap-2 font-bold mb-1">
                        <span className="material-symbols-outlined">
                            {result.isBlacklisted ? 'dangerous' : result.isValid ? 'check_circle' : 'warning'}
                        </span>
                        {result.isValid ? '✅ Geçerli IMEI' : '⚠️ Geçersiz IMEI Formatı'}
                    </div>
                    <p className="text-sm opacity-80">IMEI: {result.imei}</p>
                    {(result as any).brand && (
                        <div className={`mt-3 p-3 rounded-lg flex items-center gap-3 border shadow-lg text-white ${getBrandColor((result as any).brand)} transition-all`}>
                            <span className="material-symbols-outlined text-2xl drop-shadow-sm">devices</span>
                            <div>
                                <p className="font-bold text-base drop-shadow-sm">{(result as any).brand} <span className="font-medium opacity-90 text-sm">{(result as any).model}</span></p>
                                <p className="text-xs opacity-75 flex items-center gap-1 mt-0.5">
                                    <span className="material-symbols-outlined text-[14px]">verified</span>
                                    TAC veritabanından: {(result as any).lookupMethod || 'Eşleşme'}
                                </p>
                            </div>
                        </div>
                    )}
                    {!(result as any).brand && result.isValid && (
                        <div className="mt-2 p-2 bg-slate-800/50 rounded-lg">
                            <p className="text-xs text-slate-400">📋 Bu IMEI veritabanımızda kayıtlı değil. Marka/model bilgisi bulunamadı.</p>
                        </div>
                    )}
                    {result.isBlacklisted && <p className="text-sm font-bold mt-2">⚠️ Bu cihaz kara listede! Satın almayın!</p>}

                    {/* e-Devlet link */}
                    {result.isValid && (
                        <a href="https://www.turkiye.gov.tr/imei-sorgulama" target="_blank" rel="noopener noreferrer"
                            className="mt-3 flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors w-fit">
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            e-Devlet BTK IMEI Sorgulama
                        </a>
                    )}
                </div>
            )}

            {/* Camera Scanner Modal */}
            {showScanner && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70]" onClick={stopScanner}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-400">photo_camera</span>
                                <h3 className="text-lg font-bold text-white">IMEI Tarayıcı</h3>
                            </div>
                            <button onClick={stopScanner} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-4">
                            <p className="text-sm text-slate-400 mb-3">Barkodu kameraya gösterin, IMEI otomatik okunacak</p>
                            <div id="imei-checker-scanner" className="rounded-lg overflow-hidden bg-black" style={{ minHeight: 280 }}></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
