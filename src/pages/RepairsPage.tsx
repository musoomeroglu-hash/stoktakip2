import { useState, useMemo } from 'react';
import type { RepairRecord, Supplier } from '../types';
import { formatDate, getRepairStatusInfo, generateId } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';

interface RepairsPageProps {
    repairs: RepairRecord[];
    setRepairs: (r: RepairRecord[]) => void;
    suppliers: Supplier[];
    setSuppliers: (s: Supplier[]) => void;
}

// Status progression order
const STATUS_FLOW: RepairRecord['status'][] = ['in_progress', 'waiting_parts', 'completed', 'delivered'];

function getNextStatus(current: RepairRecord['status']): RepairRecord['status'] | null {
    const idx = STATUS_FLOW.indexOf(current);
    if (idx === -1 || idx >= STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
}

export default function RepairsPage({ repairs, setRepairs, suppliers, setSuppliers }: RepairsPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<RepairRecord | null>(null);

    const [form, setForm] = useState({
        customerName: '', customerPhone: '', deviceInfo: '', imei: '',
        problemDescription: '', repairCost: 0, partsCost: 0, prePayment: 0,
        status: 'in_progress' as RepairRecord['status'], paymentMethod: 'cash', technicianNotes: '',
        supplierId: '', supplierName: ''
    });

    const statuses = [
        { id: 'all', label: 'Tümü' },
        { id: 'in_progress', label: 'İşlemde' },
        { id: 'waiting_parts', label: 'Parça Bekliyor' },
        { id: 'completed', label: 'Tamamlandı' },
        { id: 'delivered', label: 'Teslim Edildi' },
        { id: 'cancelled', label: 'İptal' },
    ];

    const filtered = useMemo(() =>
        repairs.filter(r => {
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (search && !r.customerName.toLowerCase().includes(search.toLowerCase()) && !r.deviceInfo.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        }), [repairs, statusFilter, search]);

    const totalRepairs = repairs.length;
    const activeRepairs = repairs.filter(r => r.status === 'in_progress' || r.status === 'waiting_parts').length;
    const completedRepairs = repairs.filter(r => r.status === 'completed' || r.status === 'delivered').length;
    const totalRevenue = repairs.filter(r => r.status !== 'cancelled').reduce((s, r) => s + r.repairCost, 0);

    const openCreate = () => {
        setEditing(null);
        setForm({ customerName: '', customerPhone: '', deviceInfo: '', imei: '', problemDescription: '', repairCost: 0, partsCost: 0, prePayment: 0, status: 'in_progress', paymentMethod: 'cash', technicianNotes: '', supplierId: '', supplierName: '' });
        setShowModal(true);
    };

    const openEdit = (r: RepairRecord) => {
        setEditing(r);
        setForm({
            customerName: r.customerName, customerPhone: r.customerPhone, deviceInfo: r.deviceInfo,
            imei: r.imei, problemDescription: r.problemDescription, repairCost: r.repairCost,
            partsCost: r.partsCost, prePayment: r.prePayment, status: r.status,
            paymentMethod: r.paymentMethod || 'cash', technicianNotes: r.technicianNotes,
            supplierId: r.supplierId || '', supplierName: r.supplierName || ''
        });
        setShowModal(true);
    };

    const handleSupplierChange = (supplierId: string) => {
        const supplier = suppliers.find(s => s.id === supplierId);
        setForm({
            ...form,
            supplierId: supplierId,
            supplierName: supplier?.name || ''
        });
    };

    // Save repair + create cari hareket for supplier debt
    const handleSave = async () => {
        if (!form.customerName || !form.deviceInfo) { showToast('Müşteri adı ve cihaz bilgisi zorunlu!', 'error'); return; }
        try {
            const recordData = {
                ...form,
                profit: form.repairCost - form.partsCost,
                createdAt: editing?.createdAt || new Date().toISOString(),
                deliveredAt: form.status === 'delivered' ? new Date().toISOString() : undefined,
            };

            if (editing) {
                const record: RepairRecord = { id: editing.id, ...recordData };
                await api.saveRepair(record);

                // If supplier changed and partsCost > 0, add cari hareket for the difference
                if (form.supplierId && form.partsCost > 0 && form.supplierId !== editing.supplierId) {
                    await addSupplierDebt(form.supplierId, form.partsCost, record.deviceInfo, record.id || editing.id);
                }

                setRepairs(repairs.map(r => r.id === record.id ? record : r));
            } else {
                const record: RepairRecord = { id: '', ...recordData };
                const result = await api.saveRepair(record);
                const saved: RepairRecord = result ? { ...recordData, ...result } : { ...record, id: generateId() };

                // Create cari hareket if supplier is selected and partsCost > 0
                if (form.supplierId && form.partsCost > 0) {
                    await addSupplierDebt(form.supplierId, form.partsCost, saved.deviceInfo, saved.id);
                }

                setRepairs([saved, ...repairs]);
            }
            setShowModal(false);
            showToast(editing ? 'Tamir kaydı güncellendi!' : 'Tamir kaydı eklendi!');
        } catch (err) {
            console.error('Repair save error:', err);
            showToast('Hata oluştu!', 'error');
        }
    };

    // Add supplier debt via cari hareket
    const addSupplierDebt = async (supplierId: string, amount: number, deviceInfo: string, repairId: string) => {
        try {
            await api.saveCariHareket({
                supplierId,
                islemTarihi: new Date().toISOString(),
                islemTipi: 'alis',
                miktar: amount,
                aciklama: `Tamir parçası: ${deviceInfo}`,
                ilgiliId: repairId,
                bakiyeEtkisi: amount,
            });
            // Refresh suppliers to get updated balance
            const updatedSuppliers = await api.getSuppliers();
            setSuppliers(updatedSuppliers);
        } catch (err) {
            console.error('Cari hareket error:', err);
        }
    };

    // Status progression handler
    const handleStatusAdvance = async (r: RepairRecord) => {
        const nextStatus = getNextStatus(r.status);
        if (!nextStatus) return;

        try {
            const updated: RepairRecord = {
                ...r,
                status: nextStatus,
                deliveredAt: nextStatus === 'delivered' ? new Date().toISOString() : r.deliveredAt,
            };
            await api.saveRepair(updated);
            setRepairs(repairs.map(rep => rep.id === r.id ? updated : rep));

            const statusLabel = getRepairStatusInfo(nextStatus).label;
            showToast(`Durum güncellendi: ${statusLabel}`);
        } catch {
            showToast('Durum güncellenemedi!', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Silmek istediğinize emin misiniz?')) return;
        try {
            await api.deleteRepair(id);
            setRepairs(repairs.filter(r => r.id !== id));
            showToast('Silindi!');
        } catch { showToast('Hata!', 'error'); }
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            <div className="flex justify-between items-center">
                <div><h2 className="text-2xl font-bold text-white">Tamir Kayıtları</h2><p className="text-slate-400 text-sm mt-1">Cihaz tamir takibi</p></div>
                <button onClick={openCreate} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-amber-500/25 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">add</span>Yeni Tamir
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Toplam Kayıt', value: totalRepairs, icon: 'build', color: 'text-amber-400', bgIcon: 'text-amber-500' },
                    { label: 'Aktif İşlemler', value: activeRepairs, icon: 'pending', color: 'text-blue-400', bgIcon: 'text-blue-500' },
                    { label: 'Tamamlanan', value: completedRepairs, icon: 'check_circle', color: 'text-emerald-400', bgIcon: 'text-green-500' },
                    { label: 'Toplam Gelir', value: fp(totalRevenue), icon: 'payments', color: 'text-green-400', bgIcon: 'text-green-500' },
                ].map(card => (
                    <div key={card.label} className="glass-panel p-5 rounded-xl flex flex-col justify-between h-32 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10"><span className={`material-symbols-outlined text-6xl ${card.bgIcon}`}>{card.icon}</span></div>
                        <div><p className="text-slate-400 text-sm mb-1">{card.label}</p><h3 className="text-2xl font-bold text-white">{card.value}</h3></div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex gap-3 items-center bg-surface-dark border border-slate-700/50 p-4 rounded-xl">
                <div className="relative w-64">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Müşteri, cihaz..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 outline-none" />
                </div>
                <div className="flex gap-2 ml-auto">
                    {statuses.map(s => (
                        <button key={s.id} onClick={() => setStatusFilter(s.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s.id ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface-dark border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead><tr className="bg-slate-800/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                            <th className="p-4">Tarih</th><th className="p-4">Müşteri</th><th className="p-4">Cihaz</th><th className="p-4">IMEI</th>
                            <th className="p-4 text-right">Ücret</th><th className="p-4 text-right">Kâr</th><th className="p-4">Durum</th><th className="p-4 text-center">İşlemler</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-700/50 text-sm">
                            {filtered.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-16 text-slate-400">
                                    <span className="material-symbols-outlined text-6xl mb-4 block">inbox</span><p>Kayıt yok</p>
                                    <button onClick={openCreate} className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm">İlk Kaydı Ekle</button>
                                </td></tr>
                            ) : filtered.map(r => {
                                const st = getRepairStatusInfo(r.status);
                                const nextStatus = getNextStatus(r.status);
                                const nextSt = nextStatus ? getRepairStatusInfo(nextStatus) : null;
                                return (
                                    <tr key={r.id} className="hover:bg-surface-hover/50 transition-colors">
                                        <td className="p-4 text-slate-300">{formatDate(r.createdAt)}</td>
                                        <td className="p-4">
                                            <div className="font-medium text-white">{r.customerName}</div>
                                            <div className="text-xs text-slate-400">{r.customerPhone}</div>
                                        </td>
                                        <td className="p-4 text-white">{r.deviceInfo}</td>
                                        <td className="p-4 text-slate-400 font-mono text-xs">{r.imei || '—'}</td>
                                        <td className="p-4 text-right font-medium text-white">{fp(r.repairCost)}</td>
                                        <td className="p-4 text-right font-medium text-emerald-400">+{fp(r.profit)}</td>
                                        {/* Status Column with Progression Button */}
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1.5">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.color} w-fit`}>
                                                    {st.pulse && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>}
                                                    {st.label}
                                                </span>
                                                {nextSt && r.status !== 'cancelled' && (
                                                    <button
                                                        onClick={() => handleStatusAdvance(r)}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 transition-all w-fit cursor-pointer group"
                                                        title={`${nextSt.label} olarak güncelle`}
                                                    >
                                                        <span className="material-symbols-outlined text-xs group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                                                        {nextSt.label}
                                                    </button>
                                                )}
                                                {r.supplierName && (
                                                    <span className="text-xs text-slate-500 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">local_shipping</span>
                                                        {r.supplierName}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-1">
                                                <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-slate-400 hover:text-amber-400"><span className="material-symbols-outlined text-lg">edit</span></button>
                                                <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400"><span className="material-symbols-outlined text-lg">delete</span></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">{editing ? 'Tamir Düzenle' : 'Yeni Tamir Kaydı'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Müşteri Adı *</label>
                                    <input type="text" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Telefon</label>
                                    <input type="text" value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Cihaz Modeli *</label>
                                    <input type="text" value={form.deviceInfo} onChange={e => setForm({ ...form, deviceInfo: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">IMEI</label>
                                    <input type="text" value={form.imei} onChange={e => setForm({ ...form, imei: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Arıza Açıklaması</label>
                                <textarea value={form.problemDescription} onChange={e => setForm({ ...form, problemDescription: e.target.value })} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none resize-none" /></div>

                            {/* Supplier Selection */}
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400 text-lg">local_shipping</span>
                                    <label className="text-sm font-medium text-white">Parça Tedarikçisi</label>
                                </div>
                                <select
                                    value={form.supplierId}
                                    onChange={e => handleSupplierChange(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none"
                                >
                                    <option value="">Tedarikçi seçin (opsiyonel)</option>
                                    {suppliers.filter(s => s.isActive !== false).map(s => (
                                        <option key={s.id} value={s.id}>{s.name} {s.balance > 0 ? `(Borç: ${fp(s.balance)})` : ''}</option>
                                    ))}
                                </select>
                                {form.supplierId && form.partsCost > 0 && (
                                    <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                        <span className="material-symbols-outlined text-sm">info</span>
                                        <span>Kaydettiğinizde <strong>{form.supplierName}</strong> tedarikçisine <strong>{fp(form.partsCost)}</strong> borç eklenecek.</span>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Tamir Ücreti</label>
                                    <input type="number" value={form.repairCost} onChange={e => setForm({ ...form, repairCost: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Parça Maliyeti</label>
                                    <input type="number" value={form.partsCost} onChange={e => setForm({ ...form, partsCost: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Ön Ödeme</label>
                                    <input type="number" value={form.prePayment} onChange={e => setForm({ ...form, prePayment: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Durum</label>
                                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as RepairRecord['status'] })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none">
                                        <option value="in_progress">İşlemde</option><option value="waiting_parts">Parça Bekliyor</option>
                                        <option value="completed">Tamamlandı</option><option value="delivered">Teslim Edildi</option><option value="cancelled">İptal</option>
                                    </select></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Ödeme Yöntemi</label>
                                    <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none">
                                        <option value="cash">Nakit</option><option value="card">Kart</option><option value="transfer">Havale</option>
                                    </select></div>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Teknisyen Notları</label>
                                <textarea value={form.technicianNotes} onChange={e => setForm({ ...form, technicianNotes: e.target.value })} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none resize-none" /></div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-amber-500/25">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
