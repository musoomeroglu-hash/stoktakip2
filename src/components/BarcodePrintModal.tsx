import { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';
import type { Product, Category } from '../types';
import * as api from '../utils/api';
import { useToast } from './Toast';

function toEnglishChars(text: string): string {
    return text
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ç/g, 'c')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'I')
        .replace(/Ş/g, 'S')
        .replace(/Ğ/g, 'G')
        .replace(/Ç/g, 'C')
        .replace(/Ö/g, 'O')
        .replace(/Ü/g, 'U');
}

interface Props {
    products: Product[];
    categories?: Category[];
    setProducts?: (products: Product[]) => void;
    onClose: () => void;
}

export default function BarcodePrintModal({ products, categories = [], setProducts, onClose }: Props) {
    const { showToast } = useToast();
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [barcodeFilter, setBarcodeFilter] = useState<'all' | 'with' | 'without'>('all');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState('');
    const [settings, setSettings] = useState({
        printMode: 'roll' as 'roll' | 'a4',
        labelWidth: 62, // Default Brother QL roll width
        labelHeight: 29, // Default Brother QL DK-11209 height
        labelsPerRow: 3,
        showPrice: true,
        showProductName: true,
        showBorder: false,
    });

    // Filtering logic
    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (product.barcode && product.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesCategory = selectedCategory === 'all' || product.categoryId === selectedCategory;
            
            const matchesBarcode = barcodeFilter === 'all' ||
                (barcodeFilter === 'with' && !!product.barcode) ||
                (barcodeFilter === 'without' && !product.barcode);

            return matchesSearch && matchesCategory && matchesBarcode;
        });
    }, [products, searchTerm, selectedCategory, barcodeFilter]);

    // Quick presets
    const handleSetAllToOne = () => {
        const newQtys = { ...quantities };
        filteredProducts.forEach(p => {
            if (p.barcode) {
                newQtys[p.id] = 1;
            }
        });
        setQuantities(newQtys);
        showToast(`Filtrelenen ${filteredProducts.filter(p => p.barcode).length} ürüne 1 adet etiket tanımlandı.`);
    };

    const handleSetAllToStock = () => {
        const newQtys = { ...quantities };
        filteredProducts.forEach(p => {
            if (p.barcode) {
                newQtys[p.id] = Math.max(0, p.stock);
            }
        });
        setQuantities(newQtys);
        showToast('Filtrelenen ürünlerin etiket adetleri stok miktarlarına göre ayarlandı.');
    };

    const handleClearAll = () => {
        setQuantities({});
        showToast('Tüm etiket adetleri sıfırlandı.');
    };

    // Bulk barcode generator
    const handleBulkGenerate = async () => {
        const barcodeLess = products.filter(p => !p.barcode);
        if (barcodeLess.length === 0) {
            showToast('Barkodsuz ürün bulunamadı!', 'warning');
            return;
        }

        if (!confirm(`${barcodeLess.length} adet barkodsuz ürüne otomatik barkod üretilip kaydedilecek. Devam etmek istiyor musunuz?`)) {
            return;
        }

        setIsGenerating(true);
        let count = 0;
        const updatedProducts = [...products];

        try {
            for (let i = 0; i < barcodeLess.length; i++) {
                const prod = barcodeLess[i];
                setGenerationProgress(`${i + 1} / ${barcodeLess.length} barkod üretiliyor...`);
                
                // Get next sequence barcode
                const nextCode = await api.getNextInternalBarcode();
                prod.barcode = nextCode;
                
                // Save product to database
                await api.saveProduct(prod);

                // Update array
                const idx = updatedProducts.findIndex(p => p.id === prod.id);
                if (idx > -1) {
                    updatedProducts[idx] = { ...prod };
                }

                // Auto-set print quantity to 1 for this newly generated product
                setQuantities(prev => ({ ...prev, [prod.id]: 1 }));
                count++;
            }

            if (setProducts) {
                setProducts(updatedProducts);
            }
            showToast(`${count} ürüne başarıyla barkod tanımlandı ve etiket adetleri 1 olarak ayarlandı!`, 'success');
        } catch (err) {
            console.error('Bulk barcode generation failed:', err);
            showToast('Toplu barkod tanımlanırken hata oluştu!', 'error');
        } finally {
            setIsGenerating(false);
            setGenerationProgress('');
        }
    };

    const generateBarcodePNG = (barcode: string): string => {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcode, { format: 'CODE128', width: 2, height: 40, displayValue: false, margin: 0 });
        return canvas.toDataURL('image/png');
    };

    const generatePDF = () => {
        const { printMode, labelWidth, labelHeight, labelsPerRow } = settings;
        
        let doc: jsPDF;
        if (printMode === 'roll') {
            // landscape orientation fits standard barcode labels on rolls perfectly
            doc = new jsPDF({ 
                orientation: 'landscape', 
                unit: 'mm', 
                format: [labelWidth, labelHeight] 
            });
        } else {
            doc = new jsPDF({ 
                orientation: 'portrait', 
                unit: 'mm', 
                format: 'a4' 
            });
        }

        const pageHeight = 297;
        const margin = 5;
        const gap = 2;
        
        let x = printMode === 'roll' ? 0 : margin;
        let y = printMode === 'roll' ? 0 : margin;
        let col = 0;
        let isFirstPage = true;

        for (const [productId, qty] of Object.entries(quantities)) {
            if (qty <= 0) continue;
            const product = products.find(p => p.id === productId);
            if (!product) continue;
            for (let i = 0; i < qty; i++) {
                if (printMode === 'roll') {
                    if (!isFirstPage) {
                        doc.addPage([labelWidth, labelHeight], 'landscape');
                    }
                    isFirstPage = false;
                    x = 0;
                    y = 0;
                }

                // 1. Draw border (optional in roll mode, always in A4 mode)
                if (printMode === 'a4' || settings.showBorder) {
                    doc.setLineWidth(0.15);
                    doc.setDrawColor(180, 180, 180);
                    doc.rect(x, y, labelWidth, labelHeight);
                }

                const centerX = x + labelWidth / 2;

                // 2. TECHNOCEP Header (Top brand)
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(0, 0, 0);
                doc.text("TECHNOCEP", centerX, y + (labelHeight * 0.15), { align: 'center' });

                // Separator Line
                doc.setLineWidth(0.1);
                doc.setDrawColor(210, 210, 210);
                doc.line(x + 4, y + (labelHeight * 0.21), x + labelWidth - 4, y + (labelHeight * 0.21));

                // 3. Product Name (Below line)
                if (settings.showProductName) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(6.5);
                    doc.setTextColor(80, 80, 80);
                    // Split text manually to prevent letter-spacing stretching bugs in jsPDF center alignment
                    const cleanName = toEnglishChars(product.name);
                    const nameLines = doc.splitTextToSize(cleanName, labelWidth - 14);
                    const displayName = nameLines[0] ? (nameLines.length > 1 ? nameLines[0] + '...' : nameLines[0]) : '';
                    doc.text(displayName, centerX, y + (labelHeight * 0.33), { align: 'center' });
                }

                // 4. Barcode Image
                if (product.barcode) {
                    try {
                        const barcodeImg = generateBarcodePNG(product.barcode);
                        const imgWidth = labelWidth - 10;
                        const imgHeight = labelHeight * 0.28;
                        doc.addImage(
                            barcodeImg, 
                            'PNG', 
                            x + 5, 
                            y + (labelHeight * 0.40), 
                            imgWidth, 
                            imgHeight
                        );
                    } catch (err) {
                        console.warn('Barcode image generation failed:', err);
                    }

                    // 5. Barcode Code Text (Centered Monospace)
                    doc.setFont('courier', 'normal');
                    doc.setFontSize(7);
                    doc.setTextColor(0, 0, 0);
                    doc.text(product.barcode, centerX, y + (labelHeight * 0.76), { align: 'center' });
                }

                // 6. Price (Bottom centered, replaced ₺ with TL to prevent encoding glyph bugs)
                if (settings.showPrice) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(9);
                    doc.setTextColor(0, 0, 0);
                    const formattedPrice = `Fiyat: ${product.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`;
                    doc.text(formattedPrice, centerX, y + (labelHeight * 0.90), { align: 'center' });
                }

                if (printMode === 'a4') {
                    col++;
                    if (col >= labelsPerRow) { 
                        col = 0; 
                        x = margin; 
                        y += labelHeight + gap; 
                    } else { 
                        x += labelWidth + gap; 
                    }

                    if (y + labelHeight > pageHeight - margin) { 
                        doc.addPage(); 
                        x = margin; 
                        y = margin; 
                        col = 0; 
                    }
                }
            }
        }
        doc.save(`barkod_etiketleri_${Date.now()}.pdf`);
        showToast('PDF dosyası başarıyla indirildi!');
    };

    const totalLabels = Object.values(quantities).reduce((a, b) => a + b, 0);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface-dark border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden animate-fade-in text-slate-900">
                
                {/* Generation Loading Overlay */}
                {isGenerating && (
                    <div className="absolute inset-0 bg-white/85 backdrop-blur-sm z-[60] flex flex-col items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mb-4"></div>
                        <h4 className="font-bold text-slate-900 text-lg">Toplu Barkod Oluşturuluyor</h4>
                        <p className="text-slate-500 text-sm mt-1">{generationProgress}</p>
                    </div>
                )}

                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">barcode</span>
                            Toplu Barkod İşlemleri & Etiket Yazdırma
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">Barkodsuz ürünlere toplu barkod üretebilir veya seçtiğiniz ürünler için PDF etiket listesi indirebilirsiniz.</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Settings & Config Bar */}
                <div className="p-4 bg-slate-700/50 border-b border-slate-800 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Print Mode Selector */}
                        <div className="flex items-center gap-2 text-sm text-slate-900">
                            <span className="font-medium">Yazıcı Tipi:</span>
                            <select value={settings.printMode}
                                onChange={e => {
                                    const mode = e.target.value as 'roll' | 'a4';
                                    setSettings(s => ({ 
                                        ...s, 
                                        printMode: mode, 
                                        labelWidth: mode === 'roll' ? 62 : 50, 
                                        labelHeight: mode === 'roll' ? 29 : 30 
                                    }));
                                }}
                                className="bg-surface-dark border border-slate-800 rounded px-2.5 py-1 text-slate-900 text-sm font-semibold outline-none focus:border-primary">
                                <option value="roll">Rulo Etiket Yazıcı (Brother QL, Zebra vb.)</option>
                                <option value="a4">A4 Tabaka Kağıt (Normal Yazıcılar)</option>
                            </select>
                        </div>

                        {/* Presets sizes for roll printer */}
                        {settings.printMode === 'roll' && (
                            <div className="flex items-center gap-2 text-sm text-slate-900">
                                <span className="font-medium">Şablon Rulo:</span>
                                <select 
                                    onChange={e => {
                                        if (e.target.value !== 'custom') {
                                            const [w, h] = e.target.value.split('x').map(Number);
                                            setSettings(s => ({ ...s, labelWidth: w, labelHeight: h }));
                                        }
                                    }}
                                    className="bg-surface-dark border border-slate-800 rounded px-2.5 py-1 text-slate-900 text-sm font-semibold outline-none focus:border-primary"
                                >
                                    <option value="62x29">Brother QL (62mm x 29mm) - DK-11209</option>
                                    <option value="58x40">Zebra / Xprinter (58mm x 40mm)</option>
                                    <option value="50x30">Standart Etiket (50mm x 30mm)</option>
                                    <option value="custom">Özel Boyut...</option>
                                </select>
                            </div>
                        )}

                        {/* Dimensions inputs */}
                        <div className="flex items-center gap-1.5 text-sm text-slate-900">
                            <span className="font-medium">Boyut (G x Y mm):</span>
                            <input type="number" value={settings.labelWidth}
                                onChange={e => setSettings(s => ({ ...s, labelWidth: Number(e.target.value) }))}
                                className="w-14 bg-surface-dark border border-slate-800 rounded px-2 py-1 text-slate-900 text-sm text-center font-bold outline-none focus:border-primary" />
                            <span>x</span>
                            <input type="number" value={settings.labelHeight}
                                onChange={e => setSettings(s => ({ ...s, labelHeight: Number(e.target.value) }))}
                                className="w-14 bg-surface-dark border border-slate-800 rounded px-2 py-1 text-slate-900 text-sm text-center font-bold outline-none focus:border-primary" />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/30 pt-3">
                        <div className="flex flex-wrap gap-4">
                            <label className="flex items-center gap-2 text-slate-900 text-sm cursor-pointer font-medium">
                                <input type="checkbox" checked={settings.showProductName}
                                    onChange={e => setSettings(s => ({ ...s, showProductName: e.target.checked }))} className="rounded text-primary focus:ring-primary border-slate-800 bg-surface-dark" />
                                Ürün Adı Göster
                            </label>
                            <label className="flex items-center gap-2 text-slate-900 text-sm cursor-pointer font-medium">
                                <input type="checkbox" checked={settings.showPrice}
                                    onChange={e => setSettings(s => ({ ...s, showPrice: e.target.checked }))} className="rounded text-primary focus:ring-primary border-slate-800 bg-surface-dark" />
                                Fiyat Göster
                            </label>

                            {settings.printMode === 'a4' && (
                                <>
                                    <div className="flex items-center gap-2 text-sm text-slate-900">
                                        <span className="font-medium">Sütun sayısı:</span>
                                        <select value={settings.labelsPerRow}
                                            onChange={e => setSettings(s => ({ ...s, labelsPerRow: parseInt(e.target.value) }))}
                                            className="bg-surface-dark border border-slate-800 rounded px-2 py-1 text-slate-900 text-sm font-semibold outline-none focus:border-primary">
                                            {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Sütun</option>)}
                                        </select>
                                    </div>
                                    <label className="flex items-center gap-2 text-slate-900 text-sm cursor-pointer font-medium">
                                        <input type="checkbox" checked={settings.showBorder}
                                            onChange={e => setSettings(s => ({ ...s, showBorder: e.target.checked }))} className="rounded text-primary focus:ring-primary border-slate-800 bg-surface-dark" />
                                        Kenarlık Çiz
                                    </label>
                                </>
                            )}

                            {settings.printMode === 'roll' && (
                                <label className="flex items-center gap-2 text-slate-900 text-sm cursor-pointer font-medium">
                                    <input type="checkbox" checked={settings.showBorder}
                                        onChange={e => setSettings(s => ({ ...s, showBorder: e.target.checked }))} className="rounded text-primary focus:ring-primary border-slate-800 bg-surface-dark" />
                                    Kesim Kılavuzu Çiz
                                </label>
                            )}
                        </div>

                        <button 
                            onClick={handleBulkGenerate}
                            className="px-3.5 py-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
                        >
                            <span className="material-symbols-outlined text-sm font-bold">auto_awesome</span>
                            Barkodsuz Ürünlere Toplu Barkod Tanımla
                        </button>
                    </div>
                </div>

                {/* Filters & Actions Row */}
                <div className="p-4 border-b border-slate-800 bg-slate-700/20 flex flex-col gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Search Input */}
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                            <input 
                                type="text" 
                                placeholder="Ürün adı veya barkod ara..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-surface-dark border border-slate-800 rounded-lg py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-primary"
                            />
                        </div>
                        {/* Category Select */}
                        <select
                            value={selectedCategory}
                            onChange={e => setSelectedCategory(e.target.value)}
                            className="bg-surface-dark border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-900 outline-none focus:border-primary font-medium"
                        >
                            <option value="all">Tüm Kategoriler</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {/* Barcode Filter Select */}
                        <select
                            value={barcodeFilter}
                            onChange={e => setBarcodeFilter(e.target.value as 'all' | 'with' | 'without')}
                            className="bg-surface-dark border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-900 outline-none focus:border-primary font-medium"
                        >
                            <option value="all">Tüm Ürünler</option>
                            <option value="with">Sadece Barkodlu Olanlar</option>
                            <option value="without">Sadece Barkodsuz Olanlar</option>
                        </select>
                    </div>

                    {/* Presets Action Buttons */}
                    <div className="flex items-center justify-between mt-1 border-t border-slate-800/40 pt-3">
                        <span className="text-xs text-slate-500 font-medium">Bulunan: <strong className="text-slate-900">{filteredProducts.length}</strong> ürün</span>
                        <div className="flex gap-2">
                            <button onClick={handleSetAllToOne} className="px-3 py-1.5 bg-surface-dark hover:bg-slate-700 border border-slate-800 text-slate-900 rounded-lg text-xs font-semibold transition-colors">
                                Tümüne 1 Ekle
                            </button>
                            <button onClick={handleSetAllToStock} className="px-3 py-1.5 bg-surface-dark hover:bg-slate-700 border border-slate-800 text-slate-900 rounded-lg text-xs font-semibold transition-colors">
                                Stok Adeti Kadar Ekle
                            </button>
                            <button onClick={handleClearAll} className="px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs font-bold transition-colors">
                                Seçimleri Sıfırla
                            </button>
                        </div>
                    </div>
                </div>

                {/* Product List */}
                <div className="overflow-y-auto flex-1 p-4 space-y-2 bg-slate-950">
                    {filteredProducts.length === 0 ? (
                        <div className="text-center py-10">
                            <span className="material-symbols-outlined text-slate-400 text-4xl mb-2">find_in_page</span>
                            <p className="text-slate-500 text-sm">Filtrelere uygun ürün bulunamadı.</p>
                        </div>
                    ) : (
                        filteredProducts.map(product => (
                            <div key={product.id} className="flex items-center justify-between p-3.5 bg-surface-dark border border-slate-800 rounded-xl hover:border-slate-700 transition-colors shadow-sm">
                                <div className="flex-1 min-w-0">
                                    <p className="text-slate-900 font-bold truncate text-sm">{product.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        {product.barcode ? (
                                            <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">barcode</span>
                                                {product.barcode}
                                            </span>
                                        ) : (
                                            <span className="bg-red-500/10 text-red-500 text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/20 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">error</span>
                                                Barkodsuz
                                            </span>
                                        )}
                                        <span className="text-slate-500 text-xs font-medium">Stok: <strong>{product.stock}</strong> adet</span>
                                        <span className="text-slate-500 text-xs">·</span>
                                        <span className="text-primary font-bold text-xs">₺{product.salePrice.toLocaleString('tr-TR')}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    {product.barcode ? (
                                        <>
                                            <button 
                                                onClick={() => setQuantities(prev => ({ ...prev, [product.id]: Math.max(0, (prev[product.id] || 0) - 1) }))}
                                                className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-800 font-bold transition-colors shadow-sm flex items-center justify-center"
                                            >
                                                −
                                            </button>
                                            <span className="w-8 text-center text-slate-900 font-bold text-sm">{quantities[product.id] || 0}</span>
                                            <button 
                                                onClick={() => setQuantities(prev => ({ ...prev, [product.id]: (prev[product.id] || 0) + 1 }))}
                                                className="w-8 h-8 bg-primary hover:bg-primary-hover rounded-lg text-white font-bold transition-colors shadow-sm flex items-center justify-center shadow-primary/25"
                                            >
                                                +
                                            </button>
                                        </>
                                    ) : (
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    setIsGenerating(true);
                                                    setGenerationProgress('Ürüne barkod tanımlanıyor...');
                                                    const nextCode = await api.getNextInternalBarcode();
                                                    product.barcode = nextCode;
                                                    await api.saveProduct(product);
                                                    if (setProducts) {
                                                        setProducts(products.map(p => p.id === product.id ? { ...product } : p));
                                                    }
                                                    setQuantities(prev => ({ ...prev, [product.id]: 1 }));
                                                    showToast(`"${product.name}" için barkod üretildi!`, 'success');
                                                } catch {
                                                    showToast('Barkod tanımlanamadı!', 'error');
                                                } finally {
                                                    setIsGenerating(false);
                                                    setGenerationProgress('');
                                                }
                                            }}
                                            className="px-2.5 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/30 rounded-lg text-xs font-bold transition-all"
                                        >
                                            Barkod Üret
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 flex gap-3 bg-surface-dark">
                    <button onClick={onClose} className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-950 rounded-xl transition-colors font-medium">İptal</button>
                    <button onClick={generatePDF} disabled={totalLabels === 0}
                        className="flex-1 px-4 py-3 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed font-semibold shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined">download</span>
                        PDF Listesini İndir ({totalLabels} etiket)
                    </button>
                </div>
            </div>
        </div>
    );
}
