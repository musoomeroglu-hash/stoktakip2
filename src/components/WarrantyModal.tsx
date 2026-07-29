import { useState } from 'react';
import type { WarrantyRecord } from '../types';
import * as api from '../utils/api';
import { useToast } from './Toast';

const QUICK_MONTHS = [3, 6, 12, 24];

const ITEM_TYPE_LABELS: Record<WarrantyRecord['itemType'], string> = {
    repair: '🔧 Tamir',
    phone: '📱 Telefon',
    product: '📦 Ürün',
};

/** Supabase `date` kolonları YYYY-MM-DD bekliyor. */
function toDateInput(value?: string): string {
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, months: number): string {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    // 31 Ocak + 1 ay → 3 Mart olmasın, ayın son gününe sabitle
    if (d.getDate() < day) d.setDate(0);
    return d.toISOString().slice(0, 10);
}

interface WarrantyModalProps {
    /** Tamir/telefon kaydından açıldığında sabitlenir; Garanti Takibi'nden açıldığında serbest bırakılır. */
    lockedItem?: { itemType: WarrantyRecord['itemType']; itemId: string };
    defaults?: Partial<Pick<WarrantyRecord, 'imei' | 'serialNumber' | 'customerName' | 'customerPhone' | 'purchaseDate'>>;
    existing?: WarrantyRecord | null;
    onSaved: (record: WarrantyRecord) => void;
    onDeleted?: (id: string) => void;
    onClose: () => void;
}

