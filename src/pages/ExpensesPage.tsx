import { useState, useMemo, useEffect } from 'react';
import type { Expense } from '../types';
import { formatDate, generateId } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';

interface ExpensesPageProps {
    expenses: Expense[];
    setExpenses: (e: Expense[]) => void;
}

const categoryIcons: Record<string, string> = {
    'Kira': 'home', 'Elektrik': 'bolt', 'İnternet': 'wifi', 'Maaş': 'group',
    'Stok': 'inventory_2', 'Mutfak': 'local_cafe', 'Fatura': 'receipt_long',
    'Muhasebe': 'account_balance', 'Diğer': 'more_horiz'
};

const expenseCategories = ['Kira', 'Elektrik', 'İnternet', 'Maaş', 'Stok', 'Mutfak', 'Fatura', 'Muhasebe', 'Diğer'];

export default function ExpensesPage({ expenses, setExpenses }: ExpensesPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Expense | null>(null);
    const [catFilter, setCatFilter] = useState('all');

    // Date filter state
    const [dateFilter, setDateFilter] = useState<'thisMonth' | 'lastMonth' | 'all' | 'custom'>('thisMonth');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const [form, setForm] = useState({
        name: '', category: 'Diğer', amount: 0, paymentMethod: 'nakit',
        isRecurring: false, status: 'odendi' as Expense['status']
    });

    // Date range calculation
    const dateRange = useMemo(() => {
        const now = new Date();
        if (dateFilter === 'thisMonth') {
            return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
        }
        if (dateFilter === 'lastMonth') {
            return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
        }
        if (dateFilter === 'custom' && customStart && customEnd) {
            return { start: new Date(customStart), end: new Date(customEnd + 'T23:59:59') };
        }
        return null;
    }, [dateFilter, customStart, customEnd]);

    // Auto-generate recurring expenses for current month if missing
    useEffect(() => {
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const recurringExpenses = expenses.filter(e => e.isRecurring);
        // Get unique recurring expense names
        const recurringNames = [...new Set(recurringExpenses.map(e => e.name))];

        const newExpenses: Expense[] = [];
        recurringNames.forEach(name => {
            // Check if this recurring expense already has an entry this month
            const hasThisMonth = expenses.some(e =>
                e.name === name && e.createdAt?.startsWith(currentMonthStr)
            );
            if (!hasThisMonth) {
                // Find the latest version of this recurring expense to copy from
                const latest = recurringExpenses
                    .filter(e => e.name === name)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                if (latest) {
                    newExpenses.push({
                        id: generateId(),
                        name: latest.name,
                        category: latest.category,
                        amount: latest.amount,
                        paymentMethod: latest.paymentMethod,
                        isRecurring: true,
                        status: 'bekliyor',
                        createdAt: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
                    });
                }
            }
        });

        if (newExpenses.length > 0) {
            const updated = [...newExpenses, ...expenses];
            setExpenses(updated);
            // Save each new expense
            newExpenses.forEach(e => api.saveExpense(e).catch(() => { }));
        }
    }, []);

    // Filtered by date + category
    const filtered = useMemo(() =>
        expenses.filter(e => {
            if (dateRange) {
                const d = new Date(e.createdAt);
                if (d < dateRange.start || d > dateRange.end) return false;
            }
            if (catFilter !== 'all' && e.category !== catFilter) return false;
            return true;
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [expenses, catFilter, dateRange]);

    // Stats based on filtered
    const totalExpenses = filtered.reduce((s, e) => s + e.amount, 0);
    const paidExpenses = filtered.filter(e => e.status === 'odendi').reduce((s, e) => s + e.amount, 0);
    const pendingExpenses = filtered.filter(e => e.status === 'bekliyor').reduce((s, e) => s + e.amount, 0);
    const recurringTotal = filtered.filter(e => e.isRecurring).reduce((s, e) => s + e.amount, 0);

    // Category breakdown for chart (filtered)
    const catBreakdown = useMemo(() => {
        const map: Record<string, number> = {};
        filtered.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [filtered]);

    const maxCatAmount = catBreakdown.length > 0 ? catBreakdown[0][1] : 1;

    // Pie chart colors
    const pieColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#64748b', '#14b8a6'];

    const openCreate = () => {
        setEditing(null);
        setForm({ name: '', category: 'Diğer', amount: 0, paymentMethod: 'nakit', isRecurring: false, status: 'odendi' });
        setShowModal(true);
    };

    const openEdit = (e: Expense) => {
        setEditing(e);
        setForm({ name: e.name, category: e.category, amount: e.amount, paymentMethod: e.paymentMethod, isRecurring: e.isRecurring, status: e.status });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name || form.amount <= 0) { showToast('Ad ve tutar zorunlu!', 'error'); return; }
        try {
            const expense: Expense = {
                id: editing?.id || generateId(), ...form,
                createdAt: editing?.createdAt || new Date().toISOString()
            };
            await api.saveExpense(expense);
            if (editing) setExpenses(expenses.map(e => e.id === expense.id ? expense : e));
            else setExpenses([expense, ...expenses]);
            setShowModal(false);
            showToast(editing ? 'Güncellendi!' : 'Gider eklendi!');
        } catch { showToast('Hata!', 'error'); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Silmek istediğinize emin misiniz?')) return;
        try {
            await api.deleteExpense(id);
            setExpenses(expenses.filter(e => e.id !== id));
            showToast('Silindi!');
        } catch { showToast('Hata!', 'error'); }
    };

    // Mark recurring expense as paid
    const handleMarkPaid = async (e: Expense) => {
        try {
            const updated = { ...e, status: 'odendi' as Expense['status'] };
            await api.saveExpense(updated);
            setExpenses(expenses.map(ex => ex.id === e.id ? updated : ex));
            showToast(`${e.name} ödendi olarak işaretlendi!`);
        } catch { showToast('Hata!', 'error'); }
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            <div className="flex justify-between items-center">
                <div><h2 className="text-2xl font-bold text-white">Giderler</h2><p className="text-red-400 text-sm mt-1">İşletme gider takibi</p></div>
                <div className="flex items-center gap-2">
                    {([['thisMonth', 'Bu Ay'], ['lastMonth', 'Geçen Ay'], ['all', 'Tüm Zamanlar']] as const).map(([id, label]) => (
                        <button key={id}
                            onClick={() => { setDateFilter(id as any); setCustomStart(''); setCustomEnd(''); }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateFilter === id ? 'bg-red-500 text-white shadow-lg shadow-red-500/25' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
                        >{label}</button>
                    ))}
                    <div className="flex items-center gap-1 ml-1">
                        <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); if (e.target.value && customEnd) setDateFilter('custom'); }}
                            className="bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-white focus:border-red-500 outline-none" />
                        <span className="text-slate-500 text-xs">—</span>
                        <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); if (customStart && e.target.value) setDateFilter('custom'); }}
                            className="bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-white focus:border-red-500 outline-none" />
                    </div>
                    <button onClick={openCreate} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-red-500/25 flex items-center gap-2 ml-1">
                        <span className="material-symbols-outlined text-lg">add</span>Yeni Gider
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Toplam Gider', value: fp(totalExpenses), icon: 'trending_down', color: 'text-red-400' },
                    { label: 'Ödenen', value: fp(paidExpenses), icon: 'check_circle', color: 'text-emerald-400' },
                    { label: 'Bekleyen', value: fp(pendingExpenses), icon: 'schedule', color: 'text-orange-400' },
                    { label: 'Düzenli Giderler', value: fp(recurringTotal), icon: 'repeat', color: 'text-purple-400' },
                ].map(card => (
                    <div key={card.label} className="glass-panel p-5 rounded-xl flex flex-col justify-between h-32 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10"><span className={`material-symbols-outlined text-6xl ${card.color}`}>{card.icon}</span></div>
                        <div><p className="text-slate-400 text-sm mb-1">{card.label}</p><h3 className={`text-2xl font-bold ${card.color}`}>{card.value}</h3></div>
                    </div>
                ))}
            </div>

            {/* Split Layout */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Left - Table 70% */}
                <div className="flex-[7] space-y-4">
                    {/* Filter */}
                    <div className="flex gap-2">
                        <button onClick={() => setCatFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catFilter === 'all' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>Tümü</button>
                        {expenseCategories.map(c => (
                            <button key={c} onClick={() => setCatFilter(c)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${catFilter === c ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                                <span className="material-symbols-outlined text-sm">{categoryIcons[c] || 'more_horiz'}</span>{c}
                            </button>
                        ))}
                    </div>

                    <div className="bg-surface-dark border border-slate-700/50 rounded-xl overflow-x-auto">
                        <table className="w-full text-left min-w-[800px]">
                            <thead><tr className="bg-slate-800/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                                <th className="p-4">Gider</th><th className="p-4">Kategori</th><th className="p-4">Tarih</th>
                                <th className="p-4 text-right">Tutar</th><th className="p-4">Durum</th><th className="p-4 text-center">İşlemler</th>
                            </tr></thead>
                            <tbody className="divide-y divide-slate-700/50 text-sm">
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-16 text-slate-400">
                                        <span className="material-symbols-outlined text-6xl mb-4 block">inbox</span><p>Gider yok</p>
                                    </td></tr>
                                ) : filtered.map(e => (
                                    <tr key={e.id} className="hover:bg-surface-hover/50 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-slate-400 text-lg">{categoryIcons[e.category] || 'more_horiz'}</span>
                                                <span className="font-medium text-white">{e.name}</span>
                                                {e.isRecurring && <span className="material-symbols-outlined text-purple-400 text-sm">repeat</span>}
                                            </div>
                                        </td>
                                        <td className="p-4"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-300">{e.category}</span></td>
                                        <td className="p-4 text-slate-300">{formatDate(e.createdAt)}</td>
                                        <td className="p-4 text-right font-medium text-red-400">-{fp(e.amount)}</td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                <span className={`px-2 py-0.5 rounded-full text-xs w-fit ${e.status === 'odendi' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                                    {e.status === 'odendi' ? 'Ödendi' : 'Bekliyor'}
                                                </span>
                                                {e.status === 'bekliyor' && (
                                                    <button
                                                        onClick={() => handleMarkPaid(e)}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 transition-all w-fit cursor-pointer group"
                                                    >
                                                        <span className="material-symbols-outlined text-xs group-hover:scale-110 transition-transform">check</span>
                                                        Ödendi
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-1">
                                                <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400"><span className="material-symbols-outlined text-lg">edit</span></button>
                                                <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400"><span className="material-symbols-outlined text-lg">delete</span></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right - Charts 30% */}
                <div className="flex-[3] space-y-4">
                    {/* Pie Chart */}
                    {catBreakdown.length > 0 && (
                        <div className="bg-surface-dark border border-slate-700/50 rounded-xl p-4">
                            <h4 className="text-sm font-semibold text-white mb-4">Kategori Dağılımı</h4>
                            <div className="flex justify-center mb-4">
                                <svg width="200" height="200" viewBox="-100 -100 200 200">
                                    {(() => {
                                        const total = catBreakdown.reduce((s, [, a]) => s + a, 0);
                                        let cumAngle = -90;
                                        return catBreakdown.map(([cat, amount], idx) => {
                                            const pct = amount / total;
                                            const angle = pct * 360;
                                            const startAngle = cumAngle;
                                            cumAngle += angle;
                                            const midAngle = (startAngle + angle / 2) * (Math.PI / 180);
                                            const startRad = startAngle * (Math.PI / 180);
                                            const endRad = (startAngle + angle) * (Math.PI / 180);
                                            const x1 = Math.cos(startRad) * 85;
                                            const y1 = Math.sin(startRad) * 85;
                                            const x2 = Math.cos(endRad) * 85;
                                            const y2 = Math.sin(endRad) * 85;
                                            const largeArc = angle > 180 ? 1 : 0;
                                            const labelR = pct > 0.06 ? 55 : 95;
                                            const lx = Math.cos(midAngle) * labelR;
                                            const ly = Math.sin(midAngle) * labelR;
                                            const color = pieColors[idx % pieColors.length];
                                            return (
                                                <g key={cat}>
                                                    <path
                                                        d={`M 0 0 L ${x1} ${y1} A 85 85 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                                        fill={color} stroke="#1e293b" strokeWidth="2"
                                                        className="transition-opacity hover:opacity-80 cursor-pointer"
                                                    />
                                                    {pct > 0.04 && (
                                                        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                                                            fill="white" fontSize="9" fontWeight="600"
                                                            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                                                            {`${(pct * 100).toFixed(0)}%`}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        });
                                    })()}
                                </svg>
                            </div>
                            {/* Legend */}
                            <div className="grid grid-cols-2 gap-1.5">
                                {catBreakdown.map(([cat, amount], idx) => (
                                    <div key={cat} className="flex items-center gap-1.5 text-xs">
                                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: pieColors[idx % pieColors.length] }}></div>
                                        <span className="text-slate-300 truncate">{cat}</span>
                                        <span className="text-white font-medium ml-auto">{fp(amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Bar Breakdown */}
                    <div className="bg-surface-dark border border-slate-700/50 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-white mb-4">Detaylı Dağılım</h4>
                        <div className="space-y-3">
                            {catBreakdown.map(([cat, amount]) => (
                                <div key={cat}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-300 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">{categoryIcons[cat] || 'more_horiz'}</span>{cat}
                                        </span>
                                        <span className="text-white font-medium">{fp(amount)}</span>
                                    </div>
                                    <div className="w-full bg-slate-700 rounded-full h-2">
                                        <div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: `${(amount / maxCatAmount) * 100}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">{editing ? 'Gider Düzenle' : 'Yeni Gider'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Gider Adı *</label>
                                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-red-500 outline-none" /></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Kategori</label>
                                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-red-500 outline-none">
                                        {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Tutar *</label>
                                    <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-red-500 outline-none" /></div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Ödeme Yöntemi</label>
                                    <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-red-500 outline-none">
                                        <option value="nakit">Nakit</option><option value="havale">Havale</option><option value="kart">Kart</option>
                                    </select></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Durum</label>
                                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Expense['status'] })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-red-500 outline-none">
                                        <option value="odendi">Ödendi</option><option value="bekliyor">Bekliyor</option>
                                    </select></div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={form.isRecurring} onChange={e => setForm({ ...form, isRecurring: e.target.checked })} className="rounded border-slate-600 bg-slate-700 text-red-500" />
                                <span className="text-sm text-slate-300">Düzenli gider</span>
                            </label>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-red-500/25">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
