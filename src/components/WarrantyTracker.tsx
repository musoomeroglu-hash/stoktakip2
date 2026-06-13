import { useState, useEffect } from 'react';
import type { WarrantyRecord, WarrantyStatus } from '../types';
import * as api from '../utils/api';

function getWarrantyStatus(endDate: string): { status: WarrantyStatus; daysRemaining: number } {
    const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
    return { status: days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'active', daysRemaining: days };
}

export default function WarrantyTracker() {
    const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
    const [filter, setFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all');

    useEffect(() => {
        api.getWarrantyRecords().then(setWarranties).catch(console.warn);
    }, []);

    const expiring = warranties.filter(w => getWarrantyStatus(w.warrantyEndDate).status === 'expiring');
    const filtered = warranties.filter(w => {
        if (filter === 'all') return true;
        return getWarrantyStatus(w.warrantyEndDate).status === filter;
    });

    const statusColors: Record<string, string> = {
        active: 'bg-green-500/10 border-green-500 text-green-400',
        expiring: 'bg-yellow-500/10 border-yellow-500 text-yellow-400',
        expired: 'bg-red-500/10 border-red-500 text-red-400',
    };

    return (
        <div className="space-y-4">
            {expiring.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-yellow-400 font-bold mb-2">
                        <span className="material-symbols-outlined">warning</span>
                        {expiring.length} garanti yakında dolacak!
                    </div>
                    {expiring.slice(0, 3).map(w => (
                        <p key={w.id} className="text-yellow-300 text-sm">
                            • {w.serialNumber || w.imei} — {w.daysRemaining} gün kaldı
                        </p>
                    ))}
                </div>
            )}
            <div className="flex gap-2 flex-wrap">
                {(['all', 'active', 'expiring', 'expired'] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}>
                        {{ all: 'Tümü', active: 'Aktif', expiring: 'Dolmak Üzere', expired: 'Süresi Dolmuş' }[f]}
                    </button>
                ))}
            </div>
            <div className="space-y-3">
                {filtered.map(w => {
                    const { status, daysRemaining } = getWarrantyStatus(w.warrantyEndDate);
                    return (
                        <div key={w.id} className={`p-4 rounded-xl border-2 ${statusColors[status]}`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="font-bold text-white">{w.serialNumber || w.imei || 'Seri No Yok'}</p>
                                    <p className="text-sm opacity-70">
                                        {w.itemType === 'phone' ? '📱 Telefon' : w.itemType === 'repair' ? '🔧 Tamir' : '📦 Ürün'}
                                        {w.customerName && ` · ${w.customerName}`}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold">
                                        {daysRemaining > 0 ? `${daysRemaining} gün kaldı` : `${Math.abs(daysRemaining)} gün önce doldu`}
                                    </p>
                                    <p className="text-xs opacity-60">Bitiş: {new Date(w.warrantyEndDate).toLocaleDateString('tr-TR')}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {filtered.length === 0 && <p className="text-slate-500 text-center py-8">Kayıt bulunamadı</p>}
            </div>
        </div>
    );
}
