import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { Product, Category } from '../types';
import { generateId } from '../utils/helpers';
import * as api from '../utils/api';

interface BulkProductImportModalProps {
    categories: Category[];
    setCategories: (c: Category[]) => void;
    onSuccess: () => void;
    onClose: () => void;
}

export default function BulkProductImportModal({ categories, setCategories, onSuccess, onClose }: BulkProductImportModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [importResult, setImportResult] = useState<{ total: number; success: number; errors: string[] } | null>(null);

    const processExcel = async (file: File) => {
        setFileName(file.name);
        setIsProcessing(true);
        setProgress(5);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

            if (!json || json.length === 0) {
                setImportResult({ total: 0, success: 0, errors: ['Dosya boş veya format hatalı.'] });
                setIsProcessing(false);
                return;
            }

            setProgress(20);

            // Validate and transform data
            const errors: string[] = [];
            const validProducts: Product[] = [];
            const tempCategories = { ...categories.reduce((acc, cat) => ({ ...acc, [cat.name.toLowerCase()]: cat.id }), {} as Record<string, string>) };
            const newCategoriesToSave: Category[] = [];

            for (let i = 0; i < json.length; i++) {
                const row = json[i];
                const rNum = i + 2; // Excel row number (header + 1-indexed)

                const name = row['Ürün Adı']?.toString().trim();
                const categoryName = row['Kategori']?.toString().trim();
                
                if (!name) { errors.push(`Satır ${rNum}: Ürün Adı zorunludur.`); continue; }
                if (!categoryName) { errors.push(`Satır ${rNum}: Kategori zorunludur.`); continue; }

               
                // Category Mapping
                let categoryId = tempCategories[categoryName.toLowerCase()];
                if (!categoryId) {
                    // Create new category locally
                    categoryId = generateId();
                    tempCategories[categoryName.toLowerCase()] = categoryId;
                    newCategoriesToSave.push({ id: categoryId, name: categoryName });
                }

                // Parse number safely
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const parseNum = (val: any, def: number) => {
                    if (val === undefined || val === null || val === '') return def;
                    const parsed = Number(val);
                    return isNaN(parsed) ? def : parsed;
                };

                const product: Product = {
                    id: generateId(),
                    name,
                    categoryId,
                    categoryName,
                    barcode: row['Barkod']?.toString().trim() || '',
                    stock: parseNum(row['Stok'], 0),
                    minStock: parseNum(row['Kritik Stok'], 5),
                    purchasePrice: parseNum(row['Alış Fiyatı'], 0),
                    salePrice: parseNum(row['Satış Fiyatı'], 0),
                    description: row['Açıklama']?.toString().trim() || ''
                };

                validProducts.push(product);
            }

            setProgress(40);

            // Step 1: Save completely new categories to DB
            if (newCategoriesToSave.length > 0) {
                const idMapping: Record<string, string> = {};
                const savedCategories: Category[] = [];
                for (let i = 0; i < newCategoriesToSave.length; i++) {
                    try {
                        const saved = await api.saveCategory(newCategoriesToSave[i]);
                        if (saved) {
                            idMapping[newCategoriesToSave[i].id] = saved.id;
                            savedCategories.push(saved);
                        }
                    } catch {
                         console.warn("Kategori eklenemedi:", newCategoriesToSave[i].name);
                    }
                }
                // Update product categoryIds using the mapping
                validProducts.forEach(p => {
                    if (idMapping[p.categoryId]) {
                        p.categoryId = idMapping[p.categoryId];
                    }
                });
                // Update parent state with new categories
                setCategories([...categories, ...savedCategories]);
            }

            setProgress(50);

            // Step 2: Save products to DB sequentially
            // For thousands of rows, batching is better but doing it sequentially with small progress jumps is safer to avoid Edge Function timeout.
            let successCount = 0;
            const total = validProducts.length;

            for (let i = 0; i < total; i++) {
                try {
                    await api.saveProduct(validProducts[i]);
                    successCount++;
                } catch {
                    errors.push(`Ürün eklenemedi: ${validProducts[i].name}`);
                }
                
                // Update progress every 5 items to avoid too many re-renders
                if (i % 5 === 0) {
                    setProgress(50 + Math.floor((i / total) * 50));
                }
            }

            setImportResult({ total: json.length, success: successCount, errors });
            setProgress(100);

        } catch (error) {
            setImportResult({ total: 0, success: 0, errors: ['Dosya okunurken beklenmeyen bir hata oluştu.'] });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processExcel(file);
        }
    };

    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([{
            'Ürün Adı': 'Örnek Ürün',
            'Kategori': 'Örnek Kategori',
            'Barkod': '123456789',
            'Stok': 100,
            'Kritik Stok': 10,
            'Alış Fiyatı': 500,
            'Satış Fiyatı': 750,
            'Açıklama': 'Bu bir örnek üründür'
        }]);
        
        // Auto-size columns slightly
        const wscols = [ {wch: 25}, {wch: 20}, {wch: 20}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 40} ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Şablon");
        XLSX.writeFile(wb, "Urun_Ekleme_Sablonu.xlsx");
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]" onClick={onClose}>
            <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-3xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-slate-700">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">post_add</span>
                            Toplu Ürün Ekle (.xlsx)
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-50" disabled={isProcessing}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto scrollbar-thin flex-1 space-y-6">
                    {/* Rules & Guidelines section */}
                    {!importResult && !isProcessing && (
                        <div className="space-y-4">
                            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                                <h4 className="font-semibold text-white mb-3 text-sm uppercase tracking-wider text-primary">Şablon Kuralları</h4>
                                <ul className="space-y-3 text-sm text-slate-300">
                                    <li className="flex gap-3">
                                        <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
                                        <p>İlk satır <b>Kesinlikle</b> sütun başlıklarını içermelidir.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="material-symbols-outlined text-emerald-400 text-base">info</span>
                                        <p>Zorunlu sütunlar: <b className="text-white">Ürün Adı</b> ve <b className="text-white">Kategori</b>.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="material-symbols-outlined text-blue-400 text-base">info</span>
                                        <p>Opsiyonel sütunlar: <span className="text-slate-400">Barkod, Stok, Kritik Stok, Alış Fiyatı, Satış Fiyatı, Açıklama</span>.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="material-symbols-outlined text-amber-400 text-base">warning</span>
                                        <p>Eğer yazdığınız kategori sistemde yoksa, <b>otomatik olarak oluşturulur</b>.</p>
                                    </li>
                                </ul>
                            </div>

                            <button onClick={downloadTemplate} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl flex items-center justify-center gap-2 transition-colors font-medium">
                                <span className="material-symbols-outlined">download</span>
                                Örnek Şablonu İndir
                            </button>
                            
                            <input 
                                type="file" 
                                accept=".xlsx, .xls" 
                                className="hidden" 
                                ref={fileInputRef} 
                                onChange={handleFileChange} 
                            />
                            
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-slate-600 hover:border-primary bg-slate-800/30 hover:bg-primary/5 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all gap-3"
                            >
                                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-4xl text-slate-400">upload_file</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-white text-lg">Excel (.xlsx) Dosyanızı Seçin</p>
                                    <p className="text-sm text-slate-400 mt-1">Sürükleyip bırakabilirsiniz veya tıklayabilirsiniz.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Progress indicator */}
                    {isProcessing && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-6">
                            <span className="material-symbols-outlined text-6xl text-primary animate-bounce">database</span>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-white mb-2">{fileName} Yükleniyor...</h3>
                                <p className="text-sm text-slate-400">Ürünler analiz ediliyor ve sisteme kaydediliyor. Lütfen bekleyin.</p>
                            </div>
                            <div className="w-full max-w-md bg-slate-800 rounded-full h-3 overflow-hidden">
                                <div className="bg-primary h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                            <p className="text-sm font-semibold text-primary">{progress}%</p>
                        </div>
                    )}

                    {/* Import Result */}
                    {importResult && !isProcessing && (
                        <div className="space-y-6 py-4">
                            <div className="flex items-center justify-center gap-4 flex-col text-center mb-4">
                                <span className={`material-symbols-outlined text-6xl ${importResult.success > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {importResult.success > 0 ? 'task_alt' : 'error'}
                                </span>
                                <div>
                                    <h3 className="text-2xl font-bold text-white">İşlem Tamamlandı</h3>
                                    <p className="text-slate-400 mt-1">{fileName}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                                <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl text-center">
                                    <p className="text-slate-400 text-sm mb-1">Başarılı</p>
                                    <p className="text-2xl font-bold text-emerald-400">{importResult.success}</p>
                                </div>
                                <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl text-center">
                                    <p className="text-slate-400 text-sm mb-1">Hatalı Satır</p>
                                    <p className="text-2xl font-bold text-red-400">{importResult.errors.length}</p>
                                </div>
                            </div>

                            {importResult.errors.length > 0 && (
                                <div className="mt-8">
                                    <h4 className="text-sm font-semibold text-red-400 mb-2">Hata Raporu ({importResult.errors.length})</h4>
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 max-h-40 overflow-y-auto scrollbar-thin">
                                        <ul className="space-y-1 text-sm text-red-300">
                                            {importResult.errors.map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {importResult && !isProcessing && (
                    <div className="p-6 border-t border-slate-700 bg-surface flex justify-end">
                        <button onClick={() => {
                            if (importResult.success > 0) onSuccess();
                            else setImportResult(null); // Reset to retry
                        }} className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium shadow-lg shadow-primary/25">
                            {importResult.success > 0 ? 'Tamamla ve Kapat' : 'Tekrar Dene'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
