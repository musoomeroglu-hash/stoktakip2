import { useState, useRef, useEffect } from 'react';
import type { Customer } from '../types';

interface CustomerSelectorProps {
    customers: Customer[];
    selectedCustomerName: string;
    selectedCustomerPhone: string;
    onSelect: (name: string, phone: string) => void;
    onAddNew?: (customer: Partial<Customer>) => void;
}

export default function CustomerSelector({ customers, selectedCustomerName, selectedCustomerPhone, onSelect, onAddNew }: CustomerSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [quickName, setQuickName] = useState('');
    const [quickPhone, setQuickPhone] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setShowQuickAdd(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = customers.filter(c => {
        if (!search) return true;
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.phone?.includes(q);
    });

    const handleSelect = (c: Customer) => {
        onSelect(c.name, c.phone || '');
        setIsOpen(false);
        setSearch('');
    };

    const handleClear = () => {
        onSelect('', '');
        setSearch('');
    };

    const handleQuickAdd = () => {
        if (!quickName.trim()) return;
        onSelect(quickName.trim(), quickPhone.trim());
        if (onAddNew) {
            onAddNew({ name: quickName.trim(), phone: quickPhone.trim() });
        }
        setQuickName('');
        setQuickPhone('');
        setShowQuickAdd(false);
        setIsOpen(false);
    };

    const hasSelection = selectedCustomerName || selectedCustomerPhone;

    return (
        <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium text-slate-300 mb-1">
                Müşteri <span className="text-slate-500">(opsiyonel)</span>
            </label>

            {/* Selected Display / Toggle */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-slate-800 border rounded-lg py-2 px-3 text-sm cursor-pointer flex items-center justify-between transition-all ${isOpen ? 'border-violet-500 ring-1 ring-violet-500/20' : 'border-slate-700 hover:border-slate-600'}`}
            >
                {hasSelection ? (
                    <div className="flex items-center gap-2 flex-1">
                        <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-violet-400 text-xs">person</span>
                        </div>
                        <span className="text-white">{selectedCustomerName}</span>
                        {selectedCustomerPhone && <span className="text-slate-400 text-xs">({selectedCustomerPhone})</span>}
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleClear(); }}
                            className="ml-auto p-0.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                ) : (
                    <span className="text-slate-500">Müşteri seç veya atla...</span>
                )}
                <span className="material-symbols-outlined text-slate-400 text-lg ml-1">{isOpen ? 'expand_less' : 'expand_more'}</span>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in">
                    {/* Search */}
                    <div className="p-2 border-b border-slate-700">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Müşteri ara..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 outline-none"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Customer List */}
                    <div className="max-h-48 overflow-y-auto scrollbar-thin">
                        {filtered.length === 0 ? (
                            <div className="px-3 py-4 text-center text-slate-400 text-sm">
                                {search ? 'Müşteri bulunamadı' : 'Henüz müşteri yok'}
                            </div>
                        ) : filtered.map(c => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => handleSelect(c)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-violet-500/10 text-left transition-colors"
                            >
                                <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                                    <span className="material-symbols-outlined text-violet-400 text-sm">person</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{c.name}</p>
                                    {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Quick Add */}
                    <div className="border-t border-slate-700">
                        {showQuickAdd ? (
                            <div className="p-3 space-y-2">
                                <input type="text" value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="Müşteri adı *"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-3 text-sm text-white focus:border-violet-500 outline-none" autoFocus />
                                <input type="text" value={quickPhone} onChange={e => setQuickPhone(e.target.value)} placeholder="Telefon"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-3 text-sm text-white focus:border-violet-500 outline-none" />
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setShowQuickAdd(false)} className="flex-1 py-1.5 text-xs text-slate-400 hover:bg-surface-hover rounded-lg">İptal</button>
                                    <button type="button" onClick={handleQuickAdd} className="flex-1 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs rounded-lg font-medium">Ekle & Seç</button>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowQuickAdd(true)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-violet-400 hover:bg-violet-500/10 text-sm font-medium transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">person_add</span>
                                Yeni Müşteri Ekle
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
