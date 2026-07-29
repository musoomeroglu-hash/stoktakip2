import { useState } from 'react';
import type { RepairRecord, RepairReturn } from '../types';
import { formatDate, generateId } from '../utils/helpers';
import { computeRepairProfit, returnsTotal, getCommissionRate } from '../utils/repairMath';
import { useFormatPrice } from './PriceVisibility';
import { useToast } from './Toast';
import * as api from '../utils/api';

const TYPE_LABELS: Record<RepairReturn['type'], string> = {
    iade: 'İade',
    degisim: 'Değişim',
};

interface RepairReturnModalProps {
    repair: RepairRecord;
    onSaved: (updated: RepairRecord) => void;
    onClose: () => void;
}

export default function RepairReturnModal({ repair, onSaved, onClose }: RepairReturnModalProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState((repair.returns || []).length === 0);
    const [form, setForm] = useState({
        type: 'iade' as RepairReturn['type'],
        date: new Date().toISOString().slice(0, 10),
        reason: '',
        refundAmount: 0,
        replacementDevice: '',
        notes: '',
    });

    const returns = repair.returns || [];
    const total = returnsTotal(repair);
    const remainingRefundable = (repair.repairCost || 0) - total;

    /** Tek yazma noktası: iade listesi değişince kâr da yeniden hesaplanır. */
    const persist = async (nextReturns: RepairReturn[], successMessage: string) => {
        setSaving(true);
        try {
            const updated: RepairRecord = {
                ...repair,
                returns: nextReturns,
                profit: computeRepairProfit({
                    repairCost: repair.repairCost,
                    partsCost: repair.partsCost,
                    paymentMethod: repair.paymentMethod,
                    commissionRate: getCommissionRate(),
                    returnsTotal: returnsTotal({ returns: nextReturns }),
                }),
            };
            await api.saveRepair(updated);
            onSaved(updated);
            showToast(successMessage);
        } catch (err) {
            console.error('Repair return save error:', err);
            showToast('İşlem kaydedilemedi!', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleAdd = async () => {
        if (!form.reason.trim()) {
            showToast('İade sebebi zorunlu!', 'error');
            return;
        }
        const amount = Number(form.refundAmount) || 0;
        if (amount < 0) {
            showToast('İade tutarı negatif olamaz!', 'error');
            return;
        }
        if (amount > remainingRefundable) {
            showToast(`İade tutarı kalan tutarı (${fp(remainingRefundable)}) aşamaz!`, 'error');
            return;
        }
        if (form.type === 'degisim' && !form.replacementDevice.trim() && amount === 0) {
            showToast('Değişimde verilen cihazı yazın veya bir tutar girin!', 'error');
            return;
        }

        const entry: RepairReturn = {
            id: generateId(),
            type: form.type,
            date: new Date(form.date).toISOString(),
            reason: form.reason.trim(),
            refundAmount: amount,
            replacementDevice: form.replacementDevice.trim() || undefined,
            notes: form.notes.trim() || undefined,
        };
        await persist([...returns, entry], `${TYPE_LABELS[form.type]} kaydedildi!`);
        setForm({ type: 'iade', date: new Date().toISOString().slice(0, 10), reason: '', refundAmount: 0, replacementDevice: '', notes: '' });
        setShowForm(false);
    };

    const handleRemove = (id: string) => persist(returns.filter(r => r.id !== id), 'İşlem silindi!');

    const inputClass = 'w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-orange-500 outline-none';
    const labelClass = 'block text-sm font-medium text-slate-300 mb-1';

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-slate-700">
                    <div>
                        <h3 className="text-lg font-bold text-white">İade / Değişim</h3>
                        <p className="text-sm text-slate-400">{repair.customerName} — {repair.deviceInfo}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Özet */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-800/50 rounded-xl p-3">
                            <p className="text-xs text-slate-500">Tamir Ücreti</p>
                            <p className="text-sm font-bold text-white">{fp(repair.repairCost)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-3">
                            <p className="text-xs text-slate-500">Toplam İade</p>
                            <p className="text-sm font-bold text-orange-400">{fp(total)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-3">
                            <p className="text-xs text-slate-500">Net Kâr</p>
                            <p className="text-sm font-bold text-emerald-400">{fp(repair.profit)}</p>
                        </div>
                    </div>

                    {/* Mevcut işlemler */}
                    {returns.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kayıtlı İşlemler</p>
                            {returns.map(r => (
                                <div key={r.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.type === 'iade' ? 'bg-orange-500/20 text-orange-400' : 'bg-violet-500/20 text-violet-400'}`}>
                                                {TYPE_LABELS[r.type]}
                                            </span>
                                            <span className="text-xs text-slate-500">{formatDate(r.date)}</span>
                                            {r.refundAmount > 0 && <span className="text-sm font-semibold text-orange-400">-{fp(r.refundAmount)}</span>}
                                        </div>
                                        <p className="text-sm text-slate-300 mt-1 break-words">{r.reason}</p>
                                        {r.replacementDevice && <p className="text-xs text-slate-400 mt-0.5">Verilen cihaz: {r.replacementDevice}</p>}
                                        {r.notes && <p className="text-xs text-slate-500 mt-0.5">{r.notes}</p>}
                                    </div>
                                    <button onClick={() => handleRemove(r.id)} disabled={saving} title="Sil"
                                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 disabled:opacity-50 flex-shrink-0">
                                        <span className="material-symbols-outlined text-lg">delete</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Yeni işlem formu */}
                    {showForm ? (
                        <div className="space-y-4 border-t border-slate-700 pt-5">
                            <div>
                                <label className={labelClass}>İşlem Tipi</label>
                                <div className="flex gap-2">
                                    {(['iade', 'degisim'] as const).map(t => (
                                        <button key={t} onClick={() => setForm({ ...form, type: t })}
                                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${form.type === t ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                                            {TYPE_LABELS[t]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Tarih</label>
                                    <input type="date" value={form.date}
                                        onChange={e => setForm({ ...form, date: e.target.value })} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>İade Tutarı</label>
                                    <input type="number" min={0} max={remainingRefundable} value={form.refundAmount}
                                        onChange={e => setForm({ ...form, refundAmount: Number(e.target.value) })} className={inputClass} />
                                    <p className="text-xs text-slate-500 mt-1">En fazla {fp(remainingRefundable)}</p>
                                </div>
                            </div>

                            <div>
                                <label className={labelClass}>Sebep *</label>
                                <input type="text" value={form.reason} placeholder="Örn. Aynı arıza tekrarladı"
                                    onChange={e => setForm({ ...form, reason: e.target.value })} className={inputClass} />
                            </div>

                            {form.type === 'degisim' && (
                                <div>
                                    <label className={labelClass}>Verilen Cihaz</label>
                                    <input type="text" value={form.replacementDevice} placeholder="Örn. iPhone 11 128GB"
                                        onChange={e => setForm({ ...form, replacementDevice: e.target.value })} className={inputClass} />
                                </div>
                            )}

                            <div>
                                <label className={labelClass}>Notlar</label>
                                <textarea rows={2} value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })} className={inputClass} />
                            </div>

                            <div className="flex justify-end gap-3">
                                {returns.length > 0 && (
                                    <button onClick={() => setShowForm(false)}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-400 hover:bg-surface-hover">
                                        Vazgeç
                                    </button>
                                )}
                                <button onClick={handleAdd} disabled={saving}
                                    className="px-6 py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/25 disabled:opacity-50">
                                    {saving ? 'Kaydediliyor...' : 'İşlemi Kaydet'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setShowForm(true)}
                            className="w-full py-2.5 border border-dashed border-slate-600 hover:border-orange-500 text-slate-400 hover:text-orange-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                            <span className="material-symbols-outlined text-lg">add</span> Yeni İade / Değişim
                        </button>
                    )}
                </div>

                <div className="flex justify-end p-6 border-t border-slate-700">
                    <button onClick={onClose} className="px-6 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700">
                        Kapat
                    </button>
                </div>
            </div>
        </div>
    );
}
