import { useState, useMemo } from 'react';
import type { Supplier, RepairRecord } from '../types';
import { formatDate } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';

interface SuppliersPageProps {
    suppliers: Supplier[];
    setSuppliers: (s: Supplier[]) => void;
    repairs: RepairRecord[];
}

export default function SuppliersPage({ suppliers, setSuppliers, repairs }: SuppliersPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [showModal, setShowModal] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [showSlideOver, setShowSlideOver] = useState(false);
    const [search, setSearch] = useState('');

    const [form, setForm] = useState({
        name: '', contactName: '', phone: '', whatsapp: '', email: '',
        address: '', city: '', notes: '', paymentTerms: 'pesin', currency: 'TRY'
    });

    // Compute supplier debts from repair records
    const supplierDebts = useMemo(() => {
        const map: Record<string, { total: number; repairs: RepairRecord[] }> = {};
        repairs.forEach(r => {
            if (r.supplierId && r.partsCost > 0) {
                if (!map[r.supplierId]) map[r.supplierId] = { total: 0, repairs: [] };
                map[r.supplierId].total += r.partsCost;
                map[r.supplierId].repairs.push(r);
            }
        });
        return map;
    }, [repairs]);

    const active = suppliers.filter(s => s.isActive !== false);
    const filtered = active.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));

    // Calculate balances from repair data
    const getSupplierDebt = (supplierId: string) => supplierDebts[supplierId]?.total || 0;
    const totalBalance = active.reduce((s, v) => s + getSupplierDebt(v.id), 0);
    const debtCount = active.filter(s => getSupplierDebt(s.id) > 0).length;

    const openCreate = () => {
        setForm({ name: '', contactName: '', phone: '', whatsapp: '', email: '', address: '', city: '', notes: '', paymentTerms: 'pesin', currency: 'TRY' });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name) { showToast('İsim zorunlu!', 'error'); return; }
        try {
            await api.saveSupplier({ ...form, isActive: true });
            const data = await api.getSuppliers();
            setSuppliers(data);
            setShowModal(false);
            showToast('Tedarikçi eklendi!');
        } catch { showToast('Hata!', 'error'); }
    };

    const openCari = (s: Supplier) => {
        setSelectedSupplier(s);
        setShowSlideOver(true);
    };

    const formatBalance = (balance: number) => {
        if (balance > 0) return { text: `${fp(balance)} (B)`, color: 'text-red-400' };
        return { text: '₺0', color: 'text-emerald-400' };
    };

    // Get repair-based transactions for a supplier
    const getSupplierRepairs = (supplierId: string) => supplierDebts[supplierId]?.repairs || [];

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            <div className="flex justify-between items-center">
                <div><h2 className="text-2xl font-bold text-white">Tedarikçiler Cari</h2><p className="text-emerald-400 text-sm mt-1">Tedarikçi borç/alacak takibi</p></div>
                <button onClick={openCreate} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-emerald-500/25 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">add</span>Yeni Tedarikçi
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { label: 'Aktif Tedarikçi', value: active.length, icon: 'store', color: 'text-emerald-400' },
                    { label: 'Toplam Borç (Tamir)', value: formatBalance(totalBalance).text, icon: 'account_balance', color: formatBalance(totalBalance).color },
                    { label: 'Borçlu Tedarikçi', value: debtCount, icon: 'warning', color: 'text-red-400' },
                ].map(card => (
                    <div key={card.label} className="glass-panel p-5 rounded-xl flex flex-col justify-between h-32 relative overflow-hidden">
                        <div><p className="text-slate-400 text-sm mb-1">{card.label}</p><h3 className={`text-2xl font-bold ${card.color}`}>{card.value}</h3></div>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div className="bg-surface-dark border border-slate-700/50 p-4 rounded-xl">
                <div className="relative w-64">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tedarikçi ara..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 outline-none" />
                </div>
            </div>

            <div className="bg-surface-dark border border-slate-700/50 rounded-xl overflow-x-auto">
                <table className="w-full text-left min-w-[800px]">
                    <thead><tr className="bg-slate-800/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                        <th className="p-4">Tedarikçi</th><th className="p-4">İletişim</th><th className="p-4">Şehir</th>
                        <th className="p-4 text-right">Tamir Alışları</th><th className="p-4 text-right">Borç</th><th className="p-4 text-center">İşlemler</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-700/50 text-sm">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-16 text-slate-400">
                                <span className="material-symbols-outlined text-6xl mb-4 block">inbox</span><p>Tedarikçi yok</p>
                            </td></tr>
                        ) : filtered.map(s => {
                            const debt = getSupplierDebt(s.id);
                            const bal = formatBalance(debt);
                            const repairCount = getSupplierRepairs(s.id).length;
                            return (
                                <tr key={s.id} className="hover:bg-surface-hover/50 transition-colors cursor-pointer" onClick={() => openCari(s)}>
                                    <td className="p-4"><div className="font-medium text-white">{s.name}</div><div className="text-xs text-slate-400">{s.contactName}</div></td>
                                    <td className="p-4 text-slate-300">{s.phone || '—'}</td>
                                    <td className="p-4 text-slate-300">{s.city || '—'}</td>
                                    <td className="p-4 text-right text-white">{repairCount > 0 ? `${repairCount} tamir — ${fp(debt)}` : '—'}</td>
                                    <td className="p-4 text-right"><span className={`font-semibold ${bal.color}`}>{bal.text}</span></td>
                                    <td className="p-4 text-center">
                                        <button className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-400">
                                            <span className="material-symbols-outlined text-lg">chevron_right</span>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Slide-over Panel — shows repair-based supplier transactions */}
            {showSlideOver && selectedSupplier && (() => {
                const supplierRepairs = getSupplierRepairs(selectedSupplier.id);
                const supplierDebt = getSupplierDebt(selectedSupplier.id);
                return (
                    <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowSlideOver(false)}>
                        <div className="absolute inset-0 bg-black/40"></div>
                        <div className="relative w-[90vw] md:w-[480px] h-full bg-surface-dark border-l border-slate-700 overflow-y-auto animate-slide-in" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-700">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{selectedSupplier.name}</h3>
                                        <p className="text-sm text-slate-400">{selectedSupplier.phone}</p>
                                    </div>
                                    <button onClick={() => setShowSlideOver(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                                </div>
                                <div className="mt-4 p-4 rounded-xl bg-slate-800/50">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400 text-sm">Toplam Borç (Tamir)</span>
                                        <span className={`text-xl font-bold ${formatBalance(supplierDebt).color}`}>{formatBalance(supplierDebt).text}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6">
                                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Tamir Alışları ({supplierRepairs.length})</h4>
                                <div className="space-y-3">
                                    {supplierRepairs.length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-8">Bu tedarikçiye ait tamir kaydı yok</p>
                                    ) : supplierRepairs
                                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                        .map(r => (
                                            <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 bg-slate-700/50 flex-shrink-0">
                                                    <span className="material-symbols-outlined text-base">build</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between">
                                                        <span className="text-sm font-medium text-white">{r.deviceInfo}</span>
                                                        <span className="text-sm font-medium text-red-400">+{fp(r.partsCost)}</span>
                                                    </div>
                                                    <div className="flex gap-2 mt-1">
                                                        <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
                                                        <span className="text-xs text-slate-500">Müşteri: {r.customerName}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* New Supplier Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-lg animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">Yeni Tedarikçi</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="col-span-2"><label className="block text-sm font-medium text-slate-300 mb-1">Firma Adı *</label>
                                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-emerald-500 outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Yetkili Kişi</label>
                                <input type="text" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-emerald-500 outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Telefon</label>
                                <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-emerald-500 outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Şehir</label>
                                <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-emerald-500 outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Ödeme Koşulu</label>
                                <select value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-emerald-500 outline-none">
                                    <option value="pesin">Peşin</option><option value="vadeli">Vadeli</option><option value="konsinyasyon">Konsinyasyon</option>
                                </select></div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-emerald-500/25">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
