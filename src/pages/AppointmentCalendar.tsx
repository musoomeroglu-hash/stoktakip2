import { useState, useEffect } from 'react';
import * as api from '../utils/api';
import type { RepairAppointment } from '../types';

const HOURS = Array.from({ length: 11 }, (_, i) => `${(i + 9).toString().padStart(2, '0')}:00`);
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    scheduled: { label: 'Planlandı', color: 'bg-blue-500/20 text-blue-400 border-blue-500' },
    confirmed: { label: 'Onaylandı', color: 'bg-green-500/20 text-green-400 border-green-500' },
    in_progress: { label: 'Devam Ediyor', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500' },
    completed: { label: 'Tamamlandı', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500' },
    cancelled: { label: 'İptal', color: 'bg-red-500/20 text-red-400 border-red-500' },
    no_show: { label: 'Gelmedi', color: 'bg-gray-500/20 text-gray-400 border-gray-500' },
};

const emptyForm = {
    customerName: '', customerPhone: '', deviceInfo: '', issueDescription: '',
    appointmentDate: '', appointmentTime: '10:00', durationMinutes: 30,
    technicianId: '', technicianName: '', notes: '',
};

export default function AppointmentCalendar() {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [appointments, setAppointments] = useState<RepairAppointment[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingApt, setEditingApt] = useState<RepairAppointment | null>(null);
    const [form, setForm] = useState({ ...emptyForm, appointmentDate: selectedDate });

    useEffect(() => {
        loadData();
        api.getTechnicians().then(setTechnicians).catch(console.warn);
    }, [selectedDate]);

    const loadData = async () => {
        const start = new Date(selectedDate);
        start.setDate(start.getDate() - start.getDay() + 1);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        try {
            const apts = await api.getAppointments(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
            setAppointments(apts);
        } catch { setAppointments([]); }
    };

    const dayApts = appointments.filter(a => a.appointmentDate === selectedDate)
        .sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime));

    const handleSave = async () => {
        const tech = technicians.find((t: { id: string }) => t.id === form.technicianId);
        await api.saveAppointment({ ...form, ...(editingApt?.id ? { id: editingApt.id } : {}), technicianName: tech?.name || '' });
        setShowForm(false);
        setEditingApt(null);
        setForm({ ...emptyForm, appointmentDate: selectedDate });
        loadData();
    };

    const handleStatusChange = async (apt: RepairAppointment, status: string) => {
        await api.saveAppointment({ ...apt, status });
        loadData();
    };

    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() - d.getDay() + 1 + i);
        return d;
    });

    return (
        <div className="space-y-4">
            <div className="bg-surface rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 7); setSelectedDate(d.toISOString().split('T')[0]); }}
                        className="p-2 hover:bg-slate-700 rounded-lg text-white">
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <h3 className="text-white font-semibold">
                        {new Date(selectedDate).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                    </h3>
                    <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 7); setSelectedDate(d.toISOString().split('T')[0]); }}
                        className="p-2 hover:bg-slate-700 rounded-lg text-white">
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d, i) => (
                        <div key={i} className="text-center text-slate-500 text-xs py-1">{d}</div>
                    ))}
                    {weekDays.map((day, i) => {
                        const ds = day.toISOString().split('T')[0];
                        const dayAptCount = appointments.filter(a => a.appointmentDate === ds).length;
                        const isSelected = ds === selectedDate;
                        const isToday = ds === new Date().toISOString().split('T')[0];
                        return (
                            <button key={i} onClick={() => setSelectedDate(ds)}
                                className={`relative py-2 rounded-xl text-sm font-medium transition-colors ${isSelected ? 'bg-primary text-white' : isToday ? 'bg-primary/20 text-primary' : 'text-slate-300 hover:bg-slate-700'
                                    }`}>
                                {day.getDate()}
                                {dayAptCount > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-orange-400 rounded-full" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="bg-surface rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                    <h3 className="text-white font-semibold">
                        {new Date(selectedDate).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        <span className="ml-2 text-slate-500 text-sm">({dayApts.length} randevu)</span>
                    </h3>
                    <button onClick={() => { setEditingApt(null); setForm({ ...emptyForm, appointmentDate: selectedDate }); setShowForm(true); }}
                        className="px-3 py-1.5 bg-primary text-white rounded-xl text-sm hover:bg-primary/80 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">add</span> Randevu Ekle
                    </button>
                </div>
                <div className="overflow-y-auto max-h-[500px]">
                    {HOURS.map(hour => {
                        const hourApts = dayApts.filter(a => a.appointmentTime.startsWith(hour.split(':')[0]));
                        return (
                            <div key={hour} className="flex border-b border-slate-800">
                                <div className="w-16 flex-shrink-0 p-3 text-slate-500 text-xs text-right border-r border-slate-800">{hour}</div>
                                <div className="flex-1 p-2 min-h-12">
                                    {hourApts.map(apt => {
                                        const cfg = STATUS_CONFIG[apt.status] || STATUS_CONFIG.scheduled;
                                        return (
                                            <div key={apt.id}
                                                className={`mb-1 p-2 rounded-lg border ${cfg.color} cursor-pointer`}
                                                onClick={() => { setEditingApt(apt); setForm({ customerName: apt.customerName, customerPhone: apt.customerPhone, deviceInfo: apt.deviceInfo, issueDescription: apt.issueDescription || '', appointmentDate: apt.appointmentDate, appointmentTime: apt.appointmentTime, durationMinutes: apt.durationMinutes, technicianId: apt.technicianId || '', technicianName: apt.technicianName || '', notes: apt.notes || '' }); setShowForm(true); }}>
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-sm truncate">{apt.customerName}</p>
                                                        <p className="text-xs opacity-70 truncate">{apt.deviceInfo}</p>
                                                        {apt.technicianName && <p className="text-xs opacity-60">👷 {apt.technicianName}</p>}
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 ml-2">
                                                        <span className="text-xs opacity-70">{apt.appointmentTime}</span>
                                                        <select value={apt.status}
                                                            onChange={e => { e.stopPropagation(); handleStatusChange(apt, e.target.value); }}
                                                            onClick={e => e.stopPropagation()}
                                                            className="text-xs bg-transparent border-none outline-none cursor-pointer opacity-70">
                                                            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {showForm && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-surface rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
                            <h3 className="text-white font-bold">{editingApt ? 'Randevuyu Düzenle' : 'Yeni Randevu'}</h3>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {[{ label: 'Müşteri Adı *', key: 'customerName', type: 'text' },
                            { label: 'Telefon *', key: 'customerPhone', type: 'tel' },
                            { label: 'Cihaz Bilgisi *', key: 'deviceInfo', type: 'text' },
                            ].map(field => (
                                <div key={field.key}>
                                    <label className="block text-sm text-slate-400 mb-1">{field.label}</label>
                                    <input type={field.type}
                                        value={(form as Record<string, string | number>)[field.key] as string}
                                        onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white" />
                                </div>
                            ))}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Sorun Açıklaması</label>
                                <textarea value={form.issueDescription}
                                    onChange={e => setForm(f => ({ ...f, issueDescription: e.target.value }))}
                                    rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white resize-none" />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Tarih *</label>
                                    <input type="date" value={form.appointmentDate}
                                        onChange={e => setForm(f => ({ ...f, appointmentDate: e.target.value }))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Saat *</label>
                                    <input type="time" value={form.appointmentTime}
                                        onChange={e => setForm(f => ({ ...f, appointmentTime: e.target.value }))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Süre (dk)</label>
                                    <select value={form.durationMinutes}
                                        onChange={e => setForm(f => ({ ...f, durationMinutes: parseInt(e.target.value) }))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white">
                                        {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} dk</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Teknisyen</label>
                                <select value={form.technicianId}
                                    onChange={e => setForm(f => ({ ...f, technicianId: e.target.value }))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white">
                                    <option value="">Teknisyen Seç</option>
                                    {technicians.map((t: { id: string; name: string }) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Notlar</label>
                                <textarea value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white resize-none" />
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-700 flex gap-3">
                            {editingApt && (
                                <button onClick={async () => {
                                    if (confirm('Randevuyu silmek istiyor musunuz?')) {
                                        await api.deleteAppointment(editingApt.id);
                                        setShowForm(false);
                                        loadData();
                                    }
                                }} className="px-4 py-2.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30">Sil</button>
                            )}
                            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-700">İptal</button>
                            <button onClick={handleSave} className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-medium">
                                {editingApt ? 'Güncelle' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
