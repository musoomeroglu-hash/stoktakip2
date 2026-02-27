import { useState, useMemo } from 'react';
import type { Purchase, Supplier, Product } from '../types';
import { formatDate, getPurchaseStatusInfo, generateId } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';

interface PurchasesPageProps {
    purchases: Purchase[];
    suppliers: Supplier[];
    products: Product[];
    setPurchases: (p: Purchase[]) => void;
    setProducts: (p: Product[]) => void;
    onRefresh: () => void;
}

interface CartItem {
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
}

export default function PurchasesPage({ purchases, suppliers, products, setPurchases, setProducts, onRefresh }: PurchasesPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [showModal, setShowModal] = useState(false);
    const [search, setSearch] = useState('');

    // Form
    const [supplierId, setSupplierId] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState(`FTR-${new Date().getFullYear()}-${String(purchases.length + 1).padStart(3, '0')}`);
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState('nakit');
    const [discount, setDiscount] = useState(0);
    const [notes, setNotes] = useState('');
    const [cartItems, setCartItems] = useState<CartItem[]>([]);

    const filtered = useMemo(() =>
        purchases.filter(p => !search || p.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) || p.supplier?.name.toLowerCase().includes(search.toLowerCase())),
        [purchases, search]);

    const totalPurchases = purchases.length;
    const totalAmount = purchases.reduce((s, p) => s + (p.total || 0), 0);
    const unpaidAmount = purchases.filter(p => p.status !== 'odendi').reduce((s, p) => s + (p.remaining || 0), 0);

    const subtotal = cartItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const grandTotal = subtotal - discount;

    const addCartItem = () => {
        setCartItems([...cartItems, { productId: '', productName: '', quantity: 1, unitCost: 0 }]);
    };

    const updateCartItem = (idx: number, field: string, value: string | number) => {
        const items = [...cartItems];
        if (field === 'productId') {
            const prod = products.find(p => p.id === value);
            if (prod) items[idx] = { ...items[idx], productId: prod.id, productName: prod.name, unitCost: prod.purchasePrice };
        } else {
            (items[idx] as Record<string, unknown>)[field] = value;
        }
        setCartItems(items);
    };

    const handleSave = async () => {
        if (!supplierId || cartItems.length === 0) { showToast('Tedarikçi ve ürün zorunlu!', 'error'); return; }
        try {
            const purchaseData = {
                supplierId, purchaseDate, invoiceNumber, paymentMethod,
                status: 'odenmedi' as const, subtotal, discount, total: grandTotal,
                paidAmount: 0, remaining: grandTotal, currency: 'TRY', exchangeRate: 1, notes
            };
            const result = await api.savePurchase(purchaseData);
            if (result?.id) {
                const items = cartItems.map(i => ({
                    purchaseId: result.id, productId: i.productId,
                    quantity: i.quantity, unitCost: i.unitCost, totalCost: i.quantity * i.unitCost
                }));
                await api.savePurchaseItems(items);
                // Update product stocks in KV
                for (const item of cartItems) {
                    const prod = products.find(p => p.id === item.productId);
                    if (prod) {
                        await api.saveProduct({ ...prod, stock: prod.stock + item.quantity, purchasePrice: item.unitCost });
                    }
                }
            }
            setShowModal(false);
            setCartItems([]);
            onRefresh();
            showToast('Alış kaydedildi!');
        } catch { showToast('Hata!', 'error'); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Silmek istediğinize emin misiniz?')) return;
        try {
            await api.deletePurchase(id);
            setPurchases(purchases.filter(p => p.id !== id));
            showToast('Silindi!');
        } catch { showToast('Hata!', 'error'); }
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            <div className="flex justify-between items-center">
                <div><h2 className="text-2xl font-bold text-white">Alışlar</h2><p className="text-amber-400 text-sm mt-1">Tedarikçi alış yönetimi</p></div>
                <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-amber-500/25 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">add</span>Yeni Alış
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { label: 'Toplam Alış', value: totalPurchases, icon: 'shopping_bag', color: 'text-amber-400', bgIcon: 'text-amber-500' },
                    { label: 'Toplam Tutar', value: fp(totalAmount), icon: 'payments', color: 'text-blue-400', bgIcon: 'text-blue-500' },
                    { label: 'Ödenmemiş', value: fp(unpaidAmount), icon: 'pending', color: 'text-red-400', bgIcon: 'text-red-500' },
                ].map(card => (
                    <div key={card.label} className="glass-panel p-5 rounded-xl flex flex-col justify-between h-32 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10"><span className={`material-symbols-outlined text-6xl ${card.bgIcon}`}>{card.icon}</span></div>
                        <div><p className="text-slate-400 text-sm mb-1">{card.label}</p><h3 className="text-2xl font-bold text-white">{card.value}</h3></div>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div className="bg-surface-dark border border-slate-700/50 p-4 rounded-xl">
                <div className="relative w-64">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Fatura no, tedarikçi..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 outline-none" />
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface-dark border border-slate-700/50 rounded-xl overflow-hidden">
                <table className="w-full text-left min-w-[800px]">
                    <thead><tr className="bg-slate-800/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                        <th className="p-4">Fatura No</th><th className="p-4">Tedarikçi</th><th className="p-4">Tarih</th>
                        <th className="p-4 text-right">Tutar</th><th className="p-4 text-right">Kalan</th><th className="p-4">Durum</th><th className="p-4 text-center">İşlemler</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-700/50 text-sm">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-16 text-slate-400">
                                <span className="material-symbols-outlined text-6xl mb-4 block">inbox</span><p>Alış kaydı yok</p>
                            </td></tr>
                        ) : filtered.map(p => {
                            const st = getPurchaseStatusInfo(p.status);
                            return (
                                <tr key={p.id} className="hover:bg-surface-hover/50 transition-colors">
                                    <td className="p-4 font-mono text-white">{p.invoiceNumber || '—'}</td>
                                    <td className="p-4">{p.supplier?.name || '—'}</td>
                                    <td className="p-4 text-slate-300">{p.purchaseDate ? formatDate(p.purchaseDate) : '—'}</td>
                                    <td className="p-4 text-right font-medium text-white">{fp(p.total || 0)}</td>
                                    <td className="p-4 text-right font-medium text-red-400">{fp(p.remaining || 0)}</td>
                                    <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span></td>
                                    <td className="p-4 text-center">
                                        <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400">
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* New Purchase Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-4xl max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">Yeni Alış</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Tedarikçi *</label>
                                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none">
                                        <option value="">Seçin...</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Fatura No</label>
                                    <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Tarih</label>
                                    <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Ödeme Yöntemi</label>
                                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none">
                                        <option value="nakit">Nakit</option><option value="havale">Havale</option><option value="kart">Kart</option><option value="vadeli">Vadeli</option>
                                    </select></div>
                            </div>

                            {/* Cart Items */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-medium text-slate-300">Ürünler</label>
                                    <button onClick={addCartItem} className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-base">add</span>Ürün Ekle
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {cartItems.map((item, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <select value={item.productId} onChange={e => updateCartItem(idx, 'productId', e.target.value)}
                                                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none">
                                                <option value="">Ürün seçin...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                            <input type="number" min="1" value={item.quantity} onChange={e => updateCartItem(idx, 'quantity', Number(e.target.value))}
                                                className="w-20 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white text-center focus:border-amber-500 outline-none" placeholder="Adet" />
                                            <input type="number" value={item.unitCost} onChange={e => updateCartItem(idx, 'unitCost', Number(e.target.value))}
                                                className="w-32 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white text-right focus:border-amber-500 outline-none" placeholder="Birim Fiyat" />
                                            <span className="w-28 text-right text-sm text-white font-medium">{fp(item.quantity * item.unitCost)}</span>
                                            <button onClick={() => setCartItems(cartItems.filter((_, i) => i !== idx))} className="p-1 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded">
                                                <span className="material-symbols-outlined text-lg">close</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Totals */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Notlar</label>
                                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none resize-none" /></div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm"><span className="text-slate-400">Ara Toplam</span><span className="text-white">{fp(subtotal)}</span></div>
                                    <div className="flex justify-between text-sm items-center"><span className="text-slate-400">İskonto</span>
                                        <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} className="w-28 bg-slate-800 border border-slate-700 rounded py-1 px-2 text-sm text-white text-right focus:border-amber-500 outline-none" />
                                    </div>
                                    <div className="flex justify-between font-bold border-t border-slate-700 pt-2"><span className="text-amber-400">TOPLAM</span><span className="text-white text-lg">{fp(grandTotal)}</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-amber-500/25">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
