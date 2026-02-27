import { useState, useRef, useCallback } from 'react';
import type { PhoneStock, PhoneSale, Customer } from '../types';
import { formatDate, generateId, getPaymentMethodLabel } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';
import { Html5Qrcode } from 'html5-qrcode';
import CustomerSelector from '../components/CustomerSelector';

interface PhoneSalesPageProps {
    phoneStocks: PhoneStock[];
    phoneSales: PhoneSale[];
    setPhoneStocks: (ps: PhoneStock[]) => void;
    setPhoneSales: (ps: PhoneSale[]) => void;
    customers: Customer[];
    setCustomers: (c: Customer[]) => void;
}

export default function PhoneSalesPage({ phoneStocks, phoneSales, setPhoneStocks, setPhoneSales, customers, setCustomers }: PhoneSalesPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [selectedStock, setSelectedStock] = useState<PhoneStock | null>(null);
    const [selectedPhoneSale, setSelectedPhoneSale] = useState<PhoneSale | null>(null);
    const [showAddStock, setShowAddStock] = useState(false);
    const [search, setSearch] = useState('');

    // Sale form
    const [salePrice, setSalePrice] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');

    // Add stock form
    const [stockForm, setStockForm] = useState({ brand: '', model: '', imei: '', purchasePrice: 0, salePrice: 0, notes: '' });
    const [showImeiScanner, setShowImeiScanner] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    const startImeiScanner = useCallback(async () => {
        try {
            const scanner = new Html5Qrcode('phone-imei-scanner-region');
            scannerRef.current = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 280, height: 100 } },
                (decodedText) => {
                    setStockForm(f => ({ ...f, imei: decodedText }));
                    scanner.stop().then(() => scanner.clear()).catch(() => { });
                    scannerRef.current = null;
                    setShowImeiScanner(false);
                    showToast('IMEI okundu!');
                },
                () => { }
            );
        } catch (err) {
            showToast('Kamera açılamadı!', 'error');
            setShowImeiScanner(false);
        }
    }, [showToast]);

    const stopImeiScanner = useCallback(() => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => { });
            scannerRef.current = null;
        }
        setShowImeiScanner(false);
    }, []);

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
            {/* Main Panel - Stock Grid & Sales */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
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
                            className={`p-4 rounded-xl border cursor-pointer transition-all hover:border-cyan-500 bg-surface-dark group`}
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
                            {phoneSales.map(ps => (
                                <div key={ps.id} onClick={() => { setSelectedPhoneSale(ps); setSelectedStock(null); }} className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all bg-slate-800/50 hover:bg-slate-700/50 border border-transparent hover:border-cyan-500/30">
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

            {/* Sale Form / Detail Modal */}
            {(selectedStock || selectedPhoneSale) && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setSelectedStock(null); setSelectedPhoneSale(null); }}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            {/* Phone Sale Detail Panel */}
                            {selectedPhoneSale ? (
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-bold text-white">Satış Detayı</h3>
                                        <button onClick={() => setSelectedPhoneSale(null)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400">
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </div>

                                    {/* Device */}
                                    <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cihaz Bilgileri</p>
                                        <h4 className="text-lg font-semibold text-cyan-400">{selectedPhoneSale.brand} {selectedPhoneSale.model}</h4>
                                        {selectedPhoneSale.imei && <p className="text-xs text-slate-400 font-mono">IMEI: {selectedPhoneSale.imei}</p>}
                                    </div>

                                    {/* Customer */}
                                    {(selectedPhoneSale.customerName || selectedPhoneSale.customerPhone) && (
                                        <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Müşteri Bilgileri</p>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center"><span className="material-symbols-outlined text-cyan-400">person</span></div>
                                                <div>
                                                    <p className="font-medium text-white">{selectedPhoneSale.customerName || '—'}</p>
                                                    <p className="text-xs text-slate-400">{selectedPhoneSale.customerPhone || '—'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Date */}
                                    <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Satış Tarihi</p>
                                        <div className="flex items-center gap-3">
                                            <span className="material-symbols-outlined text-emerald-400 text-lg">event</span>
                                            <p className="text-sm text-white">{formatDate(selectedPhoneSale.date)}</p>
                                        </div>
                                    </div>

                                    {/* Financials */}
                                    <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fiyat Detayları</p>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm"><span className="text-slate-400">Alış Fiyatı</span><span className="text-white font-medium">{fp(selectedPhoneSale.salePrice - selectedPhoneSale.profit)}</span></div>
                                            <div className="flex justify-between text-sm"><span className="text-slate-400">Satış Fiyatı</span><span className="text-cyan-400 font-medium">{fp(selectedPhoneSale.salePrice)}</span></div>
                                            <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold"><span className="text-slate-300">Net Kâr</span><span className="text-emerald-400">{fp(selectedPhoneSale.profit)}</span></div>
                                        </div>
                                    </div>

                                    {/* Payment */}
                                    <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ödeme Yöntemi</p>
                                        <p className="text-sm text-white">
                                            {selectedPhoneSale.paymentMethod === 'cash' ? '💵 Nakit' : selectedPhoneSale.paymentMethod === 'card' ? '💳 Kart' : '🏦 Havale'}
                                        </p>
                                    </div>

                                    {/* Notes */}
                                    {selectedPhoneSale.notes && (
                                        <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notlar</p>
                                            <p className="text-sm text-slate-300">{selectedPhoneSale.notes}</p>
                                        </div>
                                    )}
                                </div>
                            ) : selectedStock ? (
                                <>
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-lg font-bold text-white">Satış İşlemi</h3>
                                        <button onClick={() => setSelectedStock(null)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400">
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </div>
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
                                        <CustomerSelector
                                            customers={customers}
                                            selectedCustomerName={customerName}
                                            selectedCustomerPhone={customerPhone}
                                            onSelect={(name, phone) => { setCustomerName(name); setCustomerPhone(phone); }}
                                            onAddNew={async (c) => { try { const r = await api.saveCustomer(c); if (r) setCustomers([r as unknown as Customer, ...customers]); } catch { } }}
                                        />

                                        <button onClick={handleSale}
                                            className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-semibold shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all">
                                            <span className="material-symbols-outlined">sell</span>Satışı Tamamla
                                        </button>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

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
                                <div className="flex gap-2">
                                    <input type="text" value={stockForm.imei} onChange={e => setStockForm({ ...stockForm, imei: e.target.value })}
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-cyan-500 outline-none" placeholder="Manuel girin veya tarayın" />
                                    <button type="button" onClick={() => setShowImeiScanner(true)} className="px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-400 transition-all" title="Kamera ile IMEI tara">
                                        <span className="material-symbols-outlined text-lg">photo_camera</span>
                                    </button>
                                </div></div>
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

            {/* IMEI Scanner Modal */}
            {showImeiScanner && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60]">
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">IMEI Tarayıcı</h3>
                            <button onClick={stopImeiScanner} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-4">
                            <div id="phone-imei-scanner-region" className="rounded-lg overflow-hidden bg-black" style={{ minHeight: 280 }}></div>
                            <p className="text-xs text-slate-400 mt-3 text-center">Telefon IMEI barkodunu kameraya gösterin</p>
                        </div>
                        <div className="p-4 border-t border-slate-700">
                            {!scannerRef.current && <button onClick={startImeiScanner} className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium">Taramayı Başlat</button>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
