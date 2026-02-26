import { useState, useMemo } from 'react';
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
    'Stok': 'inventory_2', 'Mutfak': 'local_cafe', 'Diğer': 'more_horiz'
};

const expenseCategories = ['Kira', 'Elektrik', 'İnternet', 'Maaş', 'Stok', 'Mutfak', 'Diğer'];

export default function ExpensesPage({ expenses, setExpenses }: ExpensesPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Expense | null>(null);
    const [catFilter, setCatFilter] = useState('all');
    const [form, setForm] = useState({
        name: '', category: 'Diğer', amount: 0, paymentMethod: 'nakit',
        isRecurring: false, status: 'odendi' as Expense['status']
    });

    const filtered = useMemo(() =>
        expenses.filter(e => catFilter === 'all' || e.category === catFilter), [expenses, catFilter]);

    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const thisMonthExpenses = expenses.filter(e => {
        const d = new Date(e.createdAt);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s, e) => s + e.amount, 0);
    const recurringTotal = expenses.filter(e => e.isRecurring).reduce((s, e) => s + e.amount, 0);

    // Category breakdown for chart
    const catBreakdown = useMemo(() => {
        const map: Record<string, number> = {};
        expenses.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [expenses]);

    const maxCatAmount = catBreakdown.length > 0 ? catBreakdown[0][1] : 1;

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

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            <div className="flex justify-between items-center">
                <div><h2 className="text-2xl font-bold text-white">Giderler</h2><p className="text-red-400 text-sm mt-1">İşletme gider takibi</p></div>
                <button onClick={openCreate} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-red-500/25 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">add</span>Yeni Gider
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Toplam Gider', value: fp(totalExpenses), icon: 'trending_down', color: 'text-red-400' },
                    { label: 'Bu Ay', value: fp(thisMonthExpenses), icon: 'calendar_month', color: 'text-orange-400' },
                    { label: 'Düzenli Giderler', value: fp(recurringTotal), icon: 'repeat', color: 'text-purple-400' },
                ].map(card => (
                    <div key={card.label} className="glass-panel p-5 rounded-xl flex flex-col justify-between h-32 relative overflow-hidden">
                        <div><p className="text-slate-400 text-sm mb-1">{card.label}</p><h3 className={`text-2xl font-bold ${card.color}`}>{card.value}</h3></div>
                    </div>
                ))}
            </div>

            {/* Split Layout */}
            <div className="flex gap-6">
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

                    <div className="bg-surface-dark border border-slate-700/50 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
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
                                        <td className="p-4"><span className={`px-2 py-0.5 rounded-full text-xs ${e.status === 'odendi' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}`}>{e.status === 'odendi' ? 'Ödendi' : 'Bekliyor'}</span></td>
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
                    <div className="bg-surface-dark border border-slate-700/50 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-white mb-4">Kategori Dağılımı</h4>
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
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">{editing ? 'Gider Düzenle' : 'Yeni Gider'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Gider Adı *</label>
                                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-red-500 outline-none" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Kategori</label>
                                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-red-500 outline-none">
                                        {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Tutar *</label>
                                    <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-red-500 outline-none" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
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
