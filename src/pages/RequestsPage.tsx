import { useState, useMemo } from 'react';
import type { CustomerRequest } from '../types';
import { formatDate, getRequestStatusInfo, generateId } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';

interface RequestsPageProps {
    requests: CustomerRequest[];
    setRequests: (r: CustomerRequest[]) => void;
}

export default function RequestsPage({ requests, setRequests }: RequestsPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<CustomerRequest | null>(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');

    const [form, setForm] = useState({
        customerName: '', phoneNumber: '', productName: '', notes: '',
        priority: 'normal' as 'normal' | 'urgent', estimatedBudget: 0, status: 'pending' as CustomerRequest['status']
    });

    const filtered = useMemo(() =>
        requests.filter(r => {
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (search && !r.customerName.toLowerCase().includes(search.toLowerCase()) && !r.productName.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        }), [requests, statusFilter, search]);

    const openCreate = () => {
        setEditing(null);
        setForm({ customerName: '', phoneNumber: '', productName: '', notes: '', priority: 'normal', estimatedBudget: 0, status: 'pending' });
        setShowModal(true);
    };

    const openEdit = (r: CustomerRequest) => {
        setEditing(r);
        setForm({ customerName: r.customerName, phoneNumber: r.phoneNumber, productName: r.productName, notes: r.notes, priority: r.priority, estimatedBudget: r.estimatedBudget, status: r.status });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.customerName || !form.productName) { showToast('Müşteri adı ve ürün zorunlu!', 'error'); return; }
        try {
            const record: CustomerRequest = {
                id: editing?.id || generateId(), ...form,
                createdAt: editing?.createdAt || new Date().toISOString()
            };
            await api.saveCustomerRequest(record);
            if (editing) setRequests(requests.map(r => r.id === record.id ? record : r));
            else setRequests([record, ...requests]);
            setShowModal(false);
            showToast(editing ? 'Güncellendi!' : 'İstek eklendi!');
        } catch { showToast('Hata!', 'error'); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Silmek istediğinize emin misiniz?')) return;
        try {
            await api.deleteCustomerRequest(id);
            setRequests(requests.filter(r => r.id !== id));
            showToast('Silindi!');
        } catch { showToast('Hata!', 'error'); }
    };

    const updateStatus = async (r: CustomerRequest, newStatus: CustomerRequest['status']) => {
        try {
            const updated = { ...r, status: newStatus };
            await api.saveCustomerRequest(updated);
            setRequests(requests.map(x => x.id === r.id ? updated : x));
            showToast('Durum güncellendi!');
        } catch { showToast('Hata!', 'error'); }
    };

    const statuses = [
        { id: 'all', label: 'Tümü' }, { id: 'pending', label: 'Beklemede' }, { id: 'found', label: 'Bulundu' },
        { id: 'notified', label: 'Bildirildi' }, { id: 'completed', label: 'Tamamlandı' }, { id: 'cancelled', label: 'İptal' }
    ];

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            <div className="flex justify-between items-center">
                <div><h2 className="text-2xl font-bold text-white">İstek & Siparişler</h2><p className="text-slate-400 text-sm mt-1">Müşteri istek ve sipariş takibi</p></div>
                <button onClick={openCreate} className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium shadow-lg shadow-primary/25 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">add</span>Yeni İstek
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 items-center bg-surface-dark border border-slate-700/50 p-4 rounded-xl">
                <div className="relative w-64">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Müşteri, ürün..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-primary outline-none" />
                </div>
                <div className="flex gap-2 ml-auto">
                    {statuses.map(s => (
                        <button key={s.id} onClick={() => setStatusFilter(s.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s.id ? 'bg-primary text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Kanban-style cards */}
            <div className="grid gap-4">
                {filtered.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 bg-surface-dark rounded-xl border border-slate-700/50">
                        <span className="material-symbols-outlined text-6xl mb-4 block">inbox</span><p>İstek yok</p>
                        <button onClick={openCreate} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm">İlk İsteği Ekle</button>
                    </div>
                ) : filtered.map(r => {
                    const st = getRequestStatusInfo(r.status);
                    return (
                        <div key={r.id} className="bg-surface-dark border border-slate-700/50 rounded-xl p-5 hover:bg-surface-hover/30 transition-colors">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h4 className="font-semibold text-white">{r.productName}</h4>
                                        {r.priority === 'urgent' && <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400 font-medium">🔥 Acil</span>}
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                                    </div>
                                    <div className="flex gap-4 text-sm text-slate-400">
                                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">person</span>{r.customerName}</span>
                                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">phone</span>{r.phoneNumber || '—'}</span>
                                        {r.estimatedBudget > 0 && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">payments</span>{fp(r.estimatedBudget)}</span>}
                                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">calendar_today</span>{formatDate(r.createdAt)}</span>
                                    </div>
                                    {r.notes && <p className="text-sm text-slate-500 mt-2">{r.notes}</p>}
                                </div>
                                <div className="flex items-center gap-1 ml-4">
                                    {/* Status advance buttons */}
                                    {r.status === 'pending' && <button onClick={() => updateStatus(r, 'found')} className="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20">Bulundu</button>}
                                    {r.status === 'found' && <button onClick={() => updateStatus(r, 'notified')} className="px-2 py-1 text-xs bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500/20">Bildirildi</button>}
                                    {r.status === 'notified' && <button onClick={() => updateStatus(r, 'completed')} className="px-2 py-1 text-xs bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20">Tamamla</button>}
                                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary"><span className="material-symbols-outlined text-lg">edit</span></button>
                                    <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400"><span className="material-symbols-outlined text-lg">delete</span></button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-lg animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">{editing ? 'İstek Düzenle' : 'Yeni İstek'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Müşteri Adı *</label>
                                    <input type="text" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Telefon</label>
                                    <input type="text" value={form.phoneNumber} onChange={e => setForm({ ...form, phoneNumber: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none" /></div>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">İstenen Ürün *</label>
                                <input type="text" value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none" /></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Tahmini Bütçe</label>
                                    <input type="number" value={form.estimatedBudget} onChange={e => setForm({ ...form, estimatedBudget: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Öncelik</label>
                                    <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as 'normal' | 'urgent' })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none">
                                        <option value="normal">Normal</option><option value="urgent">Acil</option>
                                    </select></div>
                            </div>
                            {editing && (
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Durum</label>
                                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as CustomerRequest['status'] })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none">
                                        <option value="pending">Beklemede</option><option value="found">Bulundu</option><option value="notified">Bildirildi</option>
                                        <option value="completed">Tamamlandı</option><option value="cancelled">İptal</option>
                                    </select></div>
                            )}
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Notlar</label>
                                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none resize-none" /></div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium shadow-lg shadow-primary/25">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
