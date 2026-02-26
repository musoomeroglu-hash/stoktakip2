import { useState } from 'react';
import { formatCurrency } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';

type CalcTab = 'standard' | 'profit' | 'vat';

export default function CalculatorPage() {
    const fp = useFormatPrice();
    const [activeTab, setActiveTab] = useState<CalcTab>('standard');

    // Standard calc state
    const [display, setDisplay] = useState('0');
    const [expression, setExpression] = useState('');
    const [history, setHistory] = useState<string[]>([]);

    // Profit calc state
    const [purchasePrice, setPurchasePrice] = useState(0);
    const [salePrice, setSalePrice] = useState(0);
    const [vatRate, setVatRate] = useState(20);

    // VAT calc state
    const [vatAmount, setVatAmount] = useState(0);
    const [vatDirection, setVatDirection] = useState<'inclusive' | 'exclusive'>('exclusive');
    const [vatCalcRate, setVatCalcRate] = useState(20);

    // Standard calculator
    const handleCalcInput = (val: string) => {
        if (val === 'C') { setDisplay('0'); setExpression(''); return; }
        if (val === '⌫') { setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0'); return; }
        if (val === '=') {
            try {
                const expr = (expression + display).replace(/×/g, '*').replace(/÷/g, '/');
                const result = new Function('return ' + expr)();
                const resultStr = parseFloat(result.toFixed(8)).toString();
                setHistory(prev => [`${expression}${display} = ${resultStr}`, ...prev].slice(0, 10));
                setDisplay(resultStr);
                setExpression('');
            } catch { setDisplay('Hata'); }
            return;
        }
        if (['+', '-', '×', '÷'].includes(val)) {
            setExpression(prev => prev + display + ` ${val} `);
            setDisplay('0');
            return;
        }
        if (val === '.' && display.includes('.')) return;
        setDisplay(prev => prev === '0' && val !== '.' ? val : prev + val);
    };

    // Profit calculation
    const grossProfit = salePrice - purchasePrice;
    const margin = purchasePrice > 0 ? (grossProfit / purchasePrice) * 100 : 0;
    const vatFromSale = salePrice > 0 ? (salePrice * vatRate) / (100 + vatRate) : 0;
    const netProfit = grossProfit - vatFromSale;

    // VAT calculation
    const calcVAT = () => {
        if (vatDirection === 'exclusive') {
            const vat = vatAmount * (vatCalcRate / 100);
            return { base: vatAmount, vat, total: vatAmount + vat };
        } else {
            const base = vatAmount / (1 + vatCalcRate / 100);
            const vat = vatAmount - base;
            return { base, vat, total: vatAmount };
        }
    };
    const vatResult = calcVAT();

    const tabs: { id: CalcTab; label: string; icon: string }[] = [
        { id: 'standard', label: 'Hesap Makinası', icon: 'calculate' },
        { id: 'profit', label: 'Kâr Hesabı', icon: 'trending_up' },
        { id: 'vat', label: 'KDV Hesabı', icon: 'receipt' },
    ];

    const calcBtns = [
        ['C', '⌫', '÷', '×'],
        ['7', '8', '9', '-'],
        ['4', '5', '6', '+'],
        ['1', '2', '3', '='],
        ['0', '.', '', ''],
    ];

    return (
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-white">Hesap Makinası</h2>
                    <p className="text-primary text-sm mt-1">Hızlı hesaplama araçları</p>
                </div>

                {/* Tab Selector */}
                <div className="flex justify-center gap-2 mb-6">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'bg-surface-dark text-slate-300 hover:bg-surface-hover border border-slate-700'
                                }`}>
                            <span className="material-symbols-outlined text-base">{tab.icon}</span>{tab.label}
                        </button>
                    ))}
                </div>

                {/* Standard Calculator */}
                {activeTab === 'standard' && (
                    <div className="grid grid-cols-3 gap-6">
                        <div className="col-span-2 bg-surface-dark border border-slate-700/50 rounded-2xl p-6">
                            {/* Display */}
                            <div className="bg-slate-800/50 rounded-xl p-4 mb-4">
                                <div className="text-right text-sm text-slate-400 h-6 overflow-hidden">{expression}</div>
                                <div className="text-right text-3xl font-bold text-white font-mono">{display}</div>
                            </div>
                            {/* Buttons */}
                            <div className="grid grid-cols-4 gap-2">
                                {calcBtns.flat().filter(Boolean).map(btn => (
                                    <button key={btn} onClick={() => handleCalcInput(btn)}
                                        className={`p-4 rounded-xl text-lg font-semibold transition-all ${btn === '=' ? 'bg-primary hover:bg-primary-hover text-white row-span-1 shadow-lg shadow-primary/25' :
                                                ['C', '⌫'].includes(btn) ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' :
                                                    ['+', '-', '×', '÷'].includes(btn) ? 'bg-primary/10 text-primary hover:bg-primary/20' :
                                                        'bg-slate-800 text-white hover:bg-slate-700'
                                            }`}>
                                        {btn}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* History */}
                        <div className="bg-surface-dark border border-slate-700/50 rounded-2xl p-4">
                            <h4 className="text-sm font-semibold text-slate-400 mb-3">Geçmiş</h4>
                            <div className="space-y-2">
                                {history.length === 0 ? <p className="text-xs text-slate-500">Henüz işlem yok</p> :
                                    history.map((h, i) => <div key={i} className="text-xs text-slate-300 p-2 rounded bg-slate-800/50 font-mono">{h}</div>)}
                            </div>
                        </div>
                    </div>
                )}

                {/* Profit Calculator */}
                {activeTab === 'profit' && (
                    <div className="bg-surface-dark border border-slate-700/50 rounded-2xl p-6 space-y-6">
                        <div className="grid grid-cols-3 gap-4">
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Alış Fiyatı</label>
                                <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(Number(e.target.value))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-lg text-white font-bold focus:border-primary outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Satış Fiyatı</label>
                                <input type="number" value={salePrice} onChange={e => setSalePrice(Number(e.target.value))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-lg text-white font-bold focus:border-primary outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">KDV Oranı (%)</label>
                                <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-lg text-white focus:border-primary outline-none">
                                    <option value={1}>%1</option><option value={10}>%10</option><option value={20}>%20</option>
                                </select></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: 'Brüt Kâr', value: fp(grossProfit), color: grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
                                { label: 'Kâr Marjı', value: `%${margin.toFixed(1)}`, color: margin >= 0 ? 'text-emerald-400' : 'text-red-400' },
                                { label: 'KDV Tutarı', value: fp(vatFromSale), color: 'text-orange-400' },
                                { label: 'Net Kâr', value: fp(netProfit), color: netProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
                            ].map(r => (
                                <div key={r.label} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                                    <p className="text-sm text-slate-400 mb-1">{r.label}</p>
                                    <p className={`text-2xl font-bold ${r.color}`}>{r.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* VAT Calculator */}
                {activeTab === 'vat' && (
                    <div className="bg-surface-dark border border-slate-700/50 rounded-2xl p-6 space-y-6">
                        <div className="flex gap-2 justify-center">
                            <button onClick={() => setVatDirection('exclusive')} className={`px-4 py-2 rounded-lg text-sm font-medium ${vatDirection === 'exclusive' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>KDV Hariç → Dahil</button>
                            <button onClick={() => setVatDirection('inclusive')} className={`px-4 py-2 rounded-lg text-sm font-medium ${vatDirection === 'inclusive' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>KDV Dahil → Hariç</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Tutar</label>
                                <input type="number" value={vatAmount} onChange={e => setVatAmount(Number(e.target.value))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-lg text-white font-bold focus:border-primary outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">KDV Oranı (%)</label>
                                <select value={vatCalcRate} onChange={e => setVatCalcRate(Number(e.target.value))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-lg text-white focus:border-primary outline-none">
                                    <option value={1}>%1</option><option value={10}>%10</option><option value={20}>%20</option>
                                </select></div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: 'KDV Hariç Tutar', value: fp(vatResult.base), color: 'text-white' },
                                { label: 'KDV Tutarı', value: fp(vatResult.vat), color: 'text-orange-400' },
                                { label: 'KDV Dahil Toplam', value: fp(vatResult.total), color: 'text-emerald-400' },
                            ].map(r => (
                                <div key={r.label} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                                    <p className="text-sm text-slate-400 mb-1">{r.label}</p>
                                    <p className={`text-xl font-bold ${r.color}`}>{r.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
