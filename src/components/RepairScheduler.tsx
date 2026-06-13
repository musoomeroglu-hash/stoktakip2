import { useState, useEffect } from 'react';
import * as api from '../utils/api';
import type { Technician } from '../types';

type Priority = 'low' | 'normal' | 'high' | 'urgent';

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
    low: { label: 'Düşük', color: 'bg-slate-600' },
    normal: { label: 'Normal', color: 'bg-blue-600' },
    high: { label: 'Yüksek', color: 'bg-orange-500' },
    urgent: { label: 'Acil', color: 'bg-red-600' },
};

interface Props {
    onSet: (data: { technicianId: string; technicianName: string; estimatedHours: number; estimatedCompletionDate: string; priority: Priority }) => void;
    initial?: { technicianId?: string; estimatedHours?: number; priority?: Priority };
}

export default function RepairScheduler({ onSet, initial }: Props) {
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [techId, setTechId] = useState(initial?.technicianId || '');
    const [hours, setHours] = useState(initial?.estimatedHours || 2);
    const [priority, setPriority] = useState<Priority>(initial?.priority || 'normal');

    useEffect(() => { api.getTechnicians().then(setTechnicians).catch(console.warn); }, []);

    const calcEstimatedDate = (h: number, p: Priority): Date => {
        let days = Math.ceil(h / 8);
        if (p === 'urgent') days = Math.max(1, Math.floor(days / 2));
        if (p === 'high') days = Math.max(1, Math.ceil(days * 0.75));
        if (p === 'low') days = Math.ceil(days * 1.5);
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date;
    };

    const estimatedDate = calcEstimatedDate(hours, priority);

    const handleSave = () => {
        const tech = technicians.find(t => t.id === techId);
        if (!tech) return;
        onSet({ technicianId: tech.id, technicianName: tech.name, estimatedHours: hours, estimatedCompletionDate: estimatedDate.toISOString(), priority });
    };

    return (
        <div className="space-y-4 bg-slate-800/50 rounded-xl p-4">
            <div>
                <label className="block text-sm text-slate-400 mb-1">Teknisyen</label>
                <select value={techId} onChange={e => setTechId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white">
                    <option value="">Teknisyen Seç</option>
                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name} · ⭐{t.averageRating.toFixed(1)}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm text-slate-400 mb-1">Tahmini Süre (Saat)</label>
                <input type="number" value={hours} min={0.5} step={0.5}
                    onChange={e => setHours(parseFloat(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
                <label className="block text-sm text-slate-400 mb-2">Öncelik</label>
                <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => (
                        <button key={p} onClick={() => setPriority(p)}
                            className={`py-2 rounded-lg text-white text-sm font-medium transition-all ${priority === p ? PRIORITY_CONFIG[p].color : 'bg-slate-700 opacity-50'
                                }`}>
                            {PRIORITY_CONFIG[p].label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">event</span>
                <div>
                    <p className="text-slate-400 text-xs">Tahmini Teslim Tarihi</p>
                    <p className="text-white font-bold">{estimatedDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <p className="text-slate-400 text-xs">{Math.ceil(hours / 8)} iş günü · {hours} saat</p>
                </div>
            </div>
            <button onClick={handleSave} disabled={!techId}
                className="w-full py-3 bg-primary text-white rounded-xl hover:bg-primary/80 disabled:opacity-40 font-medium">
                Planlamayı Kaydet
            </button>
        </div>
    );
}
