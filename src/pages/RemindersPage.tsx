import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';

export interface Reminder {
    id: string;
    title: string;
    description: string;
    remindAt: string;
    repeatType: 'none' | 'daily' | 'weekly' | 'monthly';
    phoneNumber: string;
    isSent: boolean;
    isCompleted: boolean;
    priority: 'low' | 'medium' | 'high';
    category: string;
    createdAt: string;
}

const CATEGORY_OPTIONS = [
    { value: 'genel', label: 'Genel', icon: 'task' },
    { value: 'tamir', label: 'Tamir', icon: 'build' },
    { value: 'musteri', label: 'Müşteri', icon: 'person' },
    { value: 'odeme', label: 'Ödeme', icon: 'payments' },
    { value: 'teslimat', label: 'Teslimat', icon: 'local_shipping' },
    { value: 'toplanti', label: 'Toplantı', icon: 'groups' },
];

const PRIORITY_CONFIG = {
    low: { label: 'Düşük', color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30' },
    medium: { label: 'Orta', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' },
    high: { label: 'Yüksek', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30' },
};

const REPEAT_OPTIONS = [
    { value: 'none', label: 'Tekrar Yok' },
    { value: 'daily', label: 'Her Gün' },
    { value: 'weekly', label: 'Her Hafta' },
    { value: 'monthly', label: 'Her Ay' },
];

const emptyForm = (): Partial<Reminder> => ({
    title: '',
    description: '',
    remindAt: '',
    repeatType: 'none',
    phoneNumber: '',
    priority: 'medium',
    category: 'genel',
    isCompleted: false,
});

function formatRelativeTime(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);
    if (diffMs < 0) {
        const absMins = Math.abs(diffMins);
        if (absMins < 60) return `${absMins} dakika önce`;
        const absHours = Math.abs(diffHours);
        if (absHours < 24) return `${absHours} saat önce`;
        return `${Math.abs(diffDays)} gün önce`;
    }
    if (diffMins < 60) return `${diffMins} dakika sonra`;
    if (diffHours < 24) return `${diffHours} saat sonra`;
    if (diffDays === 1) return 'Yarın';
    return `${diffDays} gün sonra`;
}

function formatDatetimeLocal(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RemindersPage() {
    const { showToast } = useToast();
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Reminder | null>(null);
    const [form, setForm] = useState<Partial<Reminder>>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed' | 'overdue'>('upcoming');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [whatsappConfig, setWhatsappConfig] = useState({
        instanceId: localStorage.getItem('wa_instance') || '',
        token: localStorage.getItem('wa_token') || '',
        defaultPhone: localStorage.getItem('wa_phone') || '',
    });
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        loadReminders();
        const interval = setInterval(checkDueReminders, 60000);
        return () => clearInterval(interval);
    }, []);

    const loadReminders = async () => {
        setLoading(true);
        try {
            const data = await api.getReminders();
            setReminders(data);
        } catch {
            showToast('Hatırlatıcılar yüklenemedi', 'error');
        } finally {
            setLoading(false);
        }
    };

    const checkDueReminders = async () => {
        try {
            const data = await api.getReminders();
            const now = new Date();
            for (const r of data) {
                if (!r.isCompleted && !r.isSent && new Date(r.remindAt) <= now) {
                    await sendWhatsAppReminder(r);
                    await api.markReminderSent(r.id);
                }
            }
            setReminders(data);
        } catch { /* silent */ }
    };

    const sendWhatsAppReminder = async (reminder: Reminder) => {
        const instanceId = localStorage.getItem('wa_instance');
        const token = localStorage.getItem('wa_token');
        const phone = reminder.phoneNumber || localStorage.getItem('wa_phone');
        if (!instanceId || !token || !phone) return;
        const catLabel = CATEGORY_OPTIONS.find(c => c.value === reminder.category)?.label || reminder.category;
        const message = `🔔 *Hatırlatıcı: ${reminder.title}*\n\n📋 *Kategori:* ${catLabel}\n${reminder.description ? `📝 *Not:* ${reminder.description}\n` : ''}\n⏰ ${new Date(reminder.remindAt).toLocaleString('tr-TR')}\n\n_StokTakip Pro tarafından gönderildi_`;
        try {
            await fetch(`https://api.ultramsg.com/${instanceId}/messages/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ token, to: phone, body: message }),
            });
        } catch { /* silent */ }
    };

    const handleSave = async () => {
        if (!form.title?.trim()) return showToast('Başlık gerekli', 'error');
        if (!form.remindAt) return showToast('Tarih/saat gerekli', 'error');
        setSaving(true);
        try {
            if (editing) {
                const updated = await api.updateReminder(editing.id, form);
                setReminders(prev => prev.map(r => r.id === editing.id ? updated : r));
                showToast('Hatırlatıcı güncellendi');
            } else {
                const created = await api.createReminder({ ...form, isSent: false, isCompleted: false });
                setReminders(prev => [created, ...prev]);
                showToast('Hatırlatıcı oluşturuldu ✓');
            }
            setShowModal(false);
            setEditing(null);
            setForm(emptyForm());
        } catch {
            showToast('Kayıt hatası', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteReminder(id);
            setReminders(prev => prev.filter(r => r.id !== id));
            showToast('Silindi');
        } catch {
            showToast('Silinemedi', 'error');
        } finally {
            setDeleteTarget(null);
        }
    };

    const handleToggleComplete = async (reminder: Reminder) => {
        try {
            const updated = await api.updateReminder(reminder.id, { isCompleted: !reminder.isCompleted });
            setReminders(prev => prev.map(r => r.id === reminder.id ? updated : r));
        } catch { /* silent */ }
    };

    const handleTestWhatsApp = async () => {
        const instanceId = localStorage.getItem('wa_instance');
        const token = localStorage.getItem('wa_token');
        const phone = localStorage.getItem('wa_phone');
        if (!instanceId || !token || !phone) return showToast('WhatsApp ayarları eksik', 'error');
        try {
            await fetch(`https://api.ultramsg.com/${instanceId}/messages/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ token, to: phone, body: '✅ StokTakip Pro WhatsApp bağlantısı başarılı!' }),
            });
            showToast('Test mesajı gönderildi!');
        } catch {
            showToast('Gönderilemedi - ayarları kontrol edin', 'error');
        }
    };

    const openAdd = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
    const openEdit = (r: Reminder) => { setEditing(r); setForm({ ...r, remindAt: formatDatetimeLocal(r.remindAt) }); setShowModal(true); };
    const saveSettings = () => {
        localStorage.setItem('wa_instance', whatsappConfig.instanceId);
        localStorage.setItem('wa_token', whatsappConfig.token);
        localStorage.setItem('wa_phone', whatsappConfig.defaultPhone);
        showToast('Ayarlar kaydedildi');
        setShowSettings(false);
    };

    const now = new Date();
    const filtered = useMemo(() => {
        return reminders.filter(r => {
            const date = new Date(r.remindAt);
            const isOverdue = date < now && !r.isCompleted;
            const isUpcoming = date >= now && !r.isCompleted;
            if (filter === 'upcoming' && !isUpcoming) return false;
            if (filter === 'completed' && !r.isCompleted) return false;
            if (filter === 'overdue' && !isOverdue) return false;
            if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
            return true;
        }).sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime());
    }, [reminders, filter, categoryFilter]);

    const counts = useMemo(() => ({
        upcoming: reminders.filter(r => new Date(r.remindAt) >= now && !r.isCompleted).length,
        overdue: reminders.filter(r => new Date(r.remindAt) < now && !r.isCompleted).length,
        completed: reminders.filter(r => r.isCompleted).length,
    }), [reminders]);

    const isConfigured = !!localStorage.getItem('wa_instance') && !!localStorage.getItem('wa_token');

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-white">Hatırlatıcılar</h2>
                    <p className="text-sm text-slate-400 mt-0.5">Yapılacaklar ve WhatsApp bildirimleri</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowSettings(true)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border ${isConfigured ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-slate-700 bg-surface-hover text-slate-400 hover:text-white'}`}>
                        <span className="material-symbols-outlined text-base">{isConfigured ? 'check_circle' : 'settings'}</span>
                        <span className="hidden sm:inline">{isConfigured ? 'WhatsApp Bağlı' : 'WhatsApp Ayarla'}</span>
                    </button>
                    <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg text-sm hover:bg-primary/90 transition-colors">
                        <span className="material-symbols-outlined text-base">add</span>
                        Yeni Hatırlatıcı
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {[
                    { key: 'upcoming', label: 'Yaklaşan', count: counts.upcoming, icon: 'schedule', color: 'text-blue-400', bg: 'bg-blue-400/10' },
                    { key: 'overdue', label: 'Gecikmiş', count: counts.overdue, icon: 'warning', color: 'text-red-400', bg: 'bg-red-400/10' },
                    { key: 'completed', label: 'Tamamlanan', count: counts.completed, icon: 'check_circle', color: 'text-green-400', bg: 'bg-green-400/10' },
                ].map(stat => (
                    <button key={stat.key} onClick={() => setFilter(stat.key as typeof filter)} className={`p-4 rounded-xl border transition-all text-left ${filter === stat.key ? 'border-primary/50 bg-primary/5' : 'border-slate-800 bg-surface-dark hover:border-slate-700'}`}>
                        <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center mb-2`}>
                            <span className={`material-symbols-outlined ${stat.color}`}>{stat.icon}</span>
                        </div>
                        <div className="text-2xl font-bold text-white">{stat.count}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{stat.label}</div>
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === 'all' ? 'bg-primary text-black' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>Tümü</button>
                <div className="w-px h-4 bg-slate-700 mx-1" />
                {CATEGORY_OPTIONS.map(cat => (
                    <button key={cat.value} onClick={() => setCategoryFilter(prev => prev === cat.value ? 'all' : cat.value)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoryFilter === cat.value ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                        <span className="material-symbols-outlined text-sm">{cat.icon}</span>
                        {cat.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
                        <span className="material-symbols-outlined text-3xl text-slate-600">notifications_none</span>
                    </div>
                    <p className="text-slate-400">Hatırlatıcı bulunamadı</p>
                    <button onClick={openAdd} className="mt-4 text-primary text-sm hover:underline">+ Yeni oluştur</button>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(r => {
                        const date = new Date(r.remindAt);
                        const isOverdue = date < now && !r.isCompleted;
                        const priority = PRIORITY_CONFIG[r.priority];
                        const cat = CATEGORY_OPTIONS.find(c => c.value === r.category);
                        return (
                            <div key={r.id} className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${r.isCompleted ? 'opacity-50 border-slate-800 bg-surface-dark' : isOverdue ? 'border-red-500/30 bg-red-500/5' : 'border-slate-800 bg-surface-dark hover:border-slate-700'}`}>
                                <button onClick={() => handleToggleComplete(r)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${r.isCompleted ? 'bg-green-500 border-green-500' : 'border-slate-600 hover:border-primary'}`}>
                                    {r.isCompleted && <span className="material-symbols-outlined text-white text-xs">check</span>}
                                </button>
                                <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                                    <span className="material-symbols-outlined text-slate-400 text-sm">{cat?.icon || 'task'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-sm font-semibold ${r.isCompleted ? 'line-through text-slate-500' : 'text-white'}`}>{r.title}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${priority.bg} ${priority.color} border ${priority.border}`}>{priority.label}</span>
                                        {r.repeatType !== 'none' && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20">{REPEAT_OPTIONS.find(x => x.value === r.repeatType)?.label}</span>}
                                        {r.isSent && !r.isCompleted && <span className="text-xs px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20 flex items-center gap-1"><span className="material-symbols-outlined text-xs">check</span> Gönderildi</span>}
                                    </div>
                                    {r.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{r.description}</p>}
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                                            <span className="material-symbols-outlined text-xs">{isOverdue ? 'warning' : 'schedule'}</span>
                                            {date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })} {date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {formatRelativeTime(r.remindAt)}
                                        </span>
                                        {r.phoneNumber && <span className="text-xs text-slate-600 flex items-center gap-1"><span className="material-symbols-outlined text-xs">phone</span>{r.phoneNumber}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={() => openEdit(r)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"><span className="material-symbols-outlined text-sm">edit</span></button>
                                    <button onClick={() => setDeleteTarget(r.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"><span className="material-symbols-outlined text-sm">delete</span></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#1a1f2e] border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">{editing ? 'Hatırlatıcı Düzenle' : 'Yeni Hatırlatıcı'}</h3>
                            <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"><span className="material-symbols-outlined text-sm">close</span></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Başlık *</label>
                                <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary" placeholder="Örn: Pazartesi tamiri, Ali Bey'i ara..." value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Açıklama</label>
                                <textarea className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary resize-none" placeholder="İsteğe bağlı not..." rows={2} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Tarih ve Saat *</label>
                                    <input type="datetime-local" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary" value={form.remindAt || ''} onChange={e => setForm(f => ({ ...f, remindAt: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Tekrar</label>
                                    <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary" value={form.repeatType || 'none'} onChange={e => setForm(f => ({ ...f, repeatType: e.target.value as Reminder['repeatType'] }))}>
                                        {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Kategori</label>
                                    <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary" value={form.category || 'genel'} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                                        {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Öncelik</label>
                                    <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary" value={form.priority || 'medium'} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Reminder['priority'] }))}>
                                        <option value="low">Düşük</option>
                                        <option value="medium">Orta</option>
                                        <option value="high">Yüksek</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">WhatsApp Numarası <span className="text-slate-600">(boş = varsayılan)</span></label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">+90</span>
                                    <input className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-12 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary" placeholder="5XX XXX XX XX" value={form.phoneNumber || ''} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-800 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">İptal</button>
                            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-primary text-black font-semibold rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? 'Kaydediliyor...' : (editing ? 'Güncelle' : 'Kaydet')}</button>
                        </div>
                    </div>
                </div>
            )}

            {showSettings && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#1a1f2e] border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-green-400">chat</span>
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">WhatsApp Ayarları</h3>
                                    <p className="text-xs text-slate-400">UltraMsg API entegrasyonu</p>
                                </div>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"><span className="material-symbols-outlined text-sm">close</span></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1">
                                <p className="font-semibold">Nasıl çalışır?</p>
                                <p>Şirket hattı → UltraMsg'a bağlanır → Sistem o hattan mesaj atar → Şahsi hattınıza gelir</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Instance ID</label>
                                <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary" placeholder="instance123456" value={whatsappConfig.instanceId} onChange={e => setWhatsappConfig(c => ({ ...c, instanceId: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Token</label>
                                <input type="password" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary" placeholder="••••••••••••••••" value={whatsappConfig.token} onChange={e => setWhatsappConfig(c => ({ ...c, token: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Varsayılan Alıcı (Şahsi hattınız)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">+90</span>
                                    <input className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-12 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary" placeholder="5XX XXX XX XX" value={whatsappConfig.defaultPhone} onChange={e => setWhatsappConfig(c => ({ ...c, defaultPhone: e.target.value }))} />
                                </div>
                                <p className="text-xs text-slate-600 mt-1">Hatırlatıcılar bu numaraya gönderilir</p>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-800 flex justify-between items-center gap-3">
                            <button onClick={handleTestWhatsApp} className="flex items-center gap-2 px-4 py-2 text-sm text-green-400 border border-green-400/30 rounded-lg hover:bg-green-400/10 transition-colors"><span className="material-symbols-outlined text-sm">send</span>Test Gönder</button>
                            <div className="flex gap-2">
                                <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">İptal</button>
                                <button onClick={saveSettings} className="px-5 py-2 bg-primary text-black font-semibold rounded-lg text-sm hover:bg-primary/90 transition-colors">Kaydet</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#1a1f2e] border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center">
                        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4"><span className="material-symbols-outlined text-red-400">delete</span></div>
                        <p className="text-white font-semibold mb-1">Silmek istediğinize emin misiniz?</p>
                        <p className="text-slate-400 text-sm mb-5">Bu işlem geri alınamaz.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-sm">İptal</button>
                            <button onClick={() => handleDelete(deleteTarget)} className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600">Sil</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
