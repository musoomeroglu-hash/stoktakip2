import { useState, useMemo, useRef, useEffect } from 'react';
import type { Product, Category } from '../types';
import { getStockStatus } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';
import BarcodePrintModal from '../components/BarcodePrintModal';
import IMEIChecker from '../components/IMEIChecker';
import BulkProductImportModal from '../components/BulkProductImportModal';
import { Html5Qrcode } from 'html5-qrcode';

interface ProductsPageProps {
    products: Product[];
    categories: Category[];
    setProducts: (p: Product[]) => void;
    setCategories: (c: Category[]) => void;
}

export default function ProductsPage({ products, categories, setProducts, setCategories }: ProductsPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('all');
    const [stockFilter, setStockFilter] = useState('all');
    const [showProductModal, setShowProductModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [newCatName, setNewCatName] = useState('');
    const [showBarcodeModal, setShowBarcodeModal] = useState(false);
    const [showImeiModal, setShowImeiModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    const handleGenerateBarcode = async () => {
        try {
            const nextCode = await api.getNextInternalBarcode();
            setForm(prev => ({ ...prev, barcode: nextCode }));
            showToast('Yeni barkod üretildi: ' + nextCode);
        } catch {
            showToast('Barkod üretilemedi!', 'error');
        }
    };

    useEffect(() => {
        if (showBarcodeScanner) {
            const startScanner = async () => {
                try {
                    const scanner = new Html5Qrcode('product-form-barcode-scanner');
                    scannerRef.current = scanner;
                    await scanner.start(
                        { facingMode: 'environment' },
                        { fps: 10, qrbox: { width: 280, height: 100 } },
                        (decodedText) => {
                            setForm(prev => ({ ...prev, barcode: decodedText }));
                            scanner.stop().then(() => scanner.clear()).catch(() => {});
                            scannerRef.current = null;
                            setShowBarcodeScanner(false);
                            showToast('Barkod tarandı: ' + decodedText);
                        },
                        () => {}
                    );
                } catch (err) {
                    console.error('Scanner error:', err);
                    setShowBarcodeScanner(false);
                    showToast('Kamera başlatılamadı!', 'error');
                }
            };
            const timer = setTimeout(() => startScanner(), 300);
            return () => {
                clearTimeout(timer);
                if (scannerRef.current) {
                    scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
                    scannerRef.current = null;
                }
            };
        }
    }, [showBarcodeScanner, showToast]);

    // Form state
    const [form, setForm] = useState({
        name: '', categoryId: '', barcode: '', stock: 0, minStock: 5,
        purchasePrice: 0, salePrice: 0, description: ''
    });

    const filtered = useMemo(() => {
        return products.filter(p => {
            if (search && !(p.name || '').toLowerCase().includes(search.toLowerCase()) && !(p.barcode || '').includes(search)) return false;
            if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
            if (stockFilter === 'stokta' && (p.stock === 0 || p.stock <= p.minStock)) return false;
            if (stockFilter === 'kritik' && (p.stock === 0 || p.stock > p.minStock)) return false;
            if (stockFilter === 'stoksuz' && p.stock !== 0) return false;
            return true;
        });
    }, [products, search, catFilter, stockFilter]);

    // Stats
    const totalProducts = products.length;
    const totalValue = products.reduce((s, p) => s + p.stock * p.purchasePrice, 0);
    const criticalCount = products.filter(p => p.stock > 0 && p.stock <= p.minStock).length;

    const openCreateModal = () => {
        setEditingProduct(null);
        setForm({ name: '', categoryId: '', barcode: '', stock: 0, minStock: 5, purchasePrice: 0, salePrice: 0, description: '' });
        setShowProductModal(true);
    };

    const openEditModal = (p: Product) => {
        setEditingProduct(p);
        setForm({ name: p.name, categoryId: p.categoryId, barcode: p.barcode, stock: p.stock, minStock: p.minStock, purchasePrice: p.purchasePrice, salePrice: p.salePrice, description: p.description });
        setShowProductModal(true);
    };

    const handleSaveProduct = async () => {
        if (!form.name || !form.categoryId) { showToast('Ürün adı ve kategori zorunlu!', 'error'); return; }
        
        // Uniqueness check for barcode
        if (form.barcode) {
            const duplicate = products.find(p => p.barcode === form.barcode && p.id !== editingProduct?.id);
            if (duplicate) {
                showToast(`Bu barkod zaten başka bir ürüne ait! (${duplicate.name})`, 'error');
                return;
            }
        }

        try {
            const cat = categories.find(c => c.id === form.categoryId);
            const product: Product = {
                id: editingProduct?.id || '',
                name: form.name, categoryId: form.categoryId, categoryName: cat?.name || '',
                barcode: form.barcode, stock: form.stock, minStock: form.minStock,
                purchasePrice: form.purchasePrice, salePrice: form.salePrice, description: form.description
            };
            const saved = await api.saveProduct(product);
            if (saved) {
                if (editingProduct) {
                    setProducts(products.map(p => p.id === saved.id ? saved : p));
                } else {
                    setProducts([saved, ...products]);
                }
                setShowProductModal(false);
                showToast(editingProduct ? 'Ürün güncellendi!' : 'Ürün eklendi!');
            } else {
                showToast('Hata oluştu!', 'error');
            }
        } catch { showToast('Hata oluştu!', 'error'); }
    };

    const handleDeleteProduct = async (id: string) => {
        if (!confirm('Ürünü silmek istediğinize emin misiniz?')) return;
        try {
            await api.deleteProduct(id);
            setProducts(products.filter(p => p.id !== id));
            showToast('Ürün silindi!');
        } catch { showToast('Silinemedi!', 'error'); }
    };

    const handleSaveCategory = async () => {
        if (!newCatName.trim()) return;
        try {
            const cat: Category = { id: '', name: newCatName.trim() };
            const saved = await api.saveCategory(cat);
            if (saved) {
                setCategories([...categories, saved]);
                setNewCatName('');
                showToast('Kategori eklendi!');
            } else {
                showToast('Kategori eklenemedi!', 'error');
            }
        } catch { showToast('Hata!', 'error'); }
    };

    const handleDeleteCategory = async (id: string) => {
        try {
            await api.deleteCategory(id);
            setCategories(categories.filter(c => c.id !== id));
            showToast('Kategori silindi!');
        } catch { showToast('Silinemedi!', 'error'); }
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Toplam Ürün', value: totalProducts, icon: 'inventory_2', sub: 'Çeşit', color: 'text-blue-400', bgIcon: 'text-blue-500' },
                    { label: 'Toplam Stok Değeri', value: fp(totalValue), icon: 'payments', sub: 'Alış fiyatına göre', color: 'text-green-400', bgIcon: 'text-green-500' },
                    { label: 'Kritik Stok', value: criticalCount, icon: 'warning', sub: 'Aksiyon gerekli', color: 'text-red-400', bgIcon: 'text-red-500', pulse: criticalCount > 0 },
                    { label: 'Kategoriler', value: categories.length, icon: 'category', sub: 'Aktif kategori', color: 'text-purple-400', bgIcon: 'text-purple-500' },
                ].map(card => (
                    <div key={card.label} className="glass-panel p-5 rounded-xl flex flex-col justify-between h-32 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-10"><span className={`material-symbols-outlined text-6xl ${card.bgIcon}`}>{card.icon}</span></div>
                        <div><p className="text-slate-400 text-sm mb-1">{card.label}</p><h3 className="text-2xl font-bold text-white">{card.value}</h3></div>
                        <div className={`flex items-center gap-1 ${card.color} text-sm`}>
                            {card.pulse && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
                            <span className={card.pulse ? 'ml-1' : ''}>{card.sub}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row justify-between gap-4 items-center bg-surface-dark border border-slate-700/50 p-4 rounded-xl">
                <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    <div className="relative w-64">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-primary outline-none" placeholder="Ürün adı, barkod..." />
                    </div>
                    <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none">
                        <option value="all">Tüm Kategoriler</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={stockFilter} onChange={e => setStockFilter(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none">
                        <option value="all">Stok Durumu: Tümü</option><option value="stokta">Stokta</option><option value="kritik">Kritik</option><option value="stoksuz">Stoksuz</option>
                    </select>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowBulkModal(true)} className="px-3 py-2 text-indigo-400 hover:text-white hover:bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">post_add</span>Toplu Ekle
                    </button>
                    <button onClick={() => setShowImeiModal(true)} className="px-3 py-2 text-cyan-400 hover:text-white hover:bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">verified</span>IMEI Doğrula
                    </button>
                    <button onClick={() => setShowBarcodeModal(true)} className="px-3 py-2 text-emerald-400 hover:text-white hover:bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">barcode</span>Barkod Yazdır
                    </button>
                    <button onClick={() => setShowCategoryModal(true)} className="px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">category</span>Kategori Yönet
                    </button>
                    <button onClick={openCreateModal} className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-primary/20">
                        <span className="material-symbols-outlined text-lg">add</span>Ürün Ekle
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface-dark border border-slate-700/50 rounded-xl overflow-x-auto">
                <table className="w-full text-left min-w-[800px]">
                    <thead><tr className="bg-slate-800/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                        <th className="p-4 sticky left-0 z-20 bg-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">Ürün Adı</th><th className="p-4">Kategori</th><th className="p-4">Barkod</th>
                        <th className="p-4 text-right">Alış</th><th className="p-4 text-right">Satış</th><th className="p-4 w-32">Stok</th>
                        <th className="p-4">Durum</th><th className="p-4 text-center">İşlemler</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-700/50 text-sm">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={8} className="text-center py-16 text-slate-400">
                                <span className="material-symbols-outlined text-6xl mb-4 block">inbox</span>
                                <p>Henüz ürün yok</p>
                                <button onClick={openCreateModal} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm">İlk Ürünü Ekle</button>
                            </td></tr>
                        ) : filtered.map(p => {
                            const status = getStockStatus(p.stock, p.minStock);
                            const maxStock = Math.max(p.minStock * 3, p.stock, 10);
                            return (
                                <tr key={p.id} className="hover:bg-slate-800 transition-colors group">
                                    <td className="p-4 font-medium text-white sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-800 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">{p.name}</td>
                                    <td className="p-4"><span className="px-2.5 py-1 rounded-full text-xs bg-primary/10 text-primary font-medium">{p.categoryName}</span></td>
                                    <td className="p-4 text-slate-400 font-mono text-xs">{p.barcode || '—'}</td>
                                    <td className="p-4 text-right text-slate-300">{fp(p.purchasePrice)}</td>
                                    <td className="p-4 text-right font-medium text-white">{fp(p.salePrice)}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                                                <div className={`h-full rounded-full transition-all ${p.stock === 0 ? 'bg-slate-500' : p.stock <= p.minStock ? 'bg-red-500' : 'bg-emerald-500'}`}
                                                    style={{ width: `${Math.min(100, (p.stock / maxStock) * 100)}%` }}></div>
                                            </div>
                                            <span className="text-xs text-slate-300 w-8 text-right">{p.stock}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                                            {status.pulse && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>}
                                            {status.label}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex justify-center gap-1">
                                            <button onClick={() => openEditModal(p)} className="p-1.5 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-colors">
                                                <span className="material-symbols-outlined text-lg">edit</span>
                                            </button>
                                            <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between bg-surface-dark rounded-b-xl border-x">
                <p className="text-sm text-slate-400">Toplam <span className="font-medium text-white">{filtered.length}</span> kayıt</p>
            </div>

            {/* Product Modal */}
            {showProductModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowProductModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">{editingProduct ? 'Ürün Düzenle' : 'Yeni Ürün'}</h3>
                            <button onClick={() => setShowProductModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Ürün Adı *</label>
                                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Kategori *</label>
                                <select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none">
                                    <option value="">Seçin...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select></div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Barkod</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={form.barcode}
                                        onChange={e => setForm({ ...form, barcode: e.target.value })}
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none animate-none"
                                        id="product-barcode-input"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleGenerateBarcode}
                                        className="px-3 py-2 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold transition-all btn-press"
                                        title="Barkod Üret"
                                    >
                                        Üret
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowBarcodeScanner(true)}
                                        className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 rounded-lg text-xs font-bold flex items-center gap-1 transition-all btn-press"
                                        title="Kamerayla Tara"
                                    >
                                        <span className="material-symbols-outlined text-sm">photo_camera</span>
                                        Tara
                                    </button>
                                </div>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Stok Miktarı *</label>
                                <input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Kritik Stok Sınırı</label>
                                <input type="number" value={form.minStock} onChange={e => setForm({ ...form, minStock: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Alış Fiyatı *</label>
                                <input type="number" value={form.purchasePrice} onChange={e => setForm({ ...form, purchasePrice: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Satış Fiyatı *</label>
                                <input type="number" value={form.salePrice} onChange={e => setForm({ ...form, salePrice: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none" /></div>
                            <div className="col-span-2"><label className="block text-sm font-medium text-slate-300 mb-1">Açıklama</label>
                                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-primary outline-none resize-none" /></div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowProductModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleSaveProduct} className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium shadow-lg shadow-primary/25">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Barcode Print Modal */}
            {showBarcodeModal && (
                <BarcodePrintModal products={products} categories={categories} setProducts={setProducts} onClose={() => setShowBarcodeModal(false)} />
            )}

            {/* IMEI Checker Modal */}
            {showImeiModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowImeiModal(false)}>
                    <div className="bg-surface rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">IMEI Doğrulama</h2>
                                <p className="text-slate-400 text-sm mt-1">Cihaz IMEI numarasını kontrol edin</p>
                            </div>
                            <button onClick={() => setShowImeiModal(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-5">
                            <IMEIChecker />
                        </div>
                    </div>
                </div>
            )}

            {/* Category Modal */}
            {showCategoryModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowCategoryModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">Kategori Yönetimi</h3>
                            <button onClick={() => setShowCategoryModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex gap-2">
                                <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Yeni kategori adı"
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white placeholder:text-slate-500 focus:border-primary outline-none" />
                                <button onClick={handleSaveCategory} className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium">Ekle</button>
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {categories.map(c => (
                                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50">
                                        <span className="text-sm text-white">{c.name}</span>
                                        <button onClick={() => handleDeleteCategory(c.id)} className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400">
                                            <span className="material-symbols-outlined text-base">delete</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Import Modal */}
            {showBulkModal && (
                <BulkProductImportModal 
                    categories={categories}
                    setCategories={setCategories}
                    onSuccess={() => {
                        setShowBulkModal(false);
                        window.location.reload(); 
                    }}
                    onClose={() => setShowBulkModal(false)}
                />
            )}

            {/* Barcode Scanner Modal */}
            {showBarcodeScanner && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70]" onClick={() => {
                    if (scannerRef.current) {
                        scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
                        scannerRef.current = null;
                    }
                    setShowBarcodeScanner(false);
                }}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-400">photo_camera</span>
                                <h3 className="text-lg font-bold text-white">Barkod Tarayıcı</h3>
                            </div>
                            <button onClick={() => {
                                if (scannerRef.current) {
                                    scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
                                    scannerRef.current = null;
                                }
                                setShowBarcodeScanner(false);
                            }} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-4">
                            <p className="text-sm text-slate-400 mb-3">Barkodu kameraya gösterin, otomatik okunacak</p>
                            <div id="product-form-barcode-scanner" className="rounded-lg overflow-hidden bg-black" style={{ minHeight: 280 }}></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
