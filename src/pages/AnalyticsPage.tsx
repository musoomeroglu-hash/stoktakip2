import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import type { Sale, RepairRecord, PhoneSale, Expense, Product } from '../types';
import { useFormatPrice } from '../components/PriceVisibility';

interface AnalyticsPageProps {
    sales: Sale[];
    repairs: RepairRecord[];
    phoneSales: PhoneSale[];
    expenses: Expense[];
    products: Product[];
}

const COLORS = ['#f42559', '#4144f1', '#25e2f4', '#2aef8c', '#f4ab25', '#a855f7', '#ec4899', '#f97316'];

export default function AnalyticsPage({ sales, repairs, phoneSales, expenses, products }: AnalyticsPageProps) {
    const fp = useFormatPrice();

    // Date filter state
    const [dateFilter, setDateFilter] = useState<'thisMonth' | 'lastMonth' | 'all' | 'custom'>('thisMonth');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // Compute date range
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

    const inRange = (dateStr: string) => {
        if (!dateRange) return true;
        const d = new Date(dateStr);
        return d >= dateRange.start && d <= dateRange.end;
    };

    // Filtered data
    const fSales = useMemo(() => sales.filter(s => inRange(s.date) && !s.items?.some(i => i.productId?.startsWith('repair-'))), [sales, dateRange]);
    const fRepairs = useMemo(() => repairs.filter(r => inRange(r.createdAt) && r.status !== 'cancelled'), [repairs, dateRange]);
    const fPhoneSales = useMemo(() => phoneSales.filter(ps => inRange(ps.date)), [phoneSales, dateRange]);
    const fExpenses = useMemo(() => expenses.filter(e => inRange(e.createdAt)), [expenses, dateRange]);

    // Daily trend
    const dailyTrend = useMemo(() => {
        const days: { date: string; revenue: number; profit: number; expense: number }[] = [];
        const dayCount = dateRange ? Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / 86400000) + 1 : 30;
        const limitedDays = Math.min(dayCount, 60);
        for (let i = limitedDays - 1; i >= 0; i--) {
            const d = dateRange ? new Date(dateRange.end.getTime() - i * 86400000) : new Date(Date.now() - i * 86400000);
            const dayStr = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });

            const dayRevenue = fSales.filter(s => s.date?.startsWith(dayStr)).reduce((sum, s) => sum + s.totalPrice, 0)
                + fRepairs.filter(r => r.createdAt?.startsWith(dayStr)).reduce((sum, r) => sum + r.repairCost, 0)
                + fPhoneSales.filter(ps => ps.date?.startsWith(dayStr)).reduce((sum, ps) => sum + ps.salePrice, 0);

            const dayProfit = fSales.filter(s => s.date?.startsWith(dayStr)).reduce((sum, s) => sum + s.totalProfit, 0)
                + fRepairs.filter(r => r.createdAt?.startsWith(dayStr)).reduce((sum, r) => sum + r.profit, 0)
                + fPhoneSales.filter(ps => ps.date?.startsWith(dayStr)).reduce((sum, ps) => sum + ps.profit, 0);

            const dayExpense = fExpenses.filter(e => e.createdAt?.startsWith(dayStr)).reduce((sum, e) => sum + e.amount, 0);

            days.push({ date: label, revenue: dayRevenue, profit: dayProfit, expense: dayExpense });
        }
        return days;
    }, [fSales, fRepairs, fPhoneSales, fExpenses, dateRange]);

    // Category breakdown
    const categoryData = useMemo(() => {
        const map: Record<string, number> = {};
        fSales.forEach(s => s.items.forEach(i => {
            const cat = i.productName?.split(' ')[0] || 'Diğer';
            map[cat] = (map[cat] || 0) + i.salePrice * i.quantity;
        }));
        return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [fSales]);

    // Category-based sales breakdown (by count)
    const categorySalesData = useMemo(() => {
        const map: Record<string, { count: number; revenue: number }> = {};
        // Product sales — group by product category or name keyword
        fSales.forEach(s => s.items.forEach(i => {
            const name = i.productName || 'Diğer';
            // Try to extract category from product name
            let cat = 'Diğer';
            if (name.toLowerCase().includes('kılıf')) cat = 'Kılıf';
            else if (name.toLowerCase().includes('koruyucu') || name.toLowerCase().includes('cam')) cat = 'Ekran Koruyucu';
            else if (name.toLowerCase().includes('kablo')) cat = 'Kablo';
            else if (name.toLowerCase().includes('şarj') || name.toLowerCase().includes('adaptör')) cat = 'Şarj/Adaptör';
            else if (name.toLowerCase().includes('kulaklık') || name.toLowerCase().includes('earpud') || name.toLowerCase().includes('airpod')) cat = 'Kulaklık';
            else if (name.toLowerCase().includes('tutucu') || name.toLowerCase().includes('stand')) cat = 'Tutucu/Stand';
            else cat = 'Aksesuar';
            if (!map[cat]) map[cat] = { count: 0, revenue: 0 };
            map[cat].count += i.quantity;
            map[cat].revenue += i.salePrice * i.quantity;
        }));
        // Repairs
        if (fRepairs.length > 0) {
            map['Tamir'] = { count: fRepairs.length, revenue: fRepairs.reduce((s, r) => s + r.repairCost, 0) };
        }
        // Phone sales
        if (fPhoneSales.length > 0) {
            map['Telefon Satışı'] = { count: fPhoneSales.length, revenue: fPhoneSales.reduce((s, ps) => s + ps.salePrice, 0) };
        }
        return Object.entries(map).map(([name, data]) => ({ name, value: data.count, revenue: data.revenue })).sort((a, b) => b.value - a.value);
    }, [fSales, fRepairs, fPhoneSales]);

    // Top products
    const topProducts = useMemo(() => {
        const map: Record<string, { name: string; qty: number; revenue: number }> = {};
        fSales.forEach(s => s.items.forEach(i => {
            if (!map[i.productId]) map[i.productId] = { name: i.productName, qty: 0, revenue: 0 };
            map[i.productId].qty += i.quantity;
            map[i.productId].revenue += i.salePrice * i.quantity;
        }));
        return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    }, [fSales]);

    // Top customers
    const topCustomers = useMemo(() => {
        const map: Record<string, { name: string; total: number; count: number }> = {};
        [...fSales, ...fRepairs as any[], ...fPhoneSales].forEach((s: any) => {
            const name = s.customerInfo?.name || s.customerName;
            if (!name) return;
            if (!map[name]) map[name] = { name, total: 0, count: 0 };
            map[name].total += s.totalPrice || s.repairCost || s.salePrice || 0;
            map[name].count++;
        });
        return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
    }, [fSales, fRepairs, fPhoneSales]);

    // Summary stats
    const totalRevenue = fSales.reduce((s, v) => s + v.totalPrice, 0)
        + fRepairs.reduce((s, v) => s + v.repairCost, 0)
        + fPhoneSales.reduce((s, v) => s + v.salePrice, 0);
    const totalProfit = fSales.reduce((s, v) => s + v.totalProfit, 0)
        + fRepairs.reduce((s, v) => s + v.profit, 0)
        + fPhoneSales.reduce((s, v) => s + v.profit, 0);
    const totalExpenses = fExpenses.reduce((s, v) => s + v.amount, 0);
    const netProfit = totalProfit - totalExpenses;

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-white">Analizler</h2>
                    <p className="text-pink-400 text-sm mt-1">İşletme performansı ve detaylı analiz</p>
                </div>
                <div className="flex items-center gap-2">
                    {([['thisMonth', 'Bu Ay'], ['lastMonth', 'Geçen Ay'], ['all', 'Tüm Zamanlar']] as const).map(([id, label]) => (
                        <button key={id}
                            onClick={() => { setDateFilter(id as any); setCustomStart(''); setCustomEnd(''); }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateFilter === id ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/25' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
                        >{label}</button>
                    ))}
                    <div className="flex items-center gap-1 ml-2">
                        <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); if (e.target.value && customEnd) setDateFilter('custom'); }}
                            className="bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-white focus:border-pink-500 outline-none" />
                        <span className="text-slate-500 text-xs">—</span>
                        <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); if (customStart && e.target.value) setDateFilter('custom'); }}
                            className="bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-white focus:border-pink-500 outline-none" />
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Toplam Ciro', value: fp(totalRevenue), color: 'text-blue-400' },
                    { label: 'Toplam Kâr', value: fp(totalProfit), color: 'text-emerald-400' },
                    { label: 'Toplam Gider', value: fp(totalExpenses), color: 'text-red-400' },
                    { label: 'Net Kâr', value: fp(netProfit), color: netProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
                ].map(card => (
                    <div key={card.label} className="glass-panel p-5 rounded-xl">
                        <p className="text-slate-400 text-sm mb-1">{card.label}</p>
                        <h3 className={`text-2xl font-bold ${card.color}`}>{card.value}</h3>
                    </div>
                ))}
            </div>

            {/* Trend Chart */}
            <div className="bg-surface-dark border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Günlük Gelir & Kâr Trendi</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `₺${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                            formatter={(value: number, name: string) => [fp(value), name === 'revenue' ? 'Gelir' : name === 'profit' ? 'Kâr' : 'Gider']}
                        />
                        <Line type="monotone" dataKey="revenue" stroke="#4144f1" strokeWidth={2} dot={false} name="revenue" />
                        <Line type="monotone" dataKey="profit" stroke="#2aef8c" strokeWidth={2} dot={false} name="profit" />
                        <Line type="monotone" dataKey="expense" stroke="#f42559" strokeWidth={2} dot={false} name="expense" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Bar Chart */}
                <div className="bg-surface-dark border border-slate-700/50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Kategori Bazlı Satış</h3>
                    {categoryData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={categoryData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `₺${(v / 1000).toFixed(0)}k`} />
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                                    formatter={(value: number) => [fp(value), 'Satış']} />
                                <Bar dataKey="value" fill="#f42559" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <p className="text-slate-400 text-center py-8">Veri yok</p>}
                </div>

                {/* Category Sales Donut */}
                <div className="bg-surface-dark border border-slate-700/50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Kategori Bazlı Satış Dağılımı</h3>
                    {categorySalesData.length > 0 ? (
                        <div className="flex items-center gap-4">
                            <ResponsiveContainer width="50%" height={200}>
                                <PieChart>
                                    <Pie data={categorySalesData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" strokeWidth={0}>
                                        {categorySalesData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                                        formatter={(value: any, name: any) => [`${value} adet`, name]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-2">
                                {categorySalesData.map((d, idx) => (
                                    <div key={d.name} className="flex items-center gap-2 text-sm">
                                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[idx % COLORS.length] }}></div>
                                        <span className="text-slate-300">{d.name}</span>
                                        <span className="text-white font-medium ml-auto">{d.value} adet</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : <p className="text-slate-400 text-center py-8">Veri yok</p>}
                </div>
            </div>

            {/* Leaderboards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-surface-dark border border-slate-700/50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">🏆 En Çok Satan Ürünler</h3>
                    <div className="space-y-3">
                        {topProducts.length === 0 ? <p className="text-slate-400 text-sm">Veri yok</p> :
                            topProducts.map((p, i) => (
                                <div key={p.name} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-slate-400/20 text-slate-300' : 'bg-orange-500/20 text-orange-400'}`}>{i + 1}</span>
                                    <div className="flex-1"><span className="text-sm text-white">{p.name}</span><span className="text-xs text-slate-400 ml-2">({p.qty} adet)</span></div>
                                    <span className="text-sm font-medium text-pink-400">{fp(p.revenue)}</span>
                                </div>
                            ))}
                    </div>
                </div>

                <div className="bg-surface-dark border border-slate-700/50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">👥 Sadık Müşteriler</h3>
                    <div className="space-y-3">
                        {topCustomers.length === 0 ? <p className="text-slate-400 text-sm">Veri yok</p> :
                            topCustomers.map((c, i) => (
                                <div key={c.name} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700 text-slate-300'}`}>{i + 1}</span>
                                    <div className="flex-1"><span className="text-sm text-white">{c.name}</span><span className="text-xs text-slate-400 ml-2">({c.count} işlem)</span></div>
                                    <span className="text-sm font-medium text-emerald-400">{fp(c.total)}</span>
                                </div>
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
