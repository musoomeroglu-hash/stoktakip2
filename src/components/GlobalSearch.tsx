import { useState, useEffect, useRef, useCallback } from 'react';
import type { Product, Customer, RepairRecord, Supplier } from '../types';

type ResultType = 'product' | 'customer' | 'repair' | 'supplier';

interface SearchResult {
    type: ResultType;
    id: string;
    title: string;
    sub: string;
    icon: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
}

interface Props {
    products: Product[];
    customers: Customer[];
    repairs: RepairRecord[];
    suppliers: Supplier[];
    onNavigate: (view: string, data?: unknown) => void;
}

export default function GlobalSearch({ products, customers, repairs, suppliers, onNavigate }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 50);
        else { setQuery(''); setSelected(0); }
    }, [open]);

    const results: SearchResult[] = useCallback(() => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        const res: SearchResult[] = [];
        products.forEach(p => {
            if ((p.name || '').toLowerCase().includes(q) || p.barcode.includes(q)) {
                res.push({
                    type: 'product', id: p.id, title: p.name,
                    sub: `${p.barcode} · Stok: ${p.stock} · ₺${p.salePrice}`, icon: 'inventory_2', data: p
                });
            }
        });
        customers.forEach(c => {
            if ((c.name || '').toLowerCase().includes(q) || c.phone.includes(q)) {
                res.push({
                    type: 'customer', id: c.id, title: c.name,
                    sub: `${c.phone}${c.email ? ' · ' + c.email : ''}`, icon: 'person', data: c
                });
            }
        });
        repairs.forEach(r => {
            if ((r.customerName || '').toLowerCase().includes(q) || r.imei?.includes(q) || (r.deviceInfo || '').toLowerCase().includes(q)) {
                res.push({
                    type: 'repair', id: r.id, title: `${r.customerName} — ${r.deviceInfo}`,
                    sub: `IMEI: ${r.imei} · ${r.status}`, icon: 'build', data: r
                });
            }
        });
        suppliers.forEach(s => {
            if ((s.name || '').toLowerCase().includes(q) || s.phone?.includes(q)) {
                res.push({
                    type: 'supplier', id: s.id, title: s.name,
                    sub: `${s.phone ?? ''}${s.city ? ' · ' + s.city : ''}`, icon: 'store', data: s
                });
            }
        });
        return res.slice(0, 8);
    }, [query, products, customers, repairs, suppliers])();

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, results.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); }
        if (e.key === 'Enter' && results[selected]) selectResult(results[selected]);
    };

    const selectResult = (r: SearchResult) => {
        const viewMap: Record<ResultType, string> = { product: 'products', customer: 'customers', repair: 'repairs', supplier: 'suppliers' };
        onNavigate(viewMap[r.type], r.data);
        setOpen(false);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-24 px-4" onClick={() => setOpen(false)}>
            <div className="bg-slate-900 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 p-4 border-b border-slate-700">
                    <span className="material-symbols-outlined text-slate-400">search</span>
                    <input ref={inputRef} value={query}
                        onChange={e => { setQuery(e.target.value); setSelected(0); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Ürün, müşteri, tamir veya tedarikçi ara..."
                        className="flex-1 bg-transparent border-none outline-none text-slate-900 text-base placeholder:text-slate-500" />
                    <kbd className="px-2 py-0.5 bg-slate-700 text-slate-400 rounded text-xs">ESC</kbd>
                </div>
                <div className="max-h-80 overflow-y-auto">
                    {query.trim() === '' ? (
                        <div className="flex flex-col items-center py-8 text-slate-500">
                            <span className="material-symbols-outlined text-3xl mb-2">keyboard</span>
                            <p className="text-sm">Aramaya başlayın</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center py-8 text-slate-500">
                            <span className="material-symbols-outlined text-3xl mb-2">search_off</span>
                            <p className="text-sm">Sonuç bulunamadı</p>
                        </div>
                    ) : results.map((r, i) => (
                        <button key={`${r.type}-${r.id}`} onClick={() => selectResult(r)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left border-l-2 transition-colors ${i === selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-slate-800'
                                }`}>
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${r.type === 'product' ? 'bg-blue-500/20 text-blue-400' :
                                r.type === 'customer' ? 'bg-green-500/20 text-green-400' :
                                    r.type === 'repair' ? 'bg-orange-500/20 text-orange-400' :
                                        'bg-purple-500/20 text-purple-400'
                                }`}>
                                <span className="material-symbols-outlined text-sm">{r.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-slate-900 text-sm font-medium truncate">{r.title}</p>
                                <p className="text-slate-400 text-xs truncate">{r.sub}</p>
                            </div>
                            <span className="material-symbols-outlined text-slate-600 text-sm">chevron_right</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-700 bg-slate-800/50">
                    <div className="flex gap-3 text-xs text-slate-500">
                        <span><kbd className="font-mono">↑↓</kbd> Gezin</span>
                        <span><kbd className="font-mono">↵</kbd> Seç</span>
                        <span><kbd className="font-mono">ESC</kbd> Kapat</span>
                    </div>
                    <span className="text-xs text-slate-500">{results.length} sonuç</span>
                </div>
            </div>
        </div>
    );
}
