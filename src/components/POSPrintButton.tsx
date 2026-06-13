import { useState } from 'react';
import type { ReceiptData } from '../types';
import { printReceiptBrowser, connectPrinter, printWithSavedPrinter } from '../utils/pos';

interface Props {
    receiptData: ReceiptData;
}

export default function POSPrintButton({ receiptData }: Props) {
    const [showMenu, setShowMenu] = useState(false);
    const [printing, setPrinting] = useState(false);

    const handlePrint = async (method: 'browser' | 'serial') => {
        setPrinting(true);
        setShowMenu(false);
        try {
            if (method === 'browser') {
                printReceiptBrowser(receiptData);
            } else {
                await printWithSavedPrinter(receiptData);
            }
        } catch (err: unknown) {
            alert(`Yazdırma hatası: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
        } finally {
            setPrinting(false);
        }
    };

    return (
        <div className="relative">
            <button onClick={() => setShowMenu(s => !s)} disabled={printing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50">
                <span className="material-symbols-outlined text-sm">{printing ? 'progress_activity' : 'receipt'}</span>
                {printing ? 'Yazdırılıyor...' : 'Fiş Yazdır'}
            </button>
            {showMenu && (
                <div className="absolute bottom-full mb-2 right-0 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden min-w-48 z-10">
                    <button onClick={() => handlePrint('browser')}
                        className="w-full px-4 py-3 text-left text-white text-sm hover:bg-slate-700 flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 text-sm">print</span>
                        Tarayıcıdan Yazdır
                    </button>
                    <button onClick={() => handlePrint('serial')}
                        className="w-full px-4 py-3 text-left text-white text-sm hover:bg-slate-700 flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 text-sm">usb</span>
                        USB Yazıcı (ESC/POS)
                    </button>
                    <div className="border-t border-slate-700">
                        <button onClick={() => { setShowMenu(false); connectPrinter(); }}
                            className="w-full px-4 py-3 text-left text-slate-400 text-xs hover:bg-slate-700">
                            ⚙️ USB Yazıcı Bağla
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
