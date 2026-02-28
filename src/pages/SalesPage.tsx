import { useState, useMemo, useRef } from 'react';
import type { Sale, RepairRecord, PhoneSale, Supplier, Product, Customer } from '../types';
import { formatDate, getPaymentMethodLabel, getRepairStatusInfo } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';
import CustomerSelector from '../components/CustomerSelector';

// Searchable product dropdown component
function ProductSearchDropdown({ products, selectedId, onSelect, fp }: {
    products: Product[]; selectedId: string; onSelect: (id: string) => void; fp: (n: number) => string;
}) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const selected = products.find(p => p.id === selectedId);
    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <div className="flex-1 relative" ref={ref}>
            <input
                type="text"
                value={open ? query : (selected ? `${selected.name} (${fp(selected.salePrice)})` : '')}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => { setOpen(true); setQuery(''); }}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                placeholder="Ürün ara..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none"
            />
            {open && (
                <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="p-3 text-sm text-slate-400 text-center">Ürün bulunamadı</div>
                    ) : filtered.map(p => (
                        <button
                            key={p.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); onSelect(p.id); setQuery(''); setOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/20 transition-colors flex justify-between items-center ${p.id === selectedId ? 'bg-primary/10 text-primary' : 'text-white'}`}
                        >
                            <span className="truncate">{p.name}</span>
                            <span className="text-slate-400 text-xs ml-2 flex-shrink-0">{fp(p.salePrice)} • Stok: {p.stock}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

interface SalesPageProps {
    sales: Sale[];
    repairs: RepairRecord[];
    phoneSales: PhoneSale[];
    suppliers: Supplier[];
    products: import('../types').Product[];
    setSales: (s: Sale[]) => void;
    onRefresh: () => void;
    customers: Customer[];
    setCustomers: (c: Customer[]) => void;
}

type PeriodFilter = 'thisMonth' | 'lastMonth' | 'all' | 'custom';
type TabType = 'sales' | 'repairs' | 'phoneSales' | 'profitLoss';

export default function SalesPage({ sales, repairs, phoneSales, suppliers, products, setSales, onRefresh, customers, setCustomers }: SalesPageProps) {
    const { showToast } = useToast();
    const fp = useFormatPrice();
    const [period, setPeriod] = useState<PeriodFilter>('thisMonth');
    const [activeTab, setActiveTab] = useState<TabType>('sales');
    const [showSaleModal, setShowSaleModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // Sale form state
    const [saleItems, setSaleItems] = useState<{ productId: string; productName: string; quantity: number; salePrice: number; purchasePrice: number }[]>([]);
    const [salePaymentMethod, setSalePaymentMethod] = useState('cash');
    const [saleCustomerName, setSaleCustomerName] = useState('');
    const [saleCustomerPhone, setSaleCustomerPhone] = useState('');

    // Date range
    const now = new Date();
    const getStartDate = () => {
        if (period === 'thisMonth') return new Date(now.getFullYear(), now.getMonth(), 1);
        if (period === 'lastMonth') return new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (period === 'custom' && customStart) return new Date(customStart);
        return new Date(2020, 0, 1);
    };
    const getEndDate = () => {
        if (period === 'lastMonth') return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        if (period === 'custom' && customEnd) return new Date(customEnd + 'T23:59:59');
        return now;
    };

    const startDate = getStartDate();
    const endDate = getEndDate();

    // Filtered data
    const filteredSales = useMemo(() =>
        sales.filter(s => {
            const d = new Date(s.date);
            // Exclude repair-related sales (they have productId starting with "repair-")
            // These are already counted in filteredRepairs
            const isRepairSale = s.items?.some(i => i.productId?.startsWith('repair-'));
            return d >= startDate && d <= endDate && !isRepairSale;
        }), [sales, period]);

    const filteredRepairs = useMemo(() =>
        repairs.filter(r => {
            const d = new Date(r.createdAt);
            return d >= startDate && d <= endDate && r.status !== 'cancelled';
        }), [repairs, period]);

    const filteredPhoneSales = useMemo(() =>
        phoneSales.filter(ps => {
            const d = new Date(ps.date);
            return d >= startDate && d <= endDate;
        }), [phoneSales, period]);

    // KPI calculations — all sources combined
    const totalRevenue = filteredSales.reduce((s, v) => s + v.totalPrice, 0)
        + filteredRepairs.reduce((s, v) => s + v.repairCost, 0)
        + filteredPhoneSales.reduce((s, v) => s + v.salePrice, 0);

    const totalProfit = filteredSales.reduce((s, v) => s + v.totalProfit, 0)
        + filteredRepairs.reduce((s, v) => s + v.profit, 0)
        + filteredPhoneSales.reduce((s, v) => s + v.profit, 0);

    const totalTransactions = filteredSales.length + filteredRepairs.length + filteredPhoneSales.length;
    const cariBalance = suppliers.reduce((s, v) => s + (v.balance || 0), 0);

    // Revenue breakdown per source
    const salesRevenue = filteredSales.reduce((s, v) => s + v.totalPrice, 0);
    const repairsRevenue = filteredRepairs.reduce((s, v) => s + v.repairCost, 0);
    const phoneRevenue = filteredPhoneSales.reduce((s, v) => s + v.salePrice, 0);

    // Add item to sale
    const addSaleItem = () => {
        setSaleItems([...saleItems, { productId: '', productName: '', quantity: 1, salePrice: 0, purchasePrice: 0 }]);
    };

    const updateSaleItem = (idx: number, field: string, value: string | number) => {
        const items = [...saleItems];
        if (field === 'productId') {
            const prod = products.find(p => p.id === value);
            if (prod) {
                items[idx] = { ...items[idx], productId: prod.id, productName: prod.name, salePrice: prod.salePrice, purchasePrice: prod.purchasePrice };
            }
        } else {
            (items[idx] as Record<string, unknown>)[field] = value;
        }
        setSaleItems(items);
    };

    const removeSaleItem = (idx: number) => {
        setSaleItems(saleItems.filter((_, i) => i !== idx));
    };

    const handleSaveSale = async () => {
        if (saleItems.length === 0) { showToast('En az bir ürün ekleyin!', 'error'); return; }
        try {
            const items = saleItems.map(i => ({
                ...i,
                profit: (i.salePrice - i.purchasePrice) * i.quantity
            }));
            const totalPrice = items.reduce((s, i) => s + i.salePrice * i.quantity, 0);
            const totalProfit = items.reduce((s, i) => s + i.profit, 0);
            const sale: Sale = {
                id: '', items, totalPrice, totalProfit,
                date: new Date().toISOString(),
                paymentMethod: salePaymentMethod,
                paymentDetails: { [salePaymentMethod]: totalPrice },
                customerInfo: saleCustomerName ? { name: saleCustomerName, phone: saleCustomerPhone } : undefined,
            };
            await api.saveSale(sale);
            // Update product stocks in KV
            for (const item of saleItems) {
                const prod = products.find(p => p.id === item.productId);
                if (prod) {
                    await api.saveProduct({ ...prod, stock: Math.max(0, prod.stock - item.quantity) });
                }
            }
            setShowSaleModal(false);
            setSaleItems([]);
            setSaleCustomerName('');
            setSaleCustomerPhone('');
            await onRefresh(); // Re-fetch all data from API (includes sales)
            showToast('Satış kaydedildi!');
        } catch {
            showToast('Satış kaydedilemedi!', 'error');
        }
    };

    const handleDeleteSale = async (id: string) => {
        if (!confirm('Bu satışı silmek istediğinize emin misiniz?')) return;
        try {
            await api.deleteSale(id);
            setSales(sales.filter(s => s.id !== id));
            showToast('Satış silindi!');
        } catch {
            showToast('Silinemedi!', 'error');
        }
    };

    const searchedSales = filteredSales.filter(s =>
        !searchTerm || s.items.some(i => i.productName.toLowerCase().includes(searchTerm.toLowerCase()))
        || s.customerInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const tabs: { id: TabType; label: string; icon: string }[] = [
        { id: 'sales', label: 'Satışlar', icon: 'receipt_long' },
        { id: 'repairs', label: 'Tamir Satışları', icon: 'build' },
        { id: 'phoneSales', label: 'Telefon Satışları', icon: 'smartphone' },
        { id: 'profitLoss', label: 'Kâr/Zarar Özeti', icon: 'analytics' },
    ];

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            {/* Header & Actions */}
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Satış & Raporlar</h2>
                    <p className="text-slate-400 text-sm mt-1">Satış verilerini takip edin ve raporlayın</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap items-center gap-2 bg-surface-dark/50 p-1 rounded-xl border border-slate-700/50">
                        {([['thisMonth', 'Bu Ay'], ['lastMonth', 'Geçen Ay'], ['all', 'Tüm Zamanlar']] as const).map(([id, label]) => (
                            <button key={id}
                                onClick={() => { setPeriod(id); setCustomStart(''); setCustomEnd(''); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${period === id ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                            >{label}</button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 bg-surface-dark/50 p-1 rounded-xl border border-slate-700/50">
                        <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); if (e.target.value && customEnd) setPeriod('custom'); }}
                            className="bg-transparent border-none py-1.5 px-2 text-xs text-white focus:ring-0 outline-none w-28 md:w-32" />
                        <span className="text-slate-500 text-xs">—</span>
                        <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); if (customStart && e.target.value) setPeriod('custom'); }}
                            className="bg-transparent border-none py-1.5 px-2 text-xs text-white focus:ring-0 outline-none w-28 md:w-32" />
                    </div>

                    <button
                        onClick={() => { setShowSaleModal(true); setSaleItems([]); }}
                        className="w-full lg:w-auto px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/25 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <span className="material-symbols-outlined">add_circle</span>Yeni Satış
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Toplam Ciro', value: fp(totalRevenue), icon: 'payments', color: 'text-blue-400', bgIcon: 'text-blue-500' },
                    { label: 'Toplam Kâr', value: fp(totalProfit), icon: 'trending_up', color: 'text-emerald-400', bgIcon: 'text-green-500' },
                    { label: 'Toplam İşlem', value: totalTransactions.toString(), icon: 'receipt_long', color: 'text-purple-400', bgIcon: 'text-purple-500' },
                    { label: 'Cari Bakiye', value: fp(Math.abs(cariBalance)), icon: 'account_balance', color: cariBalance > 0 ? 'text-red-400' : 'text-emerald-400', bgIcon: 'text-orange-500' },
                ].map(card => (
                    <div key={card.label} className="glass-panel p-5 rounded-xl flex flex-col justify-between h-32 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-10"><span className={`material-symbols-outlined text-6xl ${card.bgIcon}`}>{card.icon}</span></div>
                        <div><p className="text-slate-400 text-sm mb-1">{card.label}</p><h3 className="text-2xl font-bold text-white">{card.value}</h3></div>
                        <div className={`flex items-center gap-1 ${card.color} text-sm`}><span className="material-symbols-outlined text-base">{card.icon}</span></div>
                    </div>
                ))}
            </div>

            {/* Gelir Dağılımı */}
            <div className="glass-panel rounded-xl p-4 text-sm">
                <p className="text-slate-400 font-semibold mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-base">account_balance</span> Gelir Dağılımı</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-white">
                    <div>Ürün Satışları: <b className="text-cyan-400">{fp(salesRevenue)}</b> <span className="text-slate-500 text-xs">({filteredSales.length})</span></div>
                    <div>Tamir Gelirleri: <b className="text-emerald-400">{fp(repairsRevenue)}</b> <span className="text-slate-500 text-xs">({filteredRepairs.length})</span></div>
                    <div>Telefon Satışları: <b className="text-violet-400">{fp(phoneRevenue)}</b> <span className="text-slate-500 text-xs">({filteredPhoneSales.length})</span></div>
                    <div>Toplam Gelir: <b className="text-yellow-400">{fp(salesRevenue + repairsRevenue + phoneRevenue)}</b></div>
                </div>
            </div>

            {/* Kasa Durumu */}
            {(() => {
                // Aggregate payment methods from all filtered sources
                const paymentTotals: Record<string, number> = { cash: 0, card: 0, transfer: 0 };
                let txCount = 0;
                filteredSales.forEach(s => { paymentTotals[s.paymentMethod] = (paymentTotals[s.paymentMethod] || 0) + s.totalPrice; txCount++; });
                filteredRepairs.forEach(r => { paymentTotals[r.paymentMethod || 'cash'] = (paymentTotals[r.paymentMethod || 'cash'] || 0) + r.repairCost; txCount++; });
                filteredPhoneSales.forEach(ps => { paymentTotals['cash'] += ps.salePrice; txCount++; });
                const grandTotal = Object.values(paymentTotals).reduce((a, b) => a + b, 0);
                const methods = [
                    { key: 'cash', label: 'Nakit', icon: 'payments', color: 'text-orange-400', bar: 'bg-orange-500', amount: paymentTotals.cash || 0 },
                    { key: 'card', label: 'Kart', icon: 'credit_card', color: 'text-blue-400', bar: 'bg-blue-500', amount: paymentTotals.card || 0 },
                    { key: 'transfer', label: 'Havale', icon: 'account_balance', color: 'text-fuchsia-400', bar: 'bg-fuchsia-500', amount: paymentTotals.transfer || 0 },
                ];
                return (
                    <div className="bg-surface-dark border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-cyan-400">trending_up</span>
                                <h3 className="text-base font-bold text-white">Bu Ayki Kasa Durumu</h3>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-400 uppercase tracking-wider">Toplam Gelir</p>
                                <p className="text-xl font-bold text-cyan-400">{fp(grandTotal)}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-5">
                            {methods.map(m => {
                                const pct = grandTotal > 0 ? (m.amount / grandTotal * 100) : 0;
                                return (
                                    <div key={m.key}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`material-symbols-outlined text-base ${m.color}`}>{m.icon}</span>
                                                <span className="text-sm font-medium text-white">{m.label}</span>
                                            </div>
                                            <span className={`text-sm font-bold ${m.color}`}>{fp(m.amount)}</span>
                                        </div>
                                        <div className="w-full bg-slate-700/50 rounded-full h-2 mb-1">
                                            <div className={`${m.bar} h-2 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }}></div>
                                        </div>
                                        <p className={`text-xs ${m.color} text-right`}>%{pct.toFixed(1)}</p>
                                    </div>
                                );
                            })}
                        </div>
                        {/* Distribution bar */}
                        <div className="border-t border-slate-700/50 pt-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Distribüsyon</span>
                                <span className="text-xs text-slate-400">{txCount} işlem</span>
                            </div>
                            <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-700/50">
                                {methods.map(m => {
                                    const pct = grandTotal > 0 ? (m.amount / grandTotal * 100) : 0;
                                    return pct > 0 ? <div key={m.key} className={`${m.bar} transition-all duration-700`} style={{ width: `${pct}%` }}></div> : null;
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Tabs */}
            <div className="bg-surface-dark border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="flex border-b border-slate-700 overflow-x-auto scrollbar-none">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === tab.id
                                ? 'border-primary text-primary bg-primary/5'
                                : 'border-transparent text-slate-400 hover:text-white hover:bg-surface-hover'
                                }`}
                        >
                            <span className="material-symbols-outlined text-base">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="p-4">
                    {/* Search */}
                    <div className="mb-4">
                        <div className="relative w-full md:w-64">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-primary outline-none"
                                placeholder="Ara..."
                            />
                        </div>
                    </div>

                    {/* Sales Tab */}
                    {activeTab === 'sales' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[800px]">
                                <thead><tr className="bg-slate-800/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                                    <th className="p-3">Tarih</th><th className="p-3">Ürünler</th><th className="p-3">Müşteri</th>
                                    <th className="p-3">Ödeme</th><th className="p-3 text-right">Tutar</th><th className="p-3 text-right">Kâr</th><th className="p-3 text-center">İşlemler</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-700/50 text-sm">
                                    {searchedSales.length === 0 ? (
                                        <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                                            <span className="material-symbols-outlined text-4xl mb-2 block">inbox</span>Henüz satış kaydı yok
                                        </td></tr>
                                    ) : searchedSales.map(s => (
                                        <tr key={s.id} className="hover:bg-surface-hover/50 transition-colors">
                                            <td className="p-3 text-slate-300">{formatDate(s.date)}</td>
                                            <td className="p-3">{s.items.map(i => `${i.productName} (${i.quantity})`).join(', ')}</td>
                                            <td className="p-3 text-slate-300">{s.customerInfo?.name || '—'}</td>
                                            <td className="p-3"><span className="px-2 py-1 rounded-full text-xs bg-slate-700 text-slate-300">{getPaymentMethodLabel(s.paymentMethod)}</span></td>
                                            <td className="p-3 text-right font-medium text-white">{fp(s.totalPrice)}</td>
                                            <td className="p-3 text-right font-medium text-emerald-400">+{fp(s.totalProfit)}</td>
                                            <td className="p-3 text-center">
                                                <button onClick={() => handleDeleteSale(s.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Repairs Tab */}
                    {activeTab === 'repairs' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[800px]">
                                <thead><tr className="bg-slate-800/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                                    <th className="p-3">Tarih</th><th className="p-3">Müşteri</th><th className="p-3">Cihaz</th>
                                    <th className="p-3 text-right">Ücret</th><th className="p-3 text-right">Kâr</th><th className="p-3">Durum</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-700/50 text-sm">
                                    {filteredRepairs.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-12 text-slate-400">
                                            <span className="material-symbols-outlined text-4xl mb-2 block">inbox</span>Tamir kaydı yok
                                        </td></tr>
                                    ) : filteredRepairs.map(r => {
                                        const st = getRepairStatusInfo(r.status);
                                        return (
                                            <tr key={r.id} className="hover:bg-surface-hover/50 transition-colors">
                                                <td className="p-3 text-slate-300">{formatDate(r.createdAt)}</td>
                                                <td className="p-3">{r.customerName}</td><td className="p-3 text-slate-300">{r.deviceInfo}</td>
                                                <td className="p-3 text-right font-medium text-white">{fp(r.repairCost)}</td>
                                                <td className="p-3 text-right font-medium text-emerald-400">+{fp(r.profit)}</td>
                                                <td className="p-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Phone Sales Tab */}
                    {activeTab === 'phoneSales' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[800px]">
                                <thead><tr className="bg-slate-800/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                                    <th className="p-3">Tarih</th><th className="p-3">Model</th><th className="p-3">IMEI</th>
                                    <th className="p-3 text-right">Alış</th><th className="p-3 text-right">Satış</th><th className="p-3 text-right">Kâr</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-700/50 text-sm">
                                    {filteredPhoneSales.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-12 text-slate-400">
                                            <span className="material-symbols-outlined text-4xl mb-2 block">inbox</span>Telefon satışı yok
                                        </td></tr>
                                    ) : filteredPhoneSales.map(ps => (
                                        <tr key={ps.id} className="hover:bg-surface-hover/50 transition-colors">
                                            <td className="p-3 text-slate-300">{formatDate(ps.date)}</td>
                                            <td className="p-3 font-medium">{ps.brand} {ps.model}</td>
                                            <td className="p-3 text-slate-400 font-mono text-xs">{ps.imei}</td>
                                            <td className="p-3 text-right text-slate-300">{fp(ps.purchasePrice)}</td>
                                            <td className="p-3 text-right font-medium text-white">{fp(ps.salePrice)}</td>
                                            <td className="p-3 text-right font-medium text-emerald-400">+{fp(ps.profit)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Profit/Loss Tab */}
                    {activeTab === 'profitLoss' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white">Gelir Detayı</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between p-3 rounded-lg bg-slate-800/50">
                                        <span className="text-slate-300">Ürün Satışları</span>
                                        <span className="text-white font-medium">{fp(filteredSales.reduce((s, v) => s + v.totalPrice, 0))}</span>
                                    </div>
                                    <div className="flex justify-between p-3 rounded-lg bg-slate-800/50">
                                        <span className="text-slate-300">Tamir Gelirleri</span>
                                        <span className="text-white font-medium">{fp(filteredRepairs.reduce((s, v) => s + v.repairCost, 0))}</span>
                                    </div>
                                    <div className="flex justify-between p-3 rounded-lg bg-slate-800/50">
                                        <span className="text-slate-300">Telefon Satışları</span>
                                        <span className="text-white font-medium">{fp(filteredPhoneSales.reduce((s, v) => s + v.salePrice, 0))}</span>
                                    </div>
                                    <div className="flex justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                                        <span className="text-primary font-semibold">Toplam Ciro</span>
                                        <span className="text-primary font-bold">{fp(totalRevenue)}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white">Kâr Detayı</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between p-3 rounded-lg bg-slate-800/50">
                                        <span className="text-slate-300">Ürün Kârı</span>
                                        <span className="text-emerald-400 font-medium">+{fp(filteredSales.reduce((s, v) => s + v.totalProfit, 0))}</span>
                                    </div>
                                    <div className="flex justify-between p-3 rounded-lg bg-slate-800/50">
                                        <span className="text-slate-300">Tamir Kârı</span>
                                        <span className="text-emerald-400 font-medium">+{fp(filteredRepairs.reduce((s, v) => s + v.profit, 0))}</span>
                                    </div>
                                    <div className="flex justify-between p-3 rounded-lg bg-slate-800/50">
                                        <span className="text-slate-300">Telefon Kârı</span>
                                        <span className="text-emerald-400 font-medium">+{fp(filteredPhoneSales.reduce((s, v) => s + v.profit, 0))}</span>
                                    </div>
                                    <div className="flex justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                        <span className="text-emerald-400 font-semibold">Toplam Kâr</span>
                                        <span className="text-emerald-400 font-bold">+{fp(totalProfit)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* New Sale Modal */}
            {showSaleModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowSaleModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-3xl max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">Yeni Satış</h3>
                            <button onClick={() => setShowSaleModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Items */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-slate-300">Ürünler</label>
                                    <button onClick={addSaleItem} className="text-sm text-primary hover:text-primary-hover flex items-center gap-1">
                                        <span className="material-symbols-outlined text-base">add</span>Ürün Ekle
                                    </button>
                                </div>
                                {saleItems.map((item, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <ProductSearchDropdown
                                            products={products}
                                            selectedId={item.productId}
                                            onSelect={(productId) => updateSaleItem(idx, 'productId', productId)}
                                            fp={fp}
                                        />
                                        <input type="number" min="1" value={item.quantity} onChange={e => updateSaleItem(idx, 'quantity', Number(e.target.value))}
                                            className="w-20 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white text-center focus:border-primary outline-none" placeholder="Adet" />
                                        <div className="flex flex-col gap-1 w-24">
                                            <label className="text-[10px] text-slate-400 font-medium px-1 uppercase tracking-wider">Alış</label>
                                            <input type="number" value={item.purchasePrice} onChange={e => updateSaleItem(idx, 'purchasePrice', Number(e.target.value))}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-sm text-white text-right focus:border-primary outline-none" placeholder="Alış" />
                                        </div>
                                        <div className="flex flex-col gap-1 w-28">
                                            <label className="text-[10px] text-slate-400 font-medium px-1 uppercase tracking-wider">Satış</label>
                                            <input type="number" value={item.salePrice} onChange={e => updateSaleItem(idx, 'salePrice', Number(e.target.value))}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-sm text-cyan-400 font-bold text-right focus:border-primary outline-none" placeholder="Satış" />
                                        </div>
                                        <button onClick={() => removeSaleItem(idx)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400">
                                            <span className="material-symbols-outlined text-lg">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Payment & Customer */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Ödeme Yöntemi</label>
                                    <select value={salePaymentMethod} onChange={e => setSalePaymentMethod(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none">
                                        <option value="cash">Nakit</option><option value="card">Kart</option><option value="transfer">Havale</option><option value="mixed">Karışık</option>
                                    </select>
                                </div>
                                <CustomerSelector
                                    customers={customers}
                                    selectedCustomerName={saleCustomerName}
                                    selectedCustomerPhone={saleCustomerPhone}
                                    onSelect={(name, phone) => { setSaleCustomerName(name); setSaleCustomerPhone(phone); }}
                                    onAddNew={async (c) => { try { const r = await api.saveCustomer(c); if (r) setCustomers([r as unknown as Customer, ...customers]); } catch { } }}
                                />
                            </div>

                            {/* Total and Profit */}
                            {saleItems.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center p-4 rounded-xl bg-primary/10 border border-primary/20">
                                        <span className="text-primary font-semibold">Toplam Tutar</span>
                                        <span className="text-primary text-xl font-bold">{fp(saleItems.reduce((s, i) => s + i.salePrice * i.quantity, 0))}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                        <span className="text-emerald-400 font-semibold">Net Kâr</span>
                                        <span className="text-emerald-400 text-lg font-bold">+{fp(saleItems.reduce((s, i) => s + (i.salePrice - i.purchasePrice) * i.quantity, 0))}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowSaleModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleSaveSale} className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium shadow-lg shadow-primary/25 flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">check</span>Satışı Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
