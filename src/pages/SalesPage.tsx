import { useState, useMemo } from 'react';
import type { Sale, RepairRecord, PhoneSale, Supplier } from '../types';
import { formatDate, getPaymentMethodLabel, getRepairStatusInfo } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';

interface SalesPageProps {
    sales: Sale[];
    repairs: RepairRecord[];
    phoneSales: PhoneSale[];
    suppliers: Supplier[];
    products: import('../types').Product[];
    categories: import('../types').Category[];
    setSales: (s: Sale[]) => void;
    onRefresh: () => void;
}

type PeriodFilter = 'thisMonth' | 'lastMonth' | 'all';
type TabType = 'sales' | 'repairs' | 'phoneSales' | 'profitLoss';

export default function SalesPage({ sales, repairs, phoneSales, suppliers, products, categories, setSales, onRefresh }: SalesPageProps) {
    const { showToast } = useToast();
    const fp = useFormatPrice();
    const [period, setPeriod] = useState<PeriodFilter>('thisMonth');
    const [activeTab, setActiveTab] = useState<TabType>('sales');
    const [showSaleModal, setShowSaleModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

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
        return new Date(2020, 0, 1);
    };
    const getEndDate = () => {
        if (period === 'lastMonth') return new Date(now.getFullYear(), now.getMonth(), 0);
        return now;
    };

    const startDate = getStartDate();
    const endDate = getEndDate();

    // Filtered data
    const filteredSales = useMemo(() =>
        sales.filter(s => {
            const d = new Date(s.date);
            return d >= startDate && d <= endDate;
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

    // KPI calculations
    const totalRevenue = filteredSales.reduce((s, v) => s + v.totalPrice, 0)
        + filteredRepairs.reduce((s, v) => s + v.repairCost, 0)
        + filteredPhoneSales.reduce((s, v) => s + v.salePrice, 0);

    const totalProfit = filteredSales.reduce((s, v) => s + v.totalProfit, 0)
        + filteredRepairs.reduce((s, v) => s + v.profit, 0)
        + filteredPhoneSales.reduce((s, v) => s + v.profit, 0);

    const totalTransactions = filteredSales.length + filteredRepairs.length + filteredPhoneSales.length;
    const cariBalance = suppliers.reduce((s, v) => s + (v.balance || 0), 0);

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
            const id = Date.now().toString();
            const items = saleItems.map(i => ({
                ...i,
                profit: (i.salePrice - i.purchasePrice) * i.quantity
            }));
            const totalPrice = items.reduce((s, i) => s + i.salePrice * i.quantity, 0);
            const totalProfit = items.reduce((s, i) => s + i.profit, 0);
            const sale: Sale = {
                id, items, totalPrice, totalProfit,
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
            setSales([sale, ...sales]);
            setShowSaleModal(false);
            setSaleItems([]);
            setSaleCustomerName('');
            setSaleCustomerPhone('');
            onRefresh();
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
            {/* Period Filter */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-white">Satış & Raporlar</h2>
                    <p className="text-slate-400 text-sm mt-1">Satış verilerini takip edin ve raporlayın</p>
                </div>
                <div className="flex gap-2">
                    {([['thisMonth', 'Bu Ay'], ['lastMonth', 'Geçen Ay'], ['all', 'Tüm Zamanlar']] as const).map(([id, label]) => (
                        <button key={id}
                            onClick={() => setPeriod(id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${period === id ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'bg-surface-dark text-slate-300 hover:bg-surface-hover border border-slate-700'}`}
                        >{label}</button>
                    ))}
                    <button
                        onClick={() => { setShowSaleModal(true); setSaleItems([]); }}
                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium shadow-lg shadow-primary/25 flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-lg">add</span>Yeni Satış
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
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

            {/* Tabs */}
            <div className="bg-surface-dark border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="flex border-b border-slate-700">
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
                        <div className="relative w-64">
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
                            <table className="w-full text-left">
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
                            <table className="w-full text-left">
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
                            <table className="w-full text-left">
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
                        <div className="grid grid-cols-2 gap-6">
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
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
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
                                        <select
                                            value={item.productId}
                                            onChange={e => updateSaleItem(idx, 'productId', e.target.value)}
                                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none"
                                        >
                                            <option value="">Ürün seçin...</option>
                                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({fp(p.salePrice)})</option>)}
                                        </select>
                                        <input type="number" min="1" value={item.quantity} onChange={e => updateSaleItem(idx, 'quantity', Number(e.target.value))}
                                            className="w-20 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white text-center focus:border-primary outline-none" placeholder="Adet" />
                                        <input type="number" value={item.salePrice} onChange={e => updateSaleItem(idx, 'salePrice', Number(e.target.value))}
                                            className="w-32 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white text-right focus:border-primary outline-none" placeholder="Fiyat" />
                                        <button onClick={() => removeSaleItem(idx)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400">
                                            <span className="material-symbols-outlined text-lg">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Payment & Customer */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Ödeme Yöntemi</label>
                                    <select value={salePaymentMethod} onChange={e => setSalePaymentMethod(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none">
                                        <option value="cash">Nakit</option><option value="card">Kart</option><option value="transfer">Havale</option><option value="mixed">Karışık</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Müşteri Adı</label>
                                    <input type="text" value={saleCustomerName} onChange={e => setSaleCustomerName(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white placeholder:text-slate-500 focus:border-primary outline-none" placeholder="Opsiyonel" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Telefon</label>
                                    <input type="text" value={saleCustomerPhone} onChange={e => setSaleCustomerPhone(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white placeholder:text-slate-500 focus:border-primary outline-none" placeholder="Opsiyonel" />
                                </div>
                            </div>

                            {/* Total */}
                            {saleItems.length > 0 && (
                                <div className="flex justify-between items-center p-4 rounded-xl bg-primary/10 border border-primary/20">
                                    <span className="text-primary font-semibold">Toplam Tutar</span>
                                    <span className="text-primary text-xl font-bold">{fp(saleItems.reduce((s, i) => s + i.salePrice * i.quantity, 0))}</span>
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
