import { useState, useEffect, useMemo } from 'react';
import type { RepairPart } from '../types';
import * as api from '../utils/api';
import { useToast } from '../components/Toast';

export default function RepairPartsPage() {
    const { showToast } = useToast();
    const [parts, setParts] = useState<RepairPart[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('all');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<RepairPart | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const [form, setForm] = useState({
        partName: '', partNumber: '', category: '', compatibleDevices: '',
        stockQuantity: 0, minStock: 1, unitCost: 0, unitPrice: 0, location: ''
    });

    useEffect(() => { loadParts(); }, []);

    const loadParts = async () => {
        setLoading(true);
        try {
            const data = await api.getRepairParts();
            setParts(data as RepairPart[]);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const categories = useMemo(() => {
        const cats = new Set(parts.map(p => p.category || 'Diğer'));
        return Array.from(cats).sort();
    }, [parts]);

    const filtered = useMemo(() => {
        return parts.filter(p => {
            const matchSearch = !search || (p.partName || '').toLowerCase().includes(search.toLowerCase())
                || (p.partNumber || '').toLowerCase().includes(search.toLowerCase())
                || (p.compatibleDevices || []).join(' ').toLowerCase().includes(search.toLowerCase());
            const matchCat = catFilter === 'all' || (p.category || 'Diğer') === catFilter;
            return matchSearch && matchCat;
        });
    }, [parts, search, catFilter]);

    const lowStockCount = useMemo(() => parts.filter(p => p.stockQuantity <= p.minStock).length, [parts]);
    const totalValue = useMemo(() => parts.reduce((s, p) => s + p.stockQuantity * p.unitCost, 0), [parts]);

    const openCreate = () => {
        setEditing(null);
        setForm({ partName: '', partNumber: '', category: '', compatibleDevices: '', stockQuantity: 0, minStock: 1, unitCost: 0, unitPrice: 0, location: '' });
        setShowModal(true);
    };

    const openEdit = (p: RepairPart) => {
        setEditing(p);
        setForm({
            partName: p.partName, partNumber: p.partNumber || '', category: p.category || '',
            compatibleDevices: (p.compatibleDevices || []).join(', '),
            stockQuantity: p.stockQuantity, minStock: p.minStock, unitCost: p.unitCost, unitPrice: p.unitPrice,
            location: p.location || ''
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.partName.trim()) { showToast('Parça adı gerekli', 'error'); return; }
        try {
            const payload: Record<string, unknown> = {
                partName: form.partName, partNumber: form.partNumber, category: form.category,
                compatibleDevices: form.compatibleDevices.split(',').map(s => s.trim()).filter(Boolean),
                stockQuantity: form.stockQuantity, minStock: form.minStock,
                unitCost: form.unitCost, unitPrice: form.unitPrice, location: form.location, isActive: true,
            };
            if (editing) payload.id = editing.id;
            await api.saveRepairPart(payload);
            showToast(editing ? 'Parça güncellendi' : 'Parça eklendi', 'success');
            setShowModal(false);
            loadParts();
        } catch { showToast('Hata oluştu', 'error'); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            // Soft delete - isActive = false
            await api.saveRepairPart({ id: deleteTarget, isActive: false });
            showToast('Parça silindi', 'success');
            setDeleteTarget(null);
            loadParts();
        } catch { showToast('Silme hatası', 'error'); }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-500 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-slate-400 text-sm">Parça verileri yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Tamir Parçaları Stok</h2>
                    <p className="text-slate-400 text-sm mt-1">Tamir parçalarını yönetin ve stok takibi yapın</p>
                </div>
                <button onClick={openCreate}
                    className="px-5 py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium shadow-lg shadow-purple-500/25 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">add</span>Yeni Parça Ekle
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface border border-slate-800 rounded-xl p-4">
                    <p className="text-slate-400 text-xs mb-1">Toplam Parça Çeşidi</p>
                    <p className="text-2xl font-bold text-white">{parts.length}</p>
                </div>
                <div className="bg-surface border border-slate-800 rounded-xl p-4">
                    <p className="text-slate-400 text-xs mb-1">Toplam Stok Adedi</p>
                    <p className="text-2xl font-bold text-blue-400">{parts.reduce((s, p) => s + p.stockQuantity, 0)}</p>
                </div>
                <div className="bg-surface border border-slate-800 rounded-xl p-4">
                    <p className="text-slate-400 text-xs mb-1">Stok Değeri</p>
                    <p className="text-2xl font-bold text-emerald-400">₺{totalValue.toLocaleString('tr-TR')}</p>
                </div>
                <div className={`bg-surface border rounded-xl p-4 ${lowStockCount > 0 ? 'border-red-500/50' : 'border-slate-800'}`}>
                    <p className="text-slate-400 text-xs mb-1">Düşük Stok Uyarısı</p>
                    <p className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{lowStockCount}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Parça adı, numara veya uyumlu cihaz ara..."
                        className="w-full pl-10 pr-4 py-2.5 bg-surface border border-slate-700 rounded-lg text-white text-sm focus:border-purple-500 outline-none" />
                </div>
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                    className="bg-surface border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:border-purple-500 outline-none">
                    <option value="all">Tüm Kategoriler</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {/* Parts Table */}
            <div className="bg-surface border border-slate-800 rounded-xl overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <span className="material-symbols-outlined text-5xl text-slate-600 mb-3 block">construction</span>
                        <p className="text-slate-400">Parça bulunamadı</p>
                        <button onClick={openCreate} className="mt-4 px-4 py-2 bg-purple-500/10 text-purple-400 rounded-lg text-sm hover:bg-purple-500/20">
                            İlk parçayı ekle
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                                    <th className="text-left p-4">Parça</th>
                                    <th className="text-left p-4">Kategori</th>
                                    <th className="text-left p-4">Uyumlu Cihazlar</th>
                                    <th className="text-center p-4">Stok</th>
                                    <th className="text-right p-4">Maliyet</th>
                                    <th className="text-right p-4">Satış Fiyatı</th>
                                    <th className="text-left p-4">Konum</th>
                                    <th className="text-center p-4">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => (
                                    <tr key={p.id} className="border-b border-slate-800 hover:bg-surface-hover transition-colors">
                                        <td className="p-4">
                                            <p className="text-white font-medium">{p.partName}</p>
                                            {p.partNumber && <p className="text-slate-500 text-xs mt-0.5">{p.partNumber}</p>}
                                        </td>
                                        <td className="p-4">
                                            <span className="px-2 py-1 bg-slate-800 rounded-lg text-xs text-slate-300">{p.category || 'Diğer'}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1">
                                                {(p.compatibleDevices || []).slice(0, 3).map((d, i) => (
                                                    <span key={i} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs">{d}</span>
                                                ))}
                                                {(p.compatibleDevices || []).length > 3 && (
                                                    <span className="text-xs text-slate-500">+{(p.compatibleDevices || []).length - 3}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`font-bold ${p.stockQuantity <= p.minStock ? 'text-red-400' : p.stockQuantity <= p.minStock * 2 ? 'text-amber-400' : 'text-green-400'}`}>
                                                {p.stockQuantity}
                                            </span>
                                            <span className="text-slate-500 text-xs ml-1">/ min {p.minStock}</span>
                                        </td>
                                        <td className="p-4 text-right text-slate-300">₺{p.unitCost.toFixed(2)}</td>
                                        <td className="p-4 text-right text-emerald-400 font-medium">₺{p.unitPrice.toFixed(2)}</td>
                                        <td className="p-4 text-slate-400 text-xs">{p.location || '—'}</td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-1">
                                                <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-slate-400 hover:text-amber-400">
                                                    <span className="material-symbols-outlined text-lg">edit</span>
                                                </button>
                                                <button onClick={() => setDeleteTarget(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400">
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-full max-w-lg animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-white">{editing ? 'Parça Düzenle' : 'Yeni Parça Ekle'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-400">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Parça Adı *</label>
                                <input type="text" value={form.partName} onChange={e => setForm({ ...form, partName: e.target.value })}
                                    placeholder="Örn: iPhone 14 Pro Max Ekran" className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-purple-500 outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Parça Numarası</label>
                                    <input type="text" value={form.partNumber} onChange={e => setForm({ ...form, partNumber: e.target.value })}
                                        placeholder="SKU / Parça No" className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-purple-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Kategori</label>
                                    <input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                                        placeholder="Ekran, Batarya, vb." className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-purple-500 outline-none" list="cat-suggestions" />
                                    <datalist id="cat-suggestions">
                                        {['Ekran', 'Batarya', 'Kamera', 'Şarj Soketi', 'Hoparlör', 'Mikrofon', 'Anakart', 'Kasa', 'Arka Kapak', 'Tuş Takımı', 'Flex Kablo', 'Sim Kart Yuvası', 'Diğer'].map(c => (
                                            <option key={c} value={c} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Uyumlu Cihazlar</label>
                                <input type="text" value={form.compatibleDevices} onChange={e => setForm({ ...form, compatibleDevices: e.target.value })}
                                    placeholder="iPhone 14 Pro, iPhone 14 Pro Max (virgülle ayırın)" className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-purple-500 outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Stok Adedi</label>
                                    <input type="number" min={0} value={form.stockQuantity} onChange={e => setForm({ ...form, stockQuantity: +e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-purple-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Minimum Stok</label>
                                    <input type="number" min={0} value={form.minStock} onChange={e => setForm({ ...form, minStock: +e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-purple-500 outline-none" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Maliyet (₺)</label>
                                    <input type="number" min={0} step={0.01} value={form.unitCost} onChange={e => setForm({ ...form, unitCost: +e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-purple-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Satış Fiyatı (₺)</label>
                                    <input type="number" min={0} step={0.01} value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: +e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-purple-500 outline-none" />
                                </div>
                            </div>
                            {form.unitCost > 0 && form.unitPrice > 0 && (
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-400">trending_up</span>
                                    <span className="text-emerald-400 text-sm font-medium">
                                        Kâr Marjı: ₺{(form.unitPrice - form.unitCost).toFixed(2)} ({((form.unitPrice - form.unitCost) / form.unitCost * 100).toFixed(0)}%)
                                    </span>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Konum / Raf</label>
                                <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                                    placeholder="Raf A-3, Çekmece 2, vb." className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-purple-500 outline-none" />
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-700 flex gap-3">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium">İptal</button>
                            <button onClick={handleSave} className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-purple-500/25">
                                {editing ? 'Güncelle' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl p-6 w-full max-w-sm animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-red-400 text-3xl">delete_forever</span>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Parçayı Sil?</h3>
                            <p className="text-slate-400 text-sm mb-6">Bu parça stok listesinden kaldırılacak.</p>
                            <div className="flex gap-3">
                                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium">Vazgeç</button>
                                <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium">Sil</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
