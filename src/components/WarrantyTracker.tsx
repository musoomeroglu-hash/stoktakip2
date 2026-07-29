import { useState, useEffect } from 'react';
import type { WarrantyRecord, WarrantyStatus } from '../types';
import * as api from '../utils/api';
import WarrantyModal from './WarrantyModal';

function getWarrantyStatus(endDate: string): { status: WarrantyStatus; daysRemaining: number } {
    const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
    return { status: days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'active', daysRemaining: days };
}

export default function WarrantyTracker() {
    const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
    const [filter, setFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all');
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<WarrantyRecord | null>(null);

    useEffect(() => {
        api.getWarrantyRecords()
            .then(setWarranties)
            .catch(console.warn)
            .finally(() => setLoading(false));
    }, []);

    const expiring = warranties.filter(w => getWarrantyStatus(w.warrantyEndDate).status === 'expiring');
    const filtered = warranties.filter(w => {
        if (filter === 'all') return true;
        return getWarrantyStatus(w.warrantyEndDate).status === filter;
    });

    const counts = {
        all: warranties.length,
        active: warranties.filter(w => getWarrantyStatus(w.warrantyEndDate).status === 'active').length,
        expiring: expiring.length,
        expired: warranties.filter(w => getWarrantyStatus(w.warrantyEndDate).status === 'expired').length,
    };

    const statusColors: Record<string, string> = {
        active: 'bg-green-500/10 border-green-500 text-green-400',
        expiring: 'bg-yellow-500/10 border-yellow-500 text-yellow-400',
        expired: 'bg-red-500/10 border-red-500 text-red-400',
    };
    const barColors: Record<string, string> = {
        active: 'bg-green-500',
        expiring: 'bg-yellow-500',
        expired: 'bg-red-500',
    };

    const handleSaved = (saved: WarrantyRecord) => {
        setWarranties(prev => {
            const exists = prev.some(w => w.id === saved.id);
            const next = exists ? prev.map(w => (w.id === saved.id ? saved : w)) : [...prev, saved];
            return next.sort((a, b) => new Date(a.warrantyEndDate).getTime() - new Date(b.warrantyEndDate).getTime());
        });
    };

    const handleDeleted = (id: string) => setWarranties(prev => prev.filter(w => w.id !== id));

    const openCreate = () => { setEditing(null); setShowModal(true); };
    const openEdit = (w: WarrantyRecord) => { setEditing(w); setShowModal(true); };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-xl font-bold text-white">Garanti Takibi</h2>
                    <p className="text-sm text-slate-400">Tamir ve satışlara verilen garantilerin kalan süreleri</p>
                </div>
                <button onClick={openCreate}
                    className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 flex items-center gap-2 transition-colors">
                    <span className="material-symbols-outlined text-lg">add</span>
                    Yeni Garanti
                </button>
            </div>

            {expiring.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-yellow-400 font-bold mb-2">
                        <span className="material-symbols-outlined">warning</span>
                        {expiring.length} garanti yakında dolacak!
                    </div>
                    {expiring.slice(0, 3).map(w => (
                        <p key={w.id} className="text-yellow-300 text-sm">
                            • {w.serialNumber || w.imei || 'Seri No Yok'} — {getWarrantyStatus(w.warrantyEndDate).daysRemaining} gün kaldı
                        </p>
                    ))}
                </div>
            )}

            <div className="flex gap-2 flex-wrap">
                {(['all', 'active', 'expiring', 'expired'] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}>
                        {{ all: 'Tümü', active: 'Aktif', expiring: 'Dolmak Üzere', expired: 'Süresi Dolmuş' }[f]} ({counts[f]})
                    </button>
                ))}
            </div>

            <div className="space-y-3">
                {filtered.map(w => {
                    const { status, daysRemaining } = getWarrantyStatus(w.warrantyEndDate);
                    const totalDays = Math.max(1, (w.warrantyMonths || 1) * 30);
                    const percent = Math.max(0, Math.min(100, (daysRemaining / totalDays) * 100));
                    return (
                        <div key={w.id} className={`p-4 rounded-xl border-2 ${statusColors[status]}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-white truncate">{w.serialNumber || w.imei || 'Seri No Yok'}</p>
                                    <p className="text-sm opacity-70">
                                        {w.itemType === 'phone' ? '📱 Telefon' : w.itemType === 'repair' ? '🔧 Tamir' : '📦 Ürün'}
                                        {w.customerName && ` · ${w.customerName}`}
                                        {w.warrantyMonths ? ` · ${w.warrantyMonths} ay` : ''}
                                    </p>
                                </div>
                                <div className="flex items-start gap-2 flex-shrink-0">
                                    <div className="text-right">
                                        <p className="text-sm font-bold">
                                            {daysRemaining > 0 ? `${daysRemaining} gün kaldı` : `${Math.abs(daysRemaining)} gün önce doldu`}
                                        </p>
                                        <p className="text-xs opacity-60">Bitiş: {new Date(w.warrantyEndDate).toLocaleDateString('tr-TR')}</p>
                                    </div>
                                    <button onClick={() => openEdit(w)} title="Düzenle"
                                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white">
                                        <span className="material-symbols-outlined text-lg">edit</span>
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 h-1.5 rounded-full bg-black/20 overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${barColors[status]}`} style={{ width: `${percent}%` }} />
                            </div>
                        </div>
                    );
                })}
                {loading && <p className="text-slate-500 text-center py-8">Yükleniyor...</p>}
                {!loading && filtered.length === 0 && <p className="text-slate-500 text-center py-8">Kayıt bulunamadı</p>}
            </div>

            {showModal && (
                <WarrantyModal
                    existing={editing}
                    onSaved={handleSaved}
                    onDeleted={handleDeleted}
                    onClose={() => { setShowModal(false); setEditing(null); }}
                />
            )}
        </div>
    );
}
