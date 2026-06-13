import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Grid, ChartTooltip } from './ui/area-chart';
import { getAIForecast } from '../utils/api';
import { useFormatPrice } from './PriceVisibility';
import type { Sale, RepairRecord, PhoneSale, Expense } from '../types';

interface AIForecastWidgetProps {
    sales: Sale[];
    repairs: RepairRecord[];
    phoneSales: PhoneSale[];
    expenses: Expense[];
}

export default function AIForecastWidget({ sales, repairs, phoneSales, expenses }: AIForecastWidgetProps) {
    const fp = useFormatPrice();
    const [loading, setLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [forecast, setForecast] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [trendDays, setTrendDays] = useState<7 | 30>(30);

    const handleGetForecast = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getAIForecast();
            setForecast(result.forecast);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Bilinmeyen hata');
        } finally {
            setLoading(false);
        }
    };

    const trendColors: Record<string, string> = { artış: 'text-green-400', düşüş: 'text-red-400', stabil: 'text-yellow-400' };

    // Daily trend calculation
    const dailyTrend = useMemo(() => {
        const days: { date: Date; displayDate: string; gelir: number; kar: number; gider: number }[] = [];
        for (let i = trendDays - 1; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000);
            const dayStr = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });

            const dayRevenue =
                sales.filter(s => s.date?.startsWith(dayStr)).reduce((sum, s) => sum + s.totalPrice, 0)
                + repairs.filter(r => r.createdAt?.startsWith(dayStr) && r.status !== 'cancelled').reduce((sum, r) => sum + r.repairCost, 0)
                + phoneSales.filter(ps => ps.date?.startsWith(dayStr)).reduce((sum, ps) => sum + ps.salePrice, 0);

            const dayProfit =
                sales.filter(s => s.date?.startsWith(dayStr)).reduce((sum, s) => sum + s.totalProfit, 0)
                + repairs.filter(r => r.createdAt?.startsWith(dayStr) && r.status !== 'cancelled').reduce((sum, r) => sum + r.profit, 0)
                + phoneSales.filter(ps => ps.date?.startsWith(dayStr)).reduce((sum, ps) => sum + ps.profit, 0);

            const dayExpense = expenses.filter(e => e.createdAt?.startsWith(dayStr) && e.category !== 'Tedarikçi').reduce((sum, e) => sum + e.amount, 0);

            days.push({ date: d, displayDate: label, gelir: dayRevenue, kar: dayProfit, gider: dayExpense });
        }
        return days;
    }, [sales, repairs, phoneSales, expenses, trendDays]);

    // Summary stats for the trend period
    const trendSummary = useMemo(() => {
        const totalGelir = dailyTrend.reduce((s, d) => s + d.gelir, 0);
        const totalKar = dailyTrend.reduce((s, d) => s + d.kar, 0);
        const totalGider = dailyTrend.reduce((s, d) => s + d.gider, 0);
        return { totalGelir, totalKar, totalGider };
    }, [dailyTrend]);

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            {/* Trend Chart Section */}
            <div className="bg-surface-dark border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">📈</span>
                        <div>
                            <h3 className="text-white font-bold">Günlük Gelir & Kâr Trendi</h3>
                            <p className="text-slate-400 text-xs">Son {trendDays} günlük performans</p>
                        </div>
                    </div>
                    <div className="flex bg-slate-800 rounded-full p-0.5 border border-slate-700">
                        <button
                            onClick={() => setTrendDays(7)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${trendDays === 7 ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        >7 Gün</button>
                        <button
                            onClick={() => setTrendDays(30)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${trendDays === 30 ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        >30 Gün</button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4 p-5 pb-0">
                    <div className="bg-slate-800/60 rounded-xl p-4">
                        <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> Toplam Gelir
                        </p>
                        <p className="text-white text-lg font-bold">{fp(trendSummary.totalGelir)}</p>
                    </div>
                    <div className="bg-slate-800/60 rounded-xl p-4">
                        <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> Toplam Kâr
                        </p>
                        <p className="text-emerald-400 text-lg font-bold">{fp(trendSummary.totalKar)}</p>
                    </div>
                    <div className="bg-slate-800/60 rounded-xl p-4">
                        <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> Toplam Gider
                        </p>
                        <p className="text-red-400 text-lg font-bold">{fp(trendSummary.totalGider)}</p>
                    </div>
                </div>

                {/* Chart */}
                <div className="p-5 h-[320px]">
                    <AreaChart data={dailyTrend} xDataKey="date" animationDuration={800} aspectRatio="auto" className="h-[280px]">
                        <Grid numTicksRows={5} numTicksColumns={0} strokeDasharray="3 3" stroke="#334155" fadeHorizontal={false} />
                        <XAxis numTicks={7} tickerHalfWidth={40} />
                        <YAxis numTicks={5} formatValue={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />

                        {/* Define areas in the order of layering (bottom to top for interactions, though visually overlapping) */}
                        <Area dataKey="gider" fill="#f42559" stroke="#f42559" fillOpacity={0.2} gradientToOpacity={0} curve={undefined} strokeWidth={2} />
                        <Area dataKey="gelir" fill="#4144f1" stroke="#4144f1" fillOpacity={0.3} gradientToOpacity={0} curve={undefined} strokeWidth={2.5} />
                        <Area dataKey="kar" fill="#2aef8c" stroke="#2aef8c" fillOpacity={0.3} gradientToOpacity={0} curve={undefined} strokeWidth={2} />

                        <ChartTooltip
                            content={({ point }) => (
                                <div className="flex flex-col gap-2 p-1 min-w-[140px]">
                                    <div className="text-slate-400 text-xs mb-1 font-medium">{point.displayDate as string}</div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#4144f1]"></span> Gelir</span>
                                        <span className="font-semibold text-white">{fp(point.gelir as number)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#2aef8c]"></span> Kâr</span>
                                        <span className="font-semibold text-white">{fp(point.kar as number)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#f42559]"></span> Gider</span>
                                        <span className="font-semibold text-white">{fp(point.gider as number)}</span>
                                    </div>
                                </div>
                            )}
                        />
                    </AreaChart>
                </div>
            </div>

            {/* AI Forecast Section */}
            <div className="bg-surface rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🤖</span>
                        <div>
                            <h3 className="text-white font-bold">AI Satış Tahmini</h3>
                            <p className="text-slate-400 text-xs">Gemini AI ile analiz</p>
                        </div>
                    </div>
                    <button onClick={handleGetForecast} disabled={loading}
                        className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/80 disabled:opacity-50 text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">{loading ? 'progress_activity' : 'auto_awesome'}</span>
                        {loading ? 'Analiz ediliyor...' : 'Tahmin Al'}
                    </button>
                </div>
                <div className="p-5">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">❌ {error}</div>
                    )}
                    {!forecast && !loading && !error && (
                        <div className="flex flex-col items-center py-8 text-slate-500">
                            <span className="text-5xl mb-3">📊</span>
                            <p className="text-sm">"Tahmin Al" butonuna tıklayın</p>
                            <p className="text-xs mt-1 text-slate-600">Geçmiş satışlarınız AI ile analiz edilecek</p>
                        </div>
                    )}
                    {loading && (
                        <div className="flex flex-col items-center py-8 text-slate-400">
                            <span className="material-symbols-outlined text-4xl animate-spin mb-3">progress_activity</span>
                            <p className="text-sm">Satışlarınız analiz ediliyor...</p>
                        </div>
                    )}
                    {forecast && !loading && (
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-800 rounded-xl p-4">
                                    <p className="text-slate-400 text-xs mb-1">Haftalık Tahmin</p>
                                    <p className="text-white text-xl font-bold">{fp(forecast.nextWeekForecast || 0)}</p>
                                </div>
                                <div className="bg-slate-800 rounded-xl p-4">
                                    <p className="text-slate-400 text-xs mb-1">Aylık Tahmin</p>
                                    <p className="text-white text-xl font-bold">{fp(forecast.nextMonthForecast || 0)}</p>
                                </div>
                            </div>
                            {forecast.trend && (
                                <div className="flex items-center gap-2 bg-slate-800 rounded-xl p-4">
                                    <span className="material-symbols-outlined">
                                        {forecast.trend === 'artış' ? 'trending_up' : forecast.trend === 'düşüş' ? 'trending_down' : 'trending_flat'}
                                    </span>
                                    <span className={`font-bold ${trendColors[forecast.trend] || 'text-white'}`}>
                                        {forecast.trend.charAt(0).toUpperCase() + forecast.trend.slice(1)}
                                    </span>
                                    {forecast.trendPercent && <span className="text-slate-400 text-sm">(%{Math.abs(forecast.trendPercent)})</span>}
                                </div>
                            )}
                            {forecast.recommendations?.length > 0 && (
                                <div>
                                    <p className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">AI Önerileri</p>
                                    <ul className="space-y-2">
                                        {forecast.recommendations.map((r: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                                <span className="text-primary mt-0.5">•</span>{r}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {forecast.riskFactors?.length > 0 && (
                                <div>
                                    <p className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">⚠️ Risk Faktörleri</p>
                                    <ul className="space-y-2">
                                        {forecast.riskFactors.map((r: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-red-300">
                                                <span className="mt-0.5">⚠</span>{r}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <p className="text-slate-600 text-xs text-center">* AI tahminleri geçmiş verilere dayalı olup garanti edilmez</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
