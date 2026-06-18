import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { RepairRecord, Supplier, Customer } from '../types';
import { formatDate, getRepairStatusInfo, generateId } from '../utils/helpers';
import { useFormatPrice } from '../components/PriceVisibility';
import { useToast } from '../components/Toast';
import * as api from '../utils/api';
import { Html5Qrcode } from 'html5-qrcode';
import CustomerSelector from '../components/CustomerSelector';
import RepairPhotoGallery from '../components/RepairPhotoGallery';
import type { RepairPhoto } from '../types';
import { jsPDF } from 'jspdf';
import { registerTurkishFont } from '../utils/pdfFont';

function RepairPhotoGalleryModal({ repair, onClose }: { repair: RepairRecord; onClose: () => void }) {
    const [photosBefore, setPhotosBefore] = useState<RepairPhoto[]>([]);
    const [photosAfter, setPhotosAfter] = useState<RepairPhoto[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getRepairPhotos(repair.id).then(photos => {
            setPhotosBefore(photos.filter((p: RepairPhoto) => p.type === 'before'));
            setPhotosAfter(photos.filter((p: RepairPhoto) => p.type === 'after'));
            setLoading(false);
        }).catch(err => {
            console.error('Failed to load photos:', err);
            setLoading(false);
        });
    }, [repair.id]);

    return (
        <div className="fixed inset-0 bg-black/70 z-[55] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-slate-700">
                    <div>
                        <h3 className="text-lg font-bold text-white">Tamir Fotoğrafları</h3>
                        <p className="text-sm text-slate-400">{repair.customerName} — {repair.deviceInfo}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-400">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-5">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                        </div>
                    ) : (
                        <RepairPhotoGallery
                            repairId={repair.id}
                            photosBefore={photosBefore}
                            photosAfter={photosAfter}
                            onUpdate={(before, after) => { setPhotosBefore(before); setPhotosAfter(after); }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

interface RepairsPageProps {
    repairs: RepairRecord[];
    setRepairs: (r: RepairRecord[]) => void;
    suppliers: Supplier[];
    customers: Customer[];
    setCustomers: (c: Customer[]) => void;
}

// Status progression order
const STATUS_FLOW: RepairRecord['status'][] = ['in_progress', 'waiting_parts', 'completed', 'delivered'];

function getNextStatus(current: RepairRecord['status']): RepairRecord['status'] | null {
    const idx = STATUS_FLOW.indexOf(current);
    if (idx === -1 || idx >= STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
}

export default function RepairsPage({ repairs, setRepairs, suppliers, customers, setCustomers }: RepairsPageProps) {
    const fp = useFormatPrice();
    const { showToast } = useToast();
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [selectedRepair, setSelectedRepair] = useState<RepairRecord | null>(null);
    const [editing, setEditing] = useState<RepairRecord | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [photoRepair, setPhotoRepair] = useState<RepairRecord | null>(null);

    // Start barcode scanner
    const startScanner = useCallback(async () => {
        try {
            const scanner = new Html5Qrcode('imei-scanner-region');
            scannerRef.current = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 280, height: 100 } },
                (decodedText) => {
                    setForm(f => ({ ...f, imei: decodedText }));
                    scanner.stop().then(() => scanner.clear()).catch(() => { });
                    scannerRef.current = null;
                    setShowScanner(false);
                    showToast('IMEI okundu!');
                },
                () => { } // ignore scan failures
            );
        } catch (err) {
            console.error('Scanner error:', err);
            showToast('Kamera açılamadı!', 'error');
            setShowScanner(false);
        }
    }, [showToast]);

    // Cleanup scanner on close
    const stopScanner = useCallback(() => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => { });
            scannerRef.current = null;
        }
        setShowScanner(false);
    }, []);

    // Start scanner when modal opens
    useEffect(() => {
        if (showScanner) {
            const timer = setTimeout(() => startScanner(), 300);
            return () => clearTimeout(timer);
        }
    }, [showScanner, startScanner]);

    const generateServiceForm = (repair: RepairRecord) => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        registerTurkishFont(doc);

        const PAGE_W = 210;
        const M = 16;                 // sayfa kenar boşluğu
        const CONTENT_W = PAGE_W - M * 2;

        // --- Renk paleti ---
        const slate900: [number, number, number] = [15, 23, 42];
        const slate500: [number, number, number] = [100, 116, 139];
        const slate200: [number, number, number] = [226, 232, 240];
        const slate50: [number, number, number] = [248, 250, 252];
        const ink: [number, number, number] = [30, 41, 59];
        const accent: [number, number, number] = [37, 99, 235];

        const statusColors: Record<string, [number, number, number]> = {
            in_progress: [37, 99, 235],
            completed: [22, 163, 74],
            delivered: [5, 150, 105],
            waiting_parts: [234, 88, 12],
            cancelled: [220, 38, 38],
        };

        const storeName = (localStorage.getItem('storeName') || 'TEKNİK SERVİS').toUpperCase();
        const storePhone = localStorage.getItem('storePhone') || '';
        const money = (n: number) => `${(n || 0).toLocaleString('tr-TR')} TL`;
        const setColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
        const fill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);

        // ===== Üst başlık bandı =====
        const headerH = 30;
        fill(slate900);
        doc.rect(0, 0, PAGE_W, headerH, 'F');
        fill(accent);
        doc.rect(0, headerH, PAGE_W, 1.4, 'F');

        doc.setFont('Roboto', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.text(storeName, M, 16);
        if (storePhone) {
            doc.setFont('Roboto', 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(203, 213, 225);
            doc.text(`Tel: ${storePhone}`, M, 23);
        }

        doc.setFont('Roboto', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(255, 255, 255);
        doc.text('SERVİS FORMU', PAGE_W - M, 14, { align: 'right' });
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(203, 213, 225);
        doc.text(`Form No: ${repair.id.slice(-6).toUpperCase()}`, PAGE_W - M, 20, { align: 'right' });
        doc.text(`Tarih: ${formatDate(repair.createdAt)}`, PAGE_W - M, 25.5, { align: 'right' });

        // ===== Durum rozeti =====
        let y = headerH + 11;
        const status = getRepairStatusInfo(repair.status);
        const badge = statusColors[repair.status] || accent;
        const badgeLabel = `Durum: ${status.label}`;
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(9.5);
        const badgeW = doc.getTextWidth(badgeLabel) + 10;
        fill(badge);
        doc.roundedRect(M, y - 5, badgeW, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(badgeLabel, M + 5, y);

        if (repair.deliveredAt) {
            doc.setFont('Roboto', 'normal');
            setColor(slate500);
            doc.setFontSize(9);
            doc.text(`Teslim: ${formatDate(repair.deliveredAt)}`, PAGE_W - M, y, { align: 'right' });
        }

        y += 12;

        // ===== Bölüm yardımcıları =====
        const sectionTitle = (title: string) => {
            doc.setFont('Roboto', 'bold');
            doc.setFontSize(11);
            setColor(accent);
            doc.text(title, M, y);
            doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
            doc.setLineWidth(0.3);
            doc.line(M, y + 2, PAGE_W - M, y + 2);
            y += 8;
        };

        // İki sütunlu etiket/değer satırı
        const colX = M;
        const col2X = M + CONTENT_W / 2 + 4;
        const field = (label: string, value: string, x: number, rowY: number) => {
            doc.setFont('Roboto', 'normal');
            doc.setFontSize(8.5);
            setColor(slate500);
            doc.text(label.toUpperCase(), x, rowY);
            doc.setFont('Roboto', 'bold');
            doc.setFontSize(11);
            setColor(ink);
            doc.text(value || '-', x, rowY + 5.5);
        };

        // ===== Müşteri Bilgileri =====
        sectionTitle('Müşteri Bilgileri');
        field('Ad Soyad', repair.customerName, colX, y);
        field('Telefon', repair.customerPhone || '-', col2X, y);
        y += 14;

        // ===== Cihaz Bilgileri =====
        sectionTitle('Cihaz Bilgileri');
        field('Model', repair.deviceInfo, colX, y);
        field('IMEI / Seri No', repair.imei || '-', col2X, y);
        y += 16;

        // Arıza tespiti (tam genişlik kutu)
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8.5);
        setColor(slate500);
        doc.text('ARIZA TESPİTİ', colX, y);
        y += 3;
        const problem = repair.problemDescription || '-';
        const problemLines = doc.splitTextToSize(problem, CONTENT_W - 8);
        const boxH = Math.max(14, problemLines.length * 5 + 8);
        fill(slate50);
        doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
        doc.setLineWidth(0.3);
        doc.roundedRect(M, y, CONTENT_W, boxH, 2, 2, 'FD');
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(10.5);
        setColor(ink);
        doc.text(problemLines, M + 4, y + 6);
        y += boxH + 12;

        // ===== Ücretlendirme tablosu =====
        sectionTitle('Ücretlendirme');
        const remaining = (repair.repairCost || 0) - (repair.prePayment || 0);
        const rows: [string, string][] = [
            ['Tamir Ücreti', money(repair.repairCost)],
            ['Ön Ödeme', money(repair.prePayment)],
        ];
        const rowH = 9;
        rows.forEach((r, i) => {
            if (i % 2 === 1) {
                fill(slate50);
                doc.rect(M, y - 6, CONTENT_W, rowH, 'F');
            }
            doc.setFont('Roboto', 'normal');
            doc.setFontSize(10.5);
            setColor(ink);
            doc.text(r[0], M + 3, y);
            doc.text(r[1], PAGE_W - M - 3, y, { align: 'right' });
            y += rowH;
        });
        // Kalan tutar — vurgulu satır
        fill(slate900);
        doc.roundedRect(M, y - 6, CONTENT_W, rowH + 1, 1.5, 1.5, 'F');
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(255, 255, 255);
        doc.text('Kalan Tutar', M + 3, y + 0.5);
        doc.text(money(remaining), PAGE_W - M - 3, y + 0.5, { align: 'right' });
        y += rowH + 14;

        // ===== İmza alanları =====
        const signW = (CONTENT_W - 10) / 2;
        const signY = Math.max(y, 250);
        doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
        doc.setLineWidth(0.4);
        doc.line(M, signY, M + signW, signY);
        doc.line(PAGE_W - M - signW, signY, PAGE_W - M, signY);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(9);
        setColor(slate500);
        doc.text('Teslim Eden (Yetkili)', M, signY + 5);
        doc.text('Teslim Alan (Müşteri)', PAGE_W - M - signW, signY + 5);

        // ===== Alt bilgi =====
        const footY = 285;
        doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
        doc.setLineWidth(0.3);
        doc.line(M, footY - 5, PAGE_W - M, footY - 5);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8);
        setColor(slate500);
        doc.text('Bu form cihaz teslim tutanağı niteliğindedir.', PAGE_W / 2, footY, { align: 'center' });
        doc.text('Bizi tercih ettiğiniz için teşekkür ederiz.', PAGE_W / 2, footY + 4, { align: 'center' });

        const safeName = repair.customerName
            .normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'Musteri';
        doc.save(`Servis_Formu_${safeName}.pdf`);
    };

    // Date filter state
    const [dateFilter, setDateFilter] = useState<'today' | 'thisMonth' | 'lastMonth' | 'all' | 'custom'>('today');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const [form, setForm] = useState({
        customerName: '', customerPhone: '', deviceInfo: '', imei: '',
        problemDescription: '', repairCost: 0, partsCost: 0, prePayment: 0,
        status: 'in_progress' as RepairRecord['status'], paymentMethod: 'cash', technicianNotes: '',
        supplierId: '', supplierName: ''
    });

    const statuses = [
        { id: 'all', label: 'Tümü' },
        { id: 'in_progress', label: 'İşlemde' },
        { id: 'waiting_parts', label: 'Parça Bekliyor' },
        { id: 'completed', label: 'Tamamlandı' },
        { id: 'delivered', label: 'Teslim Edildi' },
        { id: 'cancelled', label: 'İptal' },
    ];

    // Compute date range
    const dateRange = useMemo(() => {
        const now = new Date();
        if (dateFilter === 'thisMonth') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            return { start, end };
        }
        if (dateFilter === 'today') {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            return { start, end };
        }
        if (dateFilter === 'lastMonth') {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            return { start, end };
        }
        if (dateFilter === 'custom' && customStart && customEnd) {
            return { start: new Date(customStart + 'T00:00:00'), end: new Date(customEnd + 'T23:59:59') };
        }
        return null; // all time
    }, [dateFilter, customStart, customEnd]);

    const filtered = useMemo(() =>
        repairs.filter(r => {
            // Date filter
            if (dateRange) {
                const d = new Date(r.createdAt);
                if (d < dateRange.start || d > dateRange.end) return false;
            }
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (search && !(r.customerName || '').toLowerCase().includes(search.toLowerCase()) && !(r.deviceInfo || '').toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [repairs, statusFilter, search, dateRange]);

    const totalRepairs = filtered.length;
    const activeRepairs = filtered.filter(r => r.status === 'in_progress' || r.status === 'waiting_parts').length;
    const completedRepairs = filtered.filter(r => r.status === 'completed' || r.status === 'delivered').length;
    const totalRevenue = filtered.filter(r => r.status !== 'cancelled').reduce((s, r) => s + r.repairCost, 0);

    const openCreate = () => {
        setEditing(null);
        setForm({ customerName: '', customerPhone: '', deviceInfo: '', imei: '', problemDescription: '', repairCost: 0, partsCost: 0, prePayment: 0, status: 'in_progress', paymentMethod: 'cash', technicianNotes: '', supplierId: '', supplierName: '' });
        setShowModal(true);
    };

    const openEdit = (r: RepairRecord) => {
        setEditing(r);
        setForm({
            customerName: r.customerName, customerPhone: r.customerPhone, deviceInfo: r.deviceInfo,
            imei: r.imei, problemDescription: r.problemDescription, repairCost: r.repairCost,
            partsCost: r.partsCost, prePayment: r.prePayment, status: r.status,
            paymentMethod: r.paymentMethod || 'cash', technicianNotes: r.technicianNotes,
            supplierId: r.supplierId || '', supplierName: r.supplierName || ''
        });
        setShowModal(true);
    };

    const handleSupplierChange = (supplierId: string) => {
        const supplier = suppliers.find(s => s.id === supplierId);
        setForm({
            ...form,
            supplierId: supplierId,
            supplierName: supplier?.name || ''
        });
    };

    // Save repair
    const handleSave = async () => {
        if (!form.customerName || !form.deviceInfo) { showToast('Müşteri adı ve cihaz bilgisi zorunlu!', 'error'); return; }
        try {
            const commissionRate = parseFloat(localStorage.getItem('cardCommissionRate') || '0');
            let profit = form.repairCost - form.partsCost;
            if (form.paymentMethod === 'card' && commissionRate > 0) {
                profit -= form.repairCost * (commissionRate / 100);
            }

            const recordData = {
                ...form,
                profit,
                createdAt: editing?.createdAt || new Date().toISOString(),
                deliveredAt: form.status === 'delivered' ? new Date().toISOString() : undefined,
            };

            if (editing) {
                const record: RepairRecord = { id: editing.id, ...recordData };
                await api.saveRepair(record);
                setRepairs(repairs.map(r => r.id === record.id ? record : r));
            } else {
                const record: RepairRecord = { id: '', ...recordData };
                const result = await api.saveRepair(record);
                const saved: RepairRecord = result ? { ...recordData, ...result } : { ...record, id: generateId() };
                setRepairs([saved, ...repairs]);
            }
            setShowModal(false);
            const msg = editing ? 'Tamir kaydı güncellendi!' : 'Tamir kaydı eklendi!';
            showToast(form.supplierId && form.partsCost > 0
                ? `${msg} Tedarikçi borcuna yansıtıldı.`
                : msg);
        } catch (err) {
            console.error('Repair save error:', err);
            showToast('Hata oluştu!', 'error');
        }
    };

    // Status progression handler
    const handleStatusAdvance = async (r: RepairRecord) => {
        const nextStatus = getNextStatus(r.status);
        if (!nextStatus) return;

        try {
            const updated: RepairRecord = {
                ...r,
                status: nextStatus,
                deliveredAt: nextStatus === 'delivered' ? new Date().toISOString() : r.deliveredAt,
            };
            await api.saveRepair(updated);
            setRepairs(repairs.map(rep => rep.id === r.id ? updated : rep));

            const statusLabel = getRepairStatusInfo(nextStatus).label;
            showToast(`Durum güncellendi: ${statusLabel}`);
        } catch {
            showToast('Durum güncellenemedi!', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteRepair(id);
            setRepairs(repairs.filter(r => r.id !== id));
            setDeleteTarget(null);
            showToast('Silindi!');
        } catch { showToast('Hata!', 'error'); }
    };

    return (
        <>
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                    <div className="flex justify-between items-center">
                        <div><h2 className="text-2xl font-bold text-white">Tamir Kayıtları</h2><p className="text-slate-400 text-sm mt-1">Cihaz tamir takibi</p></div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => { setDateFilter('today'); setCustomStart(''); setCustomEnd(''); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateFilter === 'today' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                                Bugün
                            </button>
                            <button onClick={() => { setDateFilter('thisMonth'); setCustomStart(''); setCustomEnd(''); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateFilter === 'thisMonth' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                                Bu Ay
                            </button>
                            <button onClick={() => { setDateFilter('lastMonth'); setCustomStart(''); setCustomEnd(''); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateFilter === 'lastMonth' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                                Geçen Ay
                            </button>
                            <button onClick={() => { setDateFilter('all'); setCustomStart(''); setCustomEnd(''); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateFilter === 'all' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                                Tüm Zamanlar
                            </button>
                            <div className="flex items-center gap-1 ml-2">
                                <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); if (e.target.value && customEnd) setDateFilter('custom'); }}
                                    className="bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-white focus:border-amber-500 outline-none" />
                                <span className="text-slate-500 text-xs">—</span>
                                <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); if (customStart && e.target.value) setDateFilter('custom'); }}
                                    className="bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-white focus:border-amber-500 outline-none" />
                            </div>
                            <button onClick={openCreate} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-amber-500/25 flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">add</span>Yeni Tamir
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'Toplam Kayıt', value: totalRepairs, icon: 'build', color: 'text-amber-400', bgIcon: 'text-amber-500' },
                            { label: 'Aktif İşlemler', value: activeRepairs, icon: 'pending', color: 'text-blue-400', bgIcon: 'text-blue-500' },
                            { label: 'Tamamlanan', value: completedRepairs, icon: 'check_circle', color: 'text-emerald-400', bgIcon: 'text-green-500' },
                            { label: 'Toplam Gelir', value: fp(totalRevenue), icon: 'payments', color: 'text-green-400', bgIcon: 'text-green-500' },
                        ].map(card => (
                            <div key={card.label} className="glass-panel p-5 rounded-xl flex flex-col justify-between h-32 relative overflow-hidden">
                                <div className="absolute right-0 top-0 p-4 opacity-10"><span className={`material-symbols-outlined text-6xl ${card.bgIcon}`}>{card.icon}</span></div>
                                <div><p className="text-slate-400 text-sm mb-1">{card.label}</p><h3 className="text-2xl font-bold text-white">{card.value}</h3></div>
                            </div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="flex gap-3 items-center bg-surface-dark border border-slate-700/50 p-4 rounded-xl">
                        <div className="relative w-64">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Müşteri, cihaz..."
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 outline-none" />
                        </div>
                        <div className="flex gap-2 ml-auto">
                            {statuses.map(s => (
                                <button key={s.id} onClick={() => setStatusFilter(s.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s.id ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-surface-dark border border-slate-700/50 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[800px]">
                                <thead><tr className="bg-slate-800/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                                    <th className="p-4">Tarih</th><th className="p-4">Müşteri</th><th className="p-4">Cihaz</th><th className="p-4">IMEI</th>
                                    <th className="p-4 text-right">Ücret</th><th className="p-4 text-right">Kâr</th><th className="p-4">Durum</th><th className="p-4 text-center">İşlemler</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-700/50 text-sm">
                                    {filtered.length === 0 ? (
                                        <tr><td colSpan={8} className="text-center py-16 text-slate-400">
                                            <span className="material-symbols-outlined text-6xl mb-4 block">inbox</span><p>Kayıt yok</p>
                                            <button onClick={openCreate} className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm">İlk Kaydı Ekle</button>
                                        </td></tr>
                                    ) : filtered.map(r => {
                                        const st = getRepairStatusInfo(r.status);
                                        const nextStatus = getNextStatus(r.status);
                                        const nextSt = nextStatus ? getRepairStatusInfo(nextStatus) : null;
                                        return (
                                            <tr key={r.id} onClick={() => setSelectedRepair(r)} className={`hover:bg-surface-hover/50 transition-colors cursor-pointer ${selectedRepair?.id === r.id ? 'bg-amber-500/10 border-l-2 border-amber-500' : ''}`}>
                                                <td className="p-4 text-slate-300">{formatDate(r.createdAt)}</td>
                                                <td className="p-4">
                                                    <div className="font-medium text-white">{r.customerName}</div>
                                                    <div className="text-xs text-slate-400">{r.customerPhone}</div>
                                                </td>
                                                <td className="p-4 text-white">{r.deviceInfo}</td>
                                                <td className="p-4 text-slate-400 font-mono text-xs">{r.imei || '—'}</td>
                                                <td className="p-4 text-right font-medium text-white">{fp(r.repairCost)}</td>
                                                <td className="p-4 text-right font-medium text-emerald-400">+{fp(r.profit)}</td>
                                                {/* Status Column with Progression Button */}
                                                <td className="p-4">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.color} w-fit`}>
                                                            {st.pulse && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>}
                                                            {st.label}
                                                        </span>
                                                        {nextSt && r.status !== 'cancelled' && (
                                                            <button
                                                                onClick={() => handleStatusAdvance(r)}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 transition-all w-fit cursor-pointer group"
                                                                title={`${nextSt.label} olarak güncelle`}
                                                            >
                                                                <span className="material-symbols-outlined text-xs group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                                                                {nextSt.label}
                                                            </button>
                                                        )}
                                                        {r.supplierName && (
                                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-xs">local_shipping</span>
                                                                {r.supplierName}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex justify-center gap-1">
                                                        <button onClick={(e) => { e.stopPropagation(); setPhotoRepair(r); }} className="p-1.5 rounded-lg hover:bg-blue-500/10 text-slate-400 hover:text-blue-400" title="Fotoğraflar"><span className="material-symbols-outlined text-lg">photo_camera</span></button>
                                                        <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-slate-400 hover:text-amber-400"><span className="material-symbols-outlined text-lg">edit</span></button>
                                                        <button onClick={() => setDeleteTarget(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400"><span className="material-symbols-outlined text-lg">delete</span></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedRepair && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedRepair(null)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin animate-fade-in shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 z-10 bg-surface-dark border-b border-slate-700 p-5 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">Tamir Detayı</h3>
                            <button onClick={() => setSelectedRepair(null)} className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-400 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Status */}
                            {(() => {
                                const st = getRepairStatusInfo(selectedRepair.status); return (
                                    <div className="flex items-center gap-2">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                                        {selectedRepair.supplierName && <span className="text-xs text-slate-400 flex items-center gap-1"><span className="material-symbols-outlined text-xs">local_shipping</span>{selectedRepair.supplierName}</span>}
                                    </div>
                                );
                            })()}

                            {/* Customer */}
                            <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Müşteri Bilgileri</p>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center"><span className="material-symbols-outlined text-amber-400">person</span></div>
                                    <div>
                                        <p className="font-medium text-white">{selectedRepair.customerName}</p>
                                        <p className="text-xs text-slate-400">{selectedRepair.customerPhone}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Device */}
                            <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cihaz Bilgileri</p>
                                <p className="text-white font-medium">{selectedRepair.deviceInfo}</p>
                                {selectedRepair.imei && <p className="text-xs text-slate-400 font-mono">IMEI: {selectedRepair.imei}</p>}
                                <p className="text-sm text-slate-300 mt-2">
                                    <span className="text-slate-500">Arıza:</span> {selectedRepair.problemDescription || '—'}
                                </p>
                            </div>

                            {/* Dates */}
                            <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tarihler</p>
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-blue-400 text-lg">event</span>
                                    <div>
                                        <p className="text-xs text-slate-500">Alınma Tarihi</p>
                                        <p className="text-sm text-white">{formatDate(selectedRepair.createdAt)}</p>
                                    </div>
                                </div>
                                {selectedRepair.deliveredAt && (
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>
                                        <div>
                                            <p className="text-xs text-slate-500">Teslim Tarihi</p>
                                            <p className="text-sm text-white">{formatDate(selectedRepair.deliveredAt)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Financials */}
                            <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ücret Detayları</p>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm"><span className="text-slate-400">Tamir Ücreti</span><span className="text-white font-medium">{fp(selectedRepair.repairCost)}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-slate-400">Parça Maliyeti</span><span className="text-red-400">-{fp(selectedRepair.partsCost)}</span></div>
                                    {selectedRepair.prePayment > 0 && <div className="flex justify-between text-sm"><span className="text-slate-400">Ön Ödeme</span><span className="text-blue-400">{fp(selectedRepair.prePayment)}</span></div>}
                                    <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold"><span className="text-slate-300">Net Kâr</span><span className="text-emerald-400">{fp(selectedRepair.profit)}</span></div>
                                </div>
                            </div>

                            {/* Payment Method */}
                            {selectedRepair.paymentMethod && (
                                <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ödeme</p>
                                    <p className="text-sm text-white">
                                        {selectedRepair.paymentMethod === 'cash' ? '💵 Nakit' : selectedRepair.paymentMethod === 'card' ? '💳 Kart' : '🏦 Havale'}
                                    </p>
                                </div>
                            )}

                            {/* Supplier */}
                            {selectedRepair.supplierName && (
                                <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tedarikçi</p>
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-violet-400">local_shipping</span>
                                        <p className="text-sm text-white">{selectedRepair.supplierName}</p>
                                    </div>
                                </div>
                            )}

                            {/* Technician Notes */}
                            {selectedRepair.technicianNotes && (
                                <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Teknisyen Notları</p>
                                    <p className="text-sm text-slate-300">{selectedRepair.technicianNotes}</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-3 pt-4 pb-2 border-t border-slate-700 mt-4">
                                <button onClick={() => generateServiceForm(selectedRepair)} className="flex-1 py-2.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                                    <span className="material-symbols-outlined text-lg">print</span> Form Yazdır
                                </button>
                                <button onClick={() => setPhotoRepair(selectedRepair)} className="flex-1 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                                    <span className="material-symbols-outlined text-lg">photo_camera</span> Fotoğraflar
                                </button>
                                <button onClick={() => openEdit(selectedRepair)} className="flex-1 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                                    <span className="material-symbols-outlined text-lg">edit</span> Düzenle
                                </button>
                                <button onClick={() => setDeleteTarget(selectedRepair.id)} className="flex-1 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                                    <span className="material-symbols-outlined text-lg">delete</span> Sil
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">{editing ? 'Tamir Düzenle' : 'Yeni Tamir Kaydı'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <CustomerSelector
                                customers={customers}
                                selectedCustomerName={form.customerName}
                                selectedCustomerPhone={form.customerPhone}
                                onSelect={(name, phone) => setForm({ ...form, customerName: name, customerPhone: phone })}
                                onAddNew={async (c) => { try { const r = await api.saveCustomer(c); if (r) setCustomers([r as unknown as Customer, ...customers]); } catch { } }}
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Cihaz Modeli *</label>
                                    <input type="text" value={form.deviceInfo} onChange={e => setForm({ ...form, deviceInfo: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">IMEI</label>
                                    <div className="flex gap-1">
                                        <input type="text" value={form.imei} onChange={e => setForm({ ...form, imei: e.target.value })} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" placeholder="Manuel girin veya tarayın" />
                                        <button type="button" onClick={() => setShowScanner(true)} className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400 transition-all" title="Kamera ile IMEI tara">
                                            <span className="material-symbols-outlined text-lg">photo_camera</span>
                                        </button>
                                    </div></div>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Arıza Açıklaması</label>
                                <textarea value={form.problemDescription} onChange={e => setForm({ ...form, problemDescription: e.target.value })} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none resize-none" /></div>

                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400 text-lg">local_shipping</span>
                                    <label className="text-sm font-medium text-white">Parça Tedarikçisi</label>
                                </div>
                                <select
                                    value={form.supplierId}
                                    onChange={e => handleSupplierChange(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none"
                                >
                                    <option value="">Tedarikçi seçin (opsiyonel)</option>
                                    {suppliers.filter(s => s.isActive !== false).map(s => (
                                        <option key={s.id} value={s.id}>{s.name} {s.balance > 0 ? `(Borç: ${fp(s.balance)})` : ''}</option>
                                    ))}
                                </select>
                                {form.supplierId && form.partsCost > 0 && (
                                    <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                        <span className="material-symbols-outlined text-sm">info</span>
                                        <span>Kaydettiğinizde <strong>{form.supplierName}</strong> tedarikçisine <strong>{fp(form.partsCost)}</strong> borç eklenecek.</span>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Tamir Ücreti</label>
                                    <input type="number" value={form.repairCost} onChange={e => setForm({ ...form, repairCost: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Parça Maliyeti</label>
                                    <input type="number" value={form.partsCost} onChange={e => setForm({ ...form, partsCost: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Ön Ödeme</label>
                                    <input type="number" value={form.prePayment} onChange={e => setForm({ ...form, prePayment: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none" /></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Durum</label>
                                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as RepairRecord['status'] })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none">
                                        <option value="in_progress">İşlemde</option><option value="waiting_parts">Parça Bekliyor</option>
                                        <option value="completed">Tamamlandı</option><option value="delivered">Teslim Edildi</option><option value="cancelled">İptal</option>
                                    </select></div>
                                <div><label className="block text-sm font-medium text-slate-300 mb-1">Ödeme Yöntemi</label>
                                    <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none">
                                        <option value="cash">Nakit</option><option value="card">Kart</option><option value="transfer">Havale</option>
                                    </select></div>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-300 mb-1">Teknisyen Notları</label>
                                <textarea value={form.technicianNotes} onChange={e => setForm({ ...form, technicianNotes: e.target.value })} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:border-amber-500 outline-none resize-none" /></div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg">İptal</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-amber-500/25">Kaydet</button>
                        </div>
                    </div>
                </div>
            )
            }

            {
                deleteTarget && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]" onClick={() => setDeleteTarget(null)}>
                        <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-sm animate-fade-in p-6 text-center" onClick={e => e.stopPropagation()}>
                            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-3xl text-red-400">delete_forever</span>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Kaydı Sil</h3>
                            <p className="text-sm text-slate-400 mb-6">Bu tamir kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</p>
                            <div className="flex gap-3 justify-center">
                                <button onClick={() => setDeleteTarget(null)} className="px-5 py-2 text-sm text-slate-300 hover:bg-surface-hover rounded-lg border border-slate-700">İptal</button>
                                <button onClick={() => handleDelete(deleteTarget)} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium shadow-lg shadow-red-500/25">Sil</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Photo Gallery Modal */}
            {photoRepair && (
                <RepairPhotoGalleryModal repair={photoRepair} onClose={() => setPhotoRepair(null)} />
            )}

            {
                showScanner && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70]" onClick={stopScanner}>
                        <div className="bg-surface-dark border border-slate-700 rounded-2xl w-[95vw] md:w-full md:max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-4 border-b border-slate-700">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">photo_camera</span>
                                    <h3 className="text-lg font-bold text-white">IMEI Tarayıcı</h3>
                                </div>
                                <button onClick={stopScanner} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400"><span className="material-symbols-outlined">close</span></button>
                            </div>
                            <div className="p-4">
                                <p className="text-sm text-slate-400 mb-3">Barkodu kameraya gösterin, otomatik okunacak</p>
                                <div id="imei-scanner-region" className="rounded-lg overflow-hidden bg-black" style={{ minHeight: 280 }}></div>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
}