export default function WarrantyModal({ lockedItem, defaults, existing, onSaved, onDeleted, onClose }: WarrantyModalProps) {
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const [form, setForm] = useState(() => {
        // Garanti, cihazın müşteriye teslim edildiği tarihte başlar — bugünde değil.
        const start = toDateInput(existing?.warrantyStartDate || defaults?.purchaseDate);
        const months = existing?.warrantyMonths ?? 3;
        return {
            itemType: (existing?.itemType || lockedItem?.itemType || 'repair') as WarrantyRecord['itemType'],
            itemId: existing?.itemId || lockedItem?.itemId || '',
            serialNumber: existing?.serialNumber || defaults?.serialNumber || '',
            imei: existing?.imei || defaults?.imei || '',
            purchaseDate: toDateInput(existing?.purchaseDate || defaults?.purchaseDate),
            warrantyStartDate: start,
            warrantyEndDate: existing?.warrantyEndDate ? toDateInput(existing.warrantyEndDate) : addMonths(start, months),
            warrantyMonths: months,
            warrantyProvider: existing?.warrantyProvider || '',
            customerName: existing?.customerName || defaults?.customerName || '',
            customerPhone: existing?.customerPhone || defaults?.customerPhone || '',
            notes: existing?.notes || '',
        };
    });

    /** Ay veya başlangıç tarihi değişince bitiş tarihini yeniden hesapla. */
    const setMonths = (months: number) =>
        setForm(f => ({ ...f, warrantyMonths: months, warrantyEndDate: addMonths(f.warrantyStartDate, months) }));

    const setStartDate = (start: string) =>
        setForm(f => ({ ...f, warrantyStartDate: start, warrantyEndDate: addMonths(start, f.warrantyMonths) }));

    const handleSave = async () => {
        if (!form.serialNumber && !form.imei) {
            showToast('Seri no veya IMEI alanlarından biri zorunlu!', 'error');
            return;
        }
        if (form.warrantyMonths <= 0) {
            showToast('Garanti süresi 0 aydan büyük olmalı!', 'error');
            return;
        }
        setSaving(true);
        try {
            const saved = await api.saveWarrantyRecord({
                ...(existing?.id ? { id: existing.id } : {}),
                itemType: form.itemType,
                itemId: form.itemId || form.imei || form.serialNumber,
                serialNumber: form.serialNumber || undefined,
                imei: form.imei || undefined,
                purchaseDate: form.purchaseDate,
                warrantyStartDate: form.warrantyStartDate,
                warrantyEndDate: form.warrantyEndDate,
                warrantyMonths: form.warrantyMonths,
                warrantyProvider: form.warrantyProvider || undefined,
                customerName: form.customerName || undefined,
                customerPhone: form.customerPhone || undefined,
                notes: form.notes || undefined,
            });
            if (!saved) throw new Error('Kayıt dönmedi');
            showToast(existing ? 'Garanti kaydı güncellendi!' : 'Garanti kaydı eklendi!');
            onSaved(saved);
            onClose();
        } catch (err) {
            console.error('Warranty save error:', err);
            showToast('Garanti kaydedilemedi!', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!existing?.id) return;
        setSaving(true);
        try {
            await api.deleteWarrantyRecord(existing.id);
            showToast('Garanti kaydı silindi!');
            onDeleted?.(existing.id);
            onClose();
        } catch (err) {
            console.error('Warranty delete error:', err);
            showToast('Garanti silinemedi!', 'error');
        } finally {
            setSaving(false);
        }
    };

    const inputClass = 'w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none';
    const labelClass = 'block text-sm font-medium text-slate-300 mb-1';

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-slate-700">
                    <h3 className="text-lg font-bold text-white">{existing ? 'Garantiyi Düzenle' : 'Garanti Ekle'}</h3>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {!lockedItem && !existing && (
                        <div>
                            <label className={labelClass}>Kayıt Tipi</label>
                            <div className="flex gap-2">
                                {(Object.keys(ITEM_TYPE_LABELS) as WarrantyRecord['itemType'][]).map(t => (
                                    <button key={t} onClick={() => setForm(f => ({ ...f, itemType: t }))}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${form.itemType === t ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                                        {ITEM_TYPE_LABELS[t]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Seri No</label>
                            <input type="text" value={form.serialNumber}
                                onChange={e => setForm({ ...form, serialNumber: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>IMEI</label>
                            <input type="text" value={form.imei}
                                onChange={e => setForm({ ...form, imei: e.target.value })} className={inputClass} />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Garanti Süresi</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {QUICK_MONTHS.map(m => (
                                <button key={m} onClick={() => setMonths(m)}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${form.warrantyMonths === m ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                                    {m} Ay
                                </button>
                            ))}
                            <input type="number" min={1} value={form.warrantyMonths}
                                onChange={e => setMonths(Number(e.target.value))}
                                className="w-24 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none"
                                title="Özel süre (ay)" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className={labelClass}>Satın Alma</label>
                            <input type="date" value={form.purchaseDate}
                                onChange={e => setForm({ ...form, purchaseDate: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Başlangıç</label>
                            <input type="date" value={form.warrantyStartDate}
                                onChange={e => setStartDate(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Bitiş</label>
                            <input type="date" value={form.warrantyEndDate}
                                onChange={e => setForm({ ...form, warrantyEndDate: e.target.value })} className={inputClass} />
                        </div>
                    </div>

                    <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 text-sm text-slate-300">
                        <span className="material-symbols-outlined text-primary text-base align-middle mr-1">event_available</span>
                        {/* Not: index.html `.text-white`'ı koyuya çeviriyor ama `bg-primary*` kapsayıcı içinde
                            beyaz bırakıyor; bu kutuda text-white kullanılmamalı. */}
                        Garanti <strong className="font-bold">{new Date(form.warrantyEndDate).toLocaleDateString('tr-TR')}</strong> tarihinde sona erecek
                        {' '}({Math.max(0, Math.ceil((new Date(form.warrantyEndDate).getTime() - Date.now()) / 86400000))} gün).
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Müşteri Adı</label>
                            <input type="text" value={form.customerName}
                                onChange={e => setForm({ ...form, customerName: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Telefon</label>
                            <input type="text" value={form.customerPhone}
                                onChange={e => setForm({ ...form, customerPhone: e.target.value })} className={inputClass} />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Garanti Veren</label>
                        <input type="text" value={form.warrantyProvider} placeholder="Örn. Servis Garantisi"
                            onChange={e => setForm({ ...form, warrantyProvider: e.target.value })} className={inputClass} />
                    </div>

                    <div>
                        <label className={labelClass}>Notlar</label>
                        <textarea rows={2} value={form.notes}
                            onChange={e => setForm({ ...form, notes: e.target.value })} className={inputClass} />
                    </div>
                </div>

                <div className="flex justify-between items-center gap-3 p-6 border-t border-slate-700">
                    {existing && onDeleted ? (
                        confirmDelete ? (
                            <button onClick={handleDelete} disabled={saving}
                                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                                Emin misiniz? Sil
                            </button>
                        ) : (
                            <button onClick={() => setConfirmDelete(true)}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-red-400 hover:bg-red-500/10">
                                Sil
                            </button>
                        )
                    ) : <span />}
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-400 hover:bg-surface-hover">
                            İptal
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className="px-6 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/25 disabled:opacity-50">
                            {saving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
