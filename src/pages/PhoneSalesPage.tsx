import { useState } from 'react';
import type { PhoneStock, PhoneSale } from '../types';
import { formatDate, generateId, getPaymentMethodLabel } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';

interface PhoneSalesPageProps {
    phoneStocks: PhoneStock[];
    phoneSales: PhoneSale[];
    setPhoneStocks: (ps: PhoneStock[]) => void;
    setPhoneSales: (ps: PhoneSale[]) => void;
}

export default function PhoneSalesPage({ phoneStocks, phoneSales, setPhoneStocks, setPhoneSales }: PhoneSalesPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [selectedStock, setSelectedStock] = useState<PhoneStock | null>(null);
    const [showAddStock, setShowAddStock] = useState(false);
    const [search, setSearch] = useState('');

    // Sale form
    const [salePrice, setSalePrice] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');

    // Add stock form
    const [stockForm, setStockForm] = useState({ brand: '', model: '', imei: '', purchasePrice: 0, salePrice: 0, notes: '' });

    const inStockPhones = phoneStocks.filter(ps => ps.status === 'in_stock');
    const filteredStocks = inStockPhones.filter(ps =>
        !search || `${ps.brand} ${ps.model}`.toLowerCase().includes(search.toLowerCase()) || ps.imei?.includes(search)
    );

    const handleSelectStock = (ps: PhoneStock) => {
        setSelectedStock(ps);
        setSalePrice(ps.salePrice);
    };

    const handleSale = async () => {
        if (!selectedStock) return;
        try {
            const id = generateId();
            const phoneSale: PhoneSale = {
                id, brand: selectedStock.brand, model: selectedStock.model, imei: selectedStock.imei,
                purchasePrice: selectedStock.purchasePrice, salePrice, profit: salePrice - selectedStock.purchasePrice,
                customerName: customerName || undefined, customerPhone: customerPhone || undefined,
                date: new Date().toISOString(), paymentMethod,
                paymentDetails: { [paymentMethod]: salePrice }
            };
            await api.savePhoneSale(phoneSale);
            await api.updatePhoneStockStatus(selectedStock.id, 'sold');
            setPhoneSales([phoneSale, ...phoneSales]);
            setPhoneStocks(phoneStocks.map(ps => ps.id === selectedStock.id ? { ...ps, status: 'sold' as const } : ps));
            setSelectedStock(null);
            setCustomerName('');
            setCustomerPhone('');
            showToast('Telefon satışı kaydedildi!');
        } catch { showToast('Hata oluştu!', 'error'); }
    };

    const handleAddStock = async () => {
        if (!stockForm.brand || !stockForm.model) { showToast('Marka ve model zorunlu!', 'error'); return; }
        try {
            const result = await api.savePhoneStock({
                brand: stockForm.brand, model: stockForm.model, imei: stockForm.imei,
                purchasePrice: stockForm.purchasePrice, salePrice: stockForm.salePrice,
                notes: stockForm.notes, status: 'in_stock'
            });
            if (result) {
                setPhoneStocks([{ ...result, status: 'in_stock' } as PhoneStock, ...phoneStocks]);
            }
            setShowAddStock(false);
            setStockForm({ brand: '', model: '', imei: '', purchasePrice: 0, salePrice: 0, notes: '' });
            showToast('Telefon stoka eklendi!');
        } catch { showToast('Hata!', 'error'); }
    };

    const handleDeleteStock = async (id: string) => {
        if (!confirm('Silmek istediğinize emin misiniz?')) return;
        try {
            await api.deletePhoneStock(id);
            setPhoneStocks(phoneStocks.filter(ps => ps.id !== id));
            if (selectedStock?.id === id) setSelectedStock(null);
            showToast('Silindi!');
        } catch { showToast('Hata!', 'error'); }
    };

    return (
        <div className="flex-1 flex h-full overflow-hidden">
            {/* Left Panel - Stock Grid */}
            <div className="flex-1 overflow-y-auto p-6 border-r border-slate-700 scrollbar-thin">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Telefon Stoku</h2>
                        <p className="text-cyan-400 text-sm mt-1">{inStockPhones.length} adet stokta</p>
                    </div>
                    <button onClick={() => setShowAddStock(true)} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-cyan-500/25 flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">add</span>Telefon Ekle
                    </button>
                </div>

                <div className="relative mb-4">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Model, IMEI ara..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {filteredStocks.length === 0 ? (
                        <div className="col-span-2 text-center py-16 text-slate-400">
                            <span className="material-symbols-outlined text-6xl mb-4 block">smartphone</span>
                            <p>Stokta telefon yok</p>
                        </div>
                    ) : filteredStocks.map(ps => (
                        <div
                            key={ps.id}
                            onClick={() => handleSelectStock(ps)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedStock?.id === ps.id
                                    ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/30'
                                    : 'border-slate-700 bg-surface-dark hover:border-slate-600'
                                }`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-medium text-white">{ps.brand} {ps.model}</h4>
                                    <p className="text-xs text-slate-400 font-mono mt-1">{ps.imei || 'IMEI yok'}</p>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteStock(ps.id); }}
                                    className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400">
                                    <span className="material-symbols-outlined text-base">close</span>
                                </button>
                            </div>
                            <div className="flex justify-between items-center mt-3">
                                <span className="text-cyan-400 font-bold">{fp(ps.salePrice)}</span>
                                <span className="text-xs text-slate-400">Alış: {fp(ps.purchasePrice)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Recent Phone Sales */}
                {phoneSales.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-lg font-semibold text-white mb-4">Son Satışlar</h3>
                        <div className="space-y-2">
                            {phoneSales.slice(0, 5).map(ps => (
                                <div key={ps.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                                    <div>
                                        <span className="text-sm font-medium text-white">{ps.brand} {ps.model}</span>
                                        <span className="text-xs text-slate-400 ml-2">{formatDate(ps.date)}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{getPaymentMethodLabel(ps.paymentMethod)}</span>
                                        <span className="text-emerald-400 font-medium text-sm">+{fp(ps.profit)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel - Sale Form */}
            <div className="w-96 overflow-y-auto p-6 bg-surface-dark/50 scrollbar-thin">
                <h3 className="text-lg font-bold text-white mb-6">Satış İşlemi</h3>

                {selectedStock ? (
                    <div className="space-y-5">
                        {/* Selected Phone Summary */}
                        <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                            <h4 className="font-semibold text-cyan-400">{selectedStock.brand} {selectedStock.model}</h4>
                            <p className="text-xs text-slate-400 font-mono mt-1">{selectedStock.imei}</p>
                            <div className="flex justify-between mt-3">
                                <span className="text-sm text-slate-400">Alış: {fp(selectedStock.purchasePrice)}</span>
                                <span className="text-sm text-emerald-400">Kâr: {fp(salePrice - selectedStock.purchasePrice)}</span>
                            </div>
                        </div>

                        {/* Sale Price */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Satış Fiyatı</label>
                            <input type="number" value={salePrice} onChange={e => setSalePrice(Number(e.target.value))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-cyan-500 outline-none text-lg font-bold" />
                        </div>

                        {/* Payment */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Ödeme Yöntemi</label>
                            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-cyan-500 outline-none">
                                <option value="cash">Nakit</option><option value="card">Kart</option><option value="transfer">Havale</option>
                            </select>
                        </div>

                        {/* Customer */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Müşteri Adı</label>
                            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Opsiyonel"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Telefon</label>
                            <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Opsiyonel"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none" />
                        </div>

                        <button onClick={handleSale}
                            className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-semibold shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all">
                            <span className="material-symbols-outlined">sell</span>Satışı Tamamla
                        </button>
                    </div>
                ) : (
                    <div className="text-center py-12 text-slate-400">
                        <span className="material-symbols-outlined text-6xl mb-4 block">touch_app</span>
                        <p>Satış yapabilmek için sol panelden bir telefon seçin</p>
                    </div>
                )}
            </div>

            {/* Add Stock Modal */}
            {showAddStock && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddStock(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-full max-w-lg animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">Yeni Telefon Ekle</h3>
                            <button onClick={() => setShowAddStock(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Marka *</label>
                                    <input type="text" value={stockForm.brand} onChange={e => setStockForm({ ...stockForm, brand: e.target.value })} placeholder="Apple, Samsung..."
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-cyan-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Model *</label>
                                    <input type="text" value={stockForm.model} onChange={e => setStockForm({ ...stockForm, model: e.target.value })} placeholder="iPhone 15 Pro..."
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-cyan-500 outline-none" /></div>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">IMEI</label>
                                <input type="text" value={stockForm.imei} onChange={e => setStockForm({ ...stockForm, imei: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-cyan-500 outline-none" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Alış Fiyatı</label>
                                    <input type="number" value={stockForm.purchasePrice} onChange={e => setStockForm({ ...stockForm, purchasePrice: Number(e.target.value) })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-cyan-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Satış Fiyatı</label>
                                    <input type="number" value={stockForm.salePrice} onChange={e => setStockForm({ ...stockForm, salePrice: Number(e.target.value) })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-cyan-500 outline-none" /></div>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Notlar</label>
                                <textarea value={stockForm.notes} onChange={e => setStockForm({ ...stockForm, notes: e.target.value })} rows={2}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-cyan-500 outline-none resize-none" /></div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowAddStock(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleAddStock} className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-cyan-500/25">Ekle</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
