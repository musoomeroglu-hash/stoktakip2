import { useState, useMemo } from 'react';
import type { RepairRecord, PhoneSale, Sale, Customer } from '../types';
import { formatDate } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';

interface CustomersPageProps {
    repairs: RepairRecord[];
    phoneSales: PhoneSale[];
    sales: Sale[];
    customers: Customer[];
    setCustomers: (c: Customer[]) => void;
}

type PeriodFilter = 'thisMonth' | 'lastMonth' | 'all' | 'custom';

export default function CustomersPage({ repairs, phoneSales, sales, customers, setCustomers }: CustomersPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [search, setSearch] = useState('');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'name' | 'totalSpent' | 'lastTransaction' | 'transactions'>('lastTransaction');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Customer | null>(null);
    const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);

    // Cari (borç/alacak) state
    const [showTxModal, setShowTxModal] = useState(false);
    const [txCustomer, setTxCustomer] = useState<Customer | null>(null);
    const [txType, setTxType] = useState<'debt' | 'credit' | 'payment_received' | 'payment_made'>('debt');
    const [txAmount, setTxAmount] = useState(0);
    const [txDesc, setTxDesc] = useState('');

    // Period filter state
    const [period, setPeriod] = useState<PeriodFilter>('thisMonth');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // Date range helpers
    const now = new Date();
    const getStartDate = () => {
        if (period === 'thisMonth') return new Date(now.getFullYear(), now.getMonth(), 1);
        if (period === 'lastMonth') return new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (period === 'custom' && customStart) return new Date(customStart);
        return new Date(2020, 0, 1);
    };
    const getEndDate = () => {
        if (period === 'lastMonth') return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        if (period === 'custom' && customEnd) {
            const end = new Date(customEnd);
            end.setHours(23, 59, 59);
            return end;
        }
        return new Date();
    };

    // Aggregate transaction data per customer
    const customerStats = useMemo(() => {
        const map = new Map<string, { totalSpent: number; totalProfit: number; repairCount: number; phoneSaleCount: number; productSaleCount: number; lastTx: string; repairs: RepairRecord[]; phoneSales: PhoneSale[]; productSales: Sale[] }>();

        const getOrCreate = (customerId: string) => {
            if (!map.has(customerId)) {
                map.set(customerId, { totalSpent: 0, totalProfit: 0, repairCount: 0, phoneSaleCount: 0, productSaleCount: 0, lastTx: '', repairs: [], phoneSales: [], productSales: [] });
            }
            return map.get(customerId)!;
        };

        // Match by name/phone to customer
        const findCustomer = (name: string, phone: string): Customer | undefined => {
            const n = (name || '').trim().toLowerCase();
            const p = (phone || '').trim();
            return customers.find(c => {
                const cn = c.name.toLowerCase();
                const cp = (c.phone || '').trim();
                if (p && cp && p === cp) return true;
                if (n && cn === n) return true;
                return false;
            });
        };

        const start = getStartDate().getTime();
        const end = getEndDate().getTime();

        for (const r of repairs) {
            const date = new Date(r.createdAt).getTime();
            if (date < start || date > end) continue;
            const c = findCustomer(r.customerName, r.customerPhone);
            if (!c) continue;
            const s = getOrCreate(c.id);
            s.totalSpent += r.repairCost; s.totalProfit += r.profit; s.repairCount++;
            s.repairs.push(r);
            if (!s.lastTx || r.createdAt > s.lastTx) s.lastTx = r.createdAt;
        }

        for (const ps of phoneSales) {
            const date = new Date(ps.date).getTime();
            if (date < start || date > end) continue;
            const c = findCustomer(ps.customerName || '', ps.customerPhone || '');
            if (!c) continue;
            const s = getOrCreate(c.id);
            s.totalSpent += ps.salePrice; s.totalProfit += ps.profit; s.phoneSaleCount++;
            s.phoneSales.push(ps);
            if (!s.lastTx || ps.date > s.lastTx) s.lastTx = ps.date;
        }

        for (const sl of sales) {
            const date = new Date(sl.date).getTime();
            if (date < start || date > end) continue;
            if (!sl.customerInfo?.name && !sl.customerInfo?.phone) continue;
            const c = findCustomer(sl.customerInfo?.name || '', sl.customerInfo?.phone || '');
            if (!c) continue;
            const s = getOrCreate(c.id);
            s.totalSpent += sl.totalPrice; s.totalProfit += sl.totalProfit; s.productSaleCount++;
            s.productSales.push(sl);
            if (!s.lastTx || sl.date > s.lastTx) s.lastTx = sl.date;
        }

        return map;
    }, [customers, repairs, phoneSales, sales, period, customStart, customEnd]);

    // Search & sort
    const filtered = useMemo(() => {
        let result = customers;
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(c => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q));
        }
        result = [...result].sort((a, b) => {
            const sa = customerStats.get(a.id);
            const sb = customerStats.get(b.id);
            switch (sortBy) {
                case 'name': return a.name.localeCompare(b.name, 'tr');
                case 'totalSpent': return (sb?.totalSpent || 0) - (sa?.totalSpent || 0);
                case 'transactions': return ((sb?.repairCount || 0) + (sb?.phoneSaleCount || 0) + (sb?.productSaleCount || 0)) - ((sa?.repairCount || 0) + (sa?.phoneSaleCount || 0) + (sa?.productSaleCount || 0));
                case 'lastTransaction': return new Date(sb?.lastTx || 0).getTime() - new Date(sa?.lastTx || 0).getTime();
                default: return 0;
            }
        });
        return result;
    }, [customers, search, sortBy, customerStats]);

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || null;
    const selectedStats = selectedCustomer ? customerStats.get(selectedCustomer.id) : null;


    // Cari totals
    const totalDebt = customers.reduce((s, c) => s + (c.debt || 0), 0);
    const totalCredit = customers.reduce((s, c) => s + (c.credit || 0), 0);
    const netBalance = totalDebt - totalCredit;

    // Open transaction dialog
    const openTxDialog = (c: Customer) => {
        setTxCustomer(c);
        setTxType('debt');
        setTxAmount(0);
        setTxDesc('');
        setShowTxModal(true);
    };

    // Handle transaction
    const handleAddTransaction = async () => {
        if (!txCustomer || txAmount <= 0) { showToast('Geçerli bir tutar girin!', 'error'); return; }
        try {
            let newDebt = txCustomer.debt || 0;
            let newCredit = txCustomer.credit || 0;
            switch (txType) {
                case 'debt': newDebt += txAmount; break;
                case 'credit': newCredit += txAmount; break;
                case 'payment_received': newDebt = Math.max(0, newDebt - txAmount); break;
                case 'payment_made': newCredit = Math.max(0, newCredit - txAmount); break;
            }
            const updated = { ...txCustomer, debt: newDebt, credit: newCredit };
            await api.saveCustomer(updated);
            setCustomers(customers.map(c => c.id === txCustomer.id ? updated : c));
            setShowTxModal(false);
            showToast('İşlem kaydedildi!');
        } catch { showToast('İşlem kaydedilemedi!', 'error'); }
    };

    const openCreate = () => {
        setEditing(null);
        setForm({ name: '', phone: '', email: '', address: '', notes: '' });
        setShowModal(true);
    };

    const openEdit = (c: Customer) => {
        setEditing(c);
        setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', notes: c.notes || '' });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) { showToast('Müşteri adı zorunlu!', 'error'); return; }
        try {
            if (editing) {
                const result = await api.saveCustomer({ ...editing, ...form });
                if (result) setCustomers(customers.map(c => c.id === editing.id ? { ...editing, ...form, ...(result as unknown as Customer) } : c));
            } else {
                const result = await api.saveCustomer(form);
                if (result) setCustomers([result as unknown as Customer, ...customers]);
            }
            setShowModal(false);
            showToast(editing ? 'Müşteri güncellendi!' : 'Müşteri eklendi!');
        } catch { showToast('Hata oluştu!', 'error'); }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteCustomer(id);
            setCustomers(customers.filter(c => c.id !== id));
            if (selectedCustomerId === id) setSelectedCustomerId(null);
            setDeleteTarget(null);
            showToast('Müşteri silindi!');
        } catch { showToast('Hata!', 'error'); }
    };

    // Import customers from existing transaction records
    const importFromTransactions = async () => {
        setImporting(true);
        try {
            const existingNames = new Set(customers.map(c => c.name.toLowerCase()));
            const toImport = new Map<string, { name: string; phone: string }>();

            for (const r of repairs) {
                const name = (r.customerName || '').trim();
                if (!name || existingNames.has(name.toLowerCase())) continue;
                const key = name.toLowerCase();
                if (!toImport.has(key)) toImport.set(key, { name, phone: (r.customerPhone || '').trim() });
            }
            for (const ps of phoneSales) {
                const name = (ps.customerName || '').trim();
                if (!name || existingNames.has(name.toLowerCase())) continue;
                const key = name.toLowerCase();
                if (!toImport.has(key)) toImport.set(key, { name, phone: (ps.customerPhone || '').trim() });
            }
            for (const sl of sales) {
                const name = (sl.customerInfo?.name || '').trim();
                if (!name || existingNames.has(name.toLowerCase())) continue;
                const key = name.toLowerCase();
                if (!toImport.has(key)) toImport.set(key, { name, phone: (sl.customerInfo?.phone || '').trim() });
            }

            const entries = Array.from(toImport.values());
            if (entries.length === 0) {
                showToast('Aktarılacak yeni müşteri bulunamadı.', 'error');
                setImporting(false);
                return;
            }

            const newCustomers: Customer[] = [];
            for (const entry of entries) {
                try {
                    const result = await api.saveCustomer({ name: entry.name, phone: entry.phone, email: '', address: '', notes: '' });
                    if (result) newCustomers.push(result as unknown as Customer);
                } catch { /* skip failed */ }
            }

            if (newCustomers.length > 0) {
                setCustomers([...newCustomers, ...customers]);
                showToast(`${newCustomers.length} müşteri başarıyla aktarıldı!`);
            }
        } catch { showToast('Aktarma hatası!', 'error'); }
        setImporting(false);
    };

    return (
        <>
            <div className="flex-1 flex overflow-hidden">
                {/* Left - Customer List */}
                <div className={`flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin transition-all ${selectedCustomer ? 'pr-0' : ''}`}>
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Müşteri Profilleri</h2>
                            <p className="text-slate-400 text-sm mt-1">Tüm müşterileriniz ve işlem geçmişleri</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={importFromTransactions} disabled={importing}
                                className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                                <span className={`material-symbols-outlined text-lg ${importing ? 'animate-spin' : ''}`}>{importing ? 'sync' : 'download'}</span>
                                {importing ? 'Aktarılıyor...' : 'Mevcut Verileri Aktar'}
                            </button>
                            <button onClick={openCreate} className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-violet-500/25 flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">person_add</span>Yeni Müşteri
                            </button>
                        </div>
                    </div>

                    {/* Period Filter */}
                    <div className="flex justify-between items-center bg-surface-dark border border-slate-700/50 p-4 rounded-xl">
                        <div className="text-slate-300 text-sm font-medium">Tarihe Göre Filtrele:</div>
                        <div className="flex items-center gap-2">
                            {([['thisMonth', 'Bu Ay'], ['lastMonth', 'Geçen Ay'], ['all', 'Tüm Zamanlar']] as const).map(([id, label]) => (
                                <button key={id}
                                    onClick={() => { setPeriod(id); setCustomStart(''); setCustomEnd(''); }}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${period === id ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
                                >{label}</button>
                            ))}
                            <div className="flex items-center gap-1 ml-2">
                                <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); if (e.target.value && customEnd) setPeriod('custom'); }}
                                    className="bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-white focus:border-violet-500 outline-none" />
                                <span className="text-slate-500 text-xs">—</span>
                                <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); if (customStart && e.target.value) setPeriod('custom'); }}
                                    className="bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-white focus:border-violet-500 outline-none" />
                            </div>
                        </div>
                    </div>

                    {/* Cari Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="glass-panel p-5 rounded-xl flex flex-col justify-between h-28 relative overflow-hidden">
                            <div className="absolute right-0 top-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl text-violet-500">group</span></div>
                            <div><p className="text-slate-400 text-sm mb-1">Toplam Müşteri</p><h3 className="text-2xl font-bold text-white">{customers.length}</h3></div>
                        </div>
                        <div className="glass-panel p-5 rounded-xl flex flex-col justify-between h-28 relative overflow-hidden border-l-4 border-red-500/50">
                            <div className="absolute right-0 top-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl text-red-500">trending_up</span></div>
                            <div><p className="text-red-400 text-sm mb-1">Toplam Borç</p><h3 className="text-2xl font-bold text-red-400">{fp(totalDebt)}</h3>
                                <p className="text-[10px] text-slate-500 mt-0.5">Müşteriler bize borçlu</p></div>
                        </div>
                        <div className="glass-panel p-5 rounded-xl flex flex-col justify-between h-28 relative overflow-hidden border-l-4 border-emerald-500/50">
                            <div className="absolute right-0 top-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl text-emerald-500">trending_down</span></div>
                            <div><p className="text-emerald-400 text-sm mb-1">Toplam Alacak</p><h3 className="text-2xl font-bold text-emerald-400">{fp(totalCredit)}</h3>
                                <p className="text-[10px] text-slate-500 mt-0.5">Biz müşterilere borçluyuz</p></div>
                        </div>
                        <div className={`glass-panel p-5 rounded-xl flex flex-col justify-between h-28 relative overflow-hidden border-l-4 ${netBalance >= 0 ? 'border-blue-500/50' : 'border-orange-500/50'}`}>
                            <div className="absolute right-0 top-0 p-4 opacity-10"><span className={`material-symbols-outlined text-6xl ${netBalance >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>account_balance</span></div>
                            <div><p className={`text-sm mb-1 ${netBalance >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>Net Durum</p><h3 className={`text-2xl font-bold ${netBalance >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>{fp(Math.abs(netBalance))}</h3>
                                <p className="text-[10px] text-slate-500 mt-0.5">{netBalance >= 0 ? 'Lehimizde' : 'Aleyhimizde'}</p></div>
                        </div>
                    </div>

                    {/* Search & Sort */}
                    <div className="flex gap-3 items-center bg-surface-dark border border-slate-700/50 p-4 rounded-xl">
                        <div className="relative flex-1">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Müşteri ara (isim, telefon, e-posta)..."
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 outline-none" />
                        </div>
                        <div className="flex gap-2">
                            {([
                                { id: 'lastTransaction' as const, label: 'Son İşlem' },
                                { id: 'totalSpent' as const, label: 'Harcama' },
                                { id: 'transactions' as const, label: 'İşlem Sayısı' },
                                { id: 'name' as const, label: 'İsim' },
                            ]).map(s => (
                                <button key={s.id} onClick={() => setSortBy(s.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortBy === s.id ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Customer List */}
                    <div className="space-y-2">
                        {filtered.length === 0 ? (
                            <div className="text-center py-16 text-slate-400">
                                <span className="material-symbols-outlined text-6xl mb-4 block">group_off</span>
                                <p>Müşteri bulunamadı</p>
                                <button onClick={openCreate} className="mt-4 px-4 py-2 bg-violet-500 text-white rounded-lg text-sm">İlk Müşteriyi Ekle</button>
                            </div>
                        ) : filtered.map(c => {
                            const stats = customerStats.get(c.id);
                            const totalTx = (stats?.repairCount || 0) + (stats?.phoneSaleCount || 0) + (stats?.productSaleCount || 0);
                            return (
                                <div
                                    key={c.id}
                                    onClick={() => setSelectedCustomerId(c.id)}
                                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${selectedCustomerId === c.id
                                        ? 'border-violet-500 bg-violet-500/10'
                                        : 'border-slate-700/50 bg-surface-dark hover:border-slate-600'
                                        }`}
                                >
                                    <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-outlined text-violet-400 text-xl">person</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-white truncate">{c.name}</h4>
                                        <p className="text-xs text-slate-400">{c.phone || 'Telefon yok'} {c.email ? `• ${c.email}` : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-3 text-right">
                                        {/* Cari Balance */}
                                        {((c.debt || 0) > 0 || (c.credit || 0) > 0) && (
                                            <div className="flex flex-col items-end gap-0.5">
                                                {(c.debt || 0) > 0 && <span className="text-xs text-red-400">B: {fp(c.debt)}</span>}
                                                {(c.credit || 0) > 0 && <span className="text-xs text-emerald-400">A: {fp(c.credit)}</span>}
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm font-bold text-white">{fp(stats?.totalSpent || 0)}</p>
                                            <p className="text-xs text-slate-400">{totalTx} işlem</p>
                                        </div>
                                        {/* Tx button */}
                                        <button onClick={(e) => { e.stopPropagation(); openTxDialog(c); }}
                                            className="w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 flex items-center justify-center text-blue-400 transition-all"
                                            title="İşlem Ekle">
                                            <span className="material-symbols-outlined text-sm">payments</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right - Customer Detail Panel */}
                {selectedCustomer && (
                    <div className="w-96 border-l border-slate-700 bg-surface-dark/80 overflow-y-auto scrollbar-thin animate-fade-in flex-shrink-0">
                        <div className="sticky top-0 z-10 bg-surface-dark border-b border-slate-700 p-4 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">Müşteri Detayı</h3>
                            <button onClick={() => setSelectedCustomerId(null)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-4 space-y-5">
                            {/* Customer Card */}
                            <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20 rounded-xl p-5 text-center">
                                <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-3">
                                    <span className="material-symbols-outlined text-violet-400 text-3xl">person</span>
                                </div>
                                <h4 className="text-xl font-bold text-white">{selectedCustomer.name}</h4>
                                {selectedCustomer.phone && <p className="text-slate-400 mt-1">{selectedCustomer.phone}</p>}
                                {selectedCustomer.email && <p className="text-slate-400 text-sm">{selectedCustomer.email}</p>}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <button onClick={() => openEdit(selectedCustomer)} className="flex-1 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-lg">edit</span>Düzenle
                                </button>
                                <button onClick={() => setDeleteTarget(selectedCustomer.id)} className="py-2 px-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm">
                                    <span className="material-symbols-outlined text-lg">delete</span>
                                </button>
                            </div>

                            {/* Contact Info */}
                            {(selectedCustomer.address || selectedCustomer.notes) && (
                                <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">İletişim Bilgileri</p>
                                    {selectedCustomer.address && <p className="text-sm text-slate-300 flex items-center gap-2"><span className="material-symbols-outlined text-sm text-slate-500">location_on</span>{selectedCustomer.address}</p>}
                                    {selectedCustomer.notes && <p className="text-sm text-slate-300 flex items-center gap-2"><span className="material-symbols-outlined text-sm text-slate-500">note</span>{selectedCustomer.notes}</p>}
                                </div>
                            )}

                            {/* Cari Balance */}
                            <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cari Hesap</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-red-400">{fp(selectedCustomer.debt || 0)}</p>
                                        <p className="text-[10px] text-slate-500">Borç</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-emerald-400">{fp(selectedCustomer.credit || 0)}</p>
                                        <p className="text-[10px] text-slate-500">Alacak</p>
                                    </div>
                                    <div className="text-center">
                                        <p className={`text-sm font-bold ${(selectedCustomer.debt || 0) - (selectedCustomer.credit || 0) >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>{fp(Math.abs((selectedCustomer.debt || 0) - (selectedCustomer.credit || 0)))}</p>
                                        <p className="text-[10px] text-slate-500">Bakiye</p>
                                    </div>
                                </div>
                                <button onClick={() => openTxDialog(selectedCustomer)} className="w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-lg">payments</span>İşlem Ekle
                                </button>
                            </div>

                            {/* Summary Stats */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                                    <p className="text-lg font-bold text-white">{fp(selectedStats?.totalSpent || 0)}</p>
                                    <p className="text-xs text-slate-400">Toplam Harcama</p>
                                </div>
                                <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                                    <p className="text-lg font-bold text-emerald-400">{fp(selectedStats?.totalProfit || 0)}</p>
                                    <p className="text-xs text-slate-400">Toplam Kâr</p>
                                </div>
                            </div>

                            {/* Last Visit */}
                            {selectedStats?.lastTx && (
                                <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Son İşlem</p>
                                    <p className="text-sm text-white">{formatDate(selectedStats.lastTx)}</p>
                                </div>
                            )}

                            {/* Transaction Types */}
                            {selectedStats && (
                                <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">İşlem Dağılımı</p>
                                    <div className="space-y-2">
                                        {selectedStats.repairCount > 0 && <div className="flex justify-between text-sm"><span className="text-amber-400 flex items-center gap-1"><span className="material-symbols-outlined text-sm">build</span> Tamir</span><span className="text-white font-medium">{selectedStats.repairCount} işlem</span></div>}
                                        {selectedStats.phoneSaleCount > 0 && <div className="flex justify-between text-sm"><span className="text-cyan-400 flex items-center gap-1"><span className="material-symbols-outlined text-sm">smartphone</span> Telefon</span><span className="text-white font-medium">{selectedStats.phoneSaleCount} satış</span></div>}
                                        {selectedStats.productSaleCount > 0 && <div className="flex justify-between text-sm"><span className="text-emerald-400 flex items-center gap-1"><span className="material-symbols-outlined text-sm">shopping_cart</span> Ürün</span><span className="text-white font-medium">{selectedStats.productSaleCount} satış</span></div>}
                                    </div>
                                </div>
                            )}

                            {/* Repair History */}
                            {selectedStats && selectedStats.repairs.length > 0 && (
                                <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Tamir Geçmişi</p>
                                    <div className="space-y-2">
                                        {selectedStats.repairs.map(r => (
                                            <div key={r.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                                                <div className="flex justify-between items-start"><div><p className="text-sm font-medium text-white">{r.deviceInfo}</p><p className="text-xs text-slate-400">{r.problemDescription || '—'}</p></div><span className="text-sm font-bold text-white">{fp(r.repairCost)}</span></div>
                                                <div className="flex justify-between items-center mt-2"><span className="text-xs text-slate-500">{formatDate(r.createdAt)}</span><span className="text-xs text-emerald-400">+{fp(r.profit)}</span></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Phone Sale History */}
                            {selectedStats && selectedStats.phoneSales.length > 0 && (
                                <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Telefon Satışları</p>
                                    <div className="space-y-2">
                                        {selectedStats.phoneSales.map(ps => (
                                            <div key={ps.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                                                <div className="flex justify-between items-start"><p className="text-sm font-medium text-white">{ps.brand} {ps.model}</p><span className="text-sm font-bold text-white">{fp(ps.salePrice)}</span></div>
                                                <div className="flex justify-between items-center mt-2"><span className="text-xs text-slate-500">{formatDate(ps.date)}</span><span className="text-xs text-emerald-400">+{fp(ps.profit)}</span></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Product Sale History */}
                            {selectedStats && selectedStats.productSales.length > 0 && (
                                <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Ürün Satışları</p>
                                    <div className="space-y-2">
                                        {selectedStats.productSales.map(s => (
                                            <div key={s.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                                                <div className="flex justify-between items-start"><div><p className="text-sm font-medium text-white">{s.items.map(i => i.productName).join(', ')}</p><p className="text-xs text-slate-400">{s.items.length} kalem</p></div><span className="text-sm font-bold text-white">{fp(s.totalPrice)}</span></div>
                                                <div className="flex justify-between items-center mt-2"><span className="text-xs text-slate-500">{formatDate(s.date)}</span><span className="text-xs text-emerald-400">+{fp(s.totalProfit)}</span></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-lg animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">{editing ? 'Müşteri Düzenle' : 'Yeni Müşteri'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Müşteri Adı *</label>
                                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-violet-500 outline-none" placeholder="Ad Soyad" /></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Telefon</label>
                                    <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-violet-500 outline-none" placeholder="05xx xxx xx xx" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">E-posta</label>
                                    <input type="text" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-violet-500 outline-none" placeholder="ornek@mail.com" /></div>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Adres</label>
                                <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-violet-500 outline-none" placeholder="Adres" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Notlar</label>
                                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-violet-500 outline-none resize-none" /></div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-violet-500/25">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-sm animate-fade-in p-6 text-center" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4"><span className="material-symbols-outlined text-3xl text-red-400">delete_forever</span></div>
                        <h3 className="text-lg font-bold text-white mb-2">Müşteriyi Sil</h3>
                        <p className="text-sm text-slate-400 mb-6">Bu müşteriyi silmek istediğinize emin misiniz?</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => setDeleteTarget(null)} className="px-5 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg border border-slate-700">İptal</button>
                            <button onClick={() => handleDelete(deleteTarget)} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium">Sil</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Transaction Modal */}
            {showTxModal && txCustomer && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowTxModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <div>
                                <h3 className="text-lg font-bold text-white">İşlem Ekle</h3>
                                <p className="text-sm text-slate-400">{txCustomer.name}</p>
                            </div>
                            <button onClick={() => setShowTxModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">İşlem Tipi</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { id: 'debt' as const, label: 'Borç Ekle', desc: 'Müşteri bize borçlandı', color: 'red' },
                                        { id: 'credit' as const, label: 'Alacak Ekle', desc: 'Biz müşteriye borçlandık', color: 'emerald' },
                                        { id: 'payment_received' as const, label: 'Tahsilat', desc: 'Borç ödemesi aldık', color: 'blue' },
                                        { id: 'payment_made' as const, label: 'Ödeme', desc: 'Alacak ödemesi yaptık', color: 'amber' },
                                    ]).map(t => (
                                        <button key={t.id} onClick={() => setTxType(t.id)}
                                            className={`p-3 rounded-xl text-left border transition-all ${txType === t.id
                                                ? `border-${t.color}-500/50 bg-${t.color}-500/10`
                                                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}>
                                            <p className={`text-sm font-medium ${txType === t.id ? `text-${t.color}-400` : 'text-white'}`}>{t.label}</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Tutar (₺)</label>
                                <input type="number" min="0" step="0.01" value={txAmount || ''}
                                    onChange={e => setTxAmount(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-lg text-white font-bold focus:border-violet-500 outline-none"
                                    placeholder="0,00" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Açıklama</label>
                                <textarea value={txDesc} onChange={e => setTxDesc(e.target.value)} rows={2}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-violet-500 outline-none resize-none"
                                    placeholder="İşlem açıklaması..." />
                            </div>
                            {/* Current balance info */}
                            <div className="bg-slate-800/50 rounded-lg p-3 flex justify-between text-sm">
                                <span className="text-slate-400">Mevcut Borç:</span><span className="text-red-400 font-medium">{fp(txCustomer.debt || 0)}</span>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-3 flex justify-between text-sm -mt-2">
                                <span className="text-slate-400">Mevcut Alacak:</span><span className="text-emerald-400 font-medium">{fp(txCustomer.credit || 0)}</span>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowTxModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleAddTransaction} className="px-6 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-violet-500/25">İşlemi Kaydet</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
