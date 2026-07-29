import { jsPDF } from 'jspdf';
import type { Customer, RepairRecord, PhoneSale, Sale } from '../types';
import { repairNetRevenue } from './repairMath';

/**
 * Müşteriye verilen iş dökümü raporları.
 *
 * Önemli: bu raporlar müşteriye gittiği için KÂR/MALİYET bilgisi içermez —
 * yalnızca müşteriden alınan ücret yazılır. Fiyatlar `useFormatPrice` yerine
 * doğrudan formatlanır; o hook gizli modda tutarları maskeliyor.
 */

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM_LIMIT = PAGE_H - 20;

const slate900: RGB = [15, 23, 42];
const slate500: RGB = [100, 116, 139];
const slate200: RGB = [226, 232, 240];
const slate50: RGB = [248, 250, 252];
const ink: RGB = [30, 41, 59];
const accent: RGB = [37, 99, 235];

type RGB = [number, number, number];

export interface ReportData {
    repairs: RepairRecord[];
    phoneSales: PhoneSale[];
    productSales: Sale[];
}

export interface StoreInfo {
    name: string;
    phone?: string;
}

export interface ReportMeta {
    /** "Bu Ay", "01.01.2026 - 31.01.2026" gibi başlıkta gösterilecek dönem etiketi. */
    periodLabel: string;
}

export function getStoreInfo(): StoreInfo {
    return {
        // toUpperCase() Türkçe'de "i" harfini "I" yapar; tr-TR locale'i "İ" verir
        name: (localStorage.getItem('storeName') || 'TEKNİK SERVİS').toLocaleUpperCase('tr-TR'),
        phone: localStorage.getItem('storePhone') || '',
    };
}

const money = (n: number) =>
    `${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

const shortDate = (d?: string) => (d ? new Date(d).toLocaleDateString('tr-TR') : '-');

function safeFileName(text: string, fallback = 'Rapor'): string {
    return text.normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
}

interface Column {
    header: string;
    width: number;
    align?: 'left' | 'right';
}

/** Sayfa akışını, tablo çizimini ve taşma yönetimini tutan çizim bağlamı. */
function createContext(doc: jsPDF, store: StoreInfo, title: string, subtitle: string) {
    let y = 0;
    let page = 0;

    const setColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);

    const drawPageHeader = () => {
        page += 1;
        const headerH = page === 1 ? 30 : 18;
        fill(slate900);
        doc.rect(0, 0, PAGE_W, headerH, 'F');
        fill(accent);
        doc.rect(0, headerH, PAGE_W, 1.2, 'F');

        doc.setFont('Roboto', 'bold');
        doc.setFontSize(page === 1 ? 16 : 11);
        doc.setTextColor(255, 255, 255);
        doc.text(store.name, M, page === 1 ? 15 : 12);

        if (page === 1 && store.phone) {
            doc.setFont('Roboto', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(203, 213, 225);
            doc.text(`Tel: ${store.phone}`, M, 22);
        }

        doc.setFont('Roboto', 'bold');
        doc.setFontSize(page === 1 ? 12 : 9);
        doc.setTextColor(255, 255, 255);
        doc.text(title, PAGE_W - M, page === 1 ? 14 : 12, { align: 'right' });

        if (page === 1) {
            doc.setFont('Roboto', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(203, 213, 225);
            doc.text(subtitle, PAGE_W - M, 20, { align: 'right' });
            doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, PAGE_W - M, 25.5, { align: 'right' });
        }

        y = headerH + 12;
    };

    const drawFooter = () => {
        doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
        doc.setLineWidth(0.3);
        doc.line(M, PAGE_H - 14, PAGE_W - M, PAGE_H - 14);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8);
        setColor(slate500);
        doc.text(store.name, M, PAGE_H - 9);
        doc.text(`Sayfa ${page}`, PAGE_W - M, PAGE_H - 9, { align: 'right' });
    };

    const newPage = () => {
        drawFooter();
        doc.addPage();
        drawPageHeader();
    };

    /** İstenen yükseklik sayfaya sığmıyorsa yeni sayfaya geç; onNewPage tablo başlığını tekrar çizer. */
    const ensureSpace = (needed: number, onNewPage?: () => void) => {
        if (y + needed <= BOTTOM_LIMIT) return;
        newPage();
        onNewPage?.();
    };

    const sectionTitle = (text: string) => {
        ensureSpace(16);
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(11);
        setColor(accent);
        doc.text(text, M, y);
        doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
        doc.setLineWidth(0.3);
        doc.line(M, y + 2, PAGE_W - M, y + 2);
        y += 8;
    };

    const drawTable = (columns: Column[], rows: string[][]) => {
        const headerH = 8;

        const drawHeaderRow = () => {
            fill(slate900);
            doc.rect(M, y, CONTENT_W, headerH, 'F');
            doc.setFont('Roboto', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(255, 255, 255);
            let x = M;
            columns.forEach(col => {
                const isRight = col.align === 'right';
                doc.text(col.header, isRight ? x + col.width - 2 : x + 2, y + 5.5, { align: isRight ? 'right' : 'left' });
                x += col.width;
            });
            y += headerH;
        };

        drawHeaderRow();

        rows.forEach((row, idx) => {
            doc.setFont('Roboto', 'normal');
            doc.setFontSize(8.5);
            const cellLines = row.map((cell, i) => doc.splitTextToSize(cell || '-', columns[i].width - 4) as string[]);
            const maxLines = Math.max(1, ...cellLines.map(l => l.length));
            const rowH = maxLines * 4 + 3.5;

            ensureSpace(rowH, drawHeaderRow);

            if (idx % 2 === 1) {
                fill(slate50);
                doc.rect(M, y, CONTENT_W, rowH, 'F');
            }

            doc.setFont('Roboto', 'normal');
            doc.setFontSize(8.5);
            setColor(ink);
            let x = M;
            columns.forEach((col, i) => {
                const isRight = col.align === 'right';
                doc.text(cellLines[i], isRight ? x + col.width - 2 : x + 2, y + 5, { align: isRight ? 'right' : 'left' });
                x += col.width;
            });
            y += rowH;
        });

        // Alt çizgi
        doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
        doc.setLineWidth(0.3);
        doc.line(M, y, PAGE_W - M, y);
        y += 6;
    };

    const totalRow = (label: string, value: string) => {
        ensureSpace(14);
        fill(slate900);
        doc.roundedRect(M, y, CONTENT_W, 10, 1.5, 1.5, 'F');
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(255, 255, 255);
        doc.text(label, M + 3, y + 6.7);
        doc.text(value, PAGE_W - M - 3, y + 6.7, { align: 'right' });
        y += 16;
    };

    const note = (text: string) => {
        ensureSpace(10);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8);
        setColor(slate500);
        doc.splitTextToSize(text, CONTENT_W).forEach((line: string) => {
            doc.text(line, M, y);
            y += 4;
        });
        y += 3;
    };

    const emptyNotice = (text: string) => {
        ensureSpace(12);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(9.5);
        setColor(slate500);
        doc.text(text, M, y);
        y += 10;
    };

    return {
        start: drawPageHeader,
        finish: drawFooter,
        sectionTitle,
        drawTable,
        totalRow,
        note,
        emptyNotice,
        heading: (text: string, sub?: string) => {
            ensureSpace(20);
            doc.setFont('Roboto', 'bold');
            doc.setFontSize(17);
            setColor(ink);
            doc.text(text, M, y);
            y += 7;
            if (sub) {
                doc.setFont('Roboto', 'normal');
                doc.setFontSize(9.5);
                setColor(slate500);
                doc.text(sub, M, y);
                y += 6;
            }
            y += 4;
        },
    };
}

async function createDoc() {
    // 1.3 MB'lık gömülü font ana bundle'a girmesin
    const { registerTurkishFont } = await import('./pdfFont');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    registerTurkishFont(doc);
    return doc;
}

function repairColumns(withCustomer: boolean): Column[] {
    return withCustomer
        ? [
            { header: 'Tarih', width: 20 },
            { header: 'Müşteri', width: 32 },
            { header: 'Cihaz', width: 36 },
            { header: 'IMEI', width: 32 },
            { header: 'Arıza', width: 36 },
            { header: 'Ücret', width: 26, align: 'right' },
        ]
        : [
            { header: 'Tarih', width: 22 },
            { header: 'Cihaz', width: 42 },
            { header: 'IMEI', width: 34 },
            { header: 'Arıza', width: 56 },
            { header: 'Ücret', width: 28, align: 'right' },
        ];
}

function repairRow(r: RepairRecord, withCustomer: boolean): string[] {
    const base = [r.deviceInfo || '-', r.imei || '-', r.problemDescription || '-', money(repairNetRevenue(r))];
    return withCustomer
        ? [shortDate(r.createdAt), r.customerName || '-', ...base]
        : [shortDate(r.createdAt), ...base];
}

function renderSections(ctx: ReturnType<typeof createContext>, data: ReportData, withCustomer: boolean) {
    const repairTotal = data.repairs.reduce((s, r) => s + repairNetRevenue(r), 0);
    const phoneTotal = data.phoneSales.reduce((s, p) => s + (p.salePrice || 0), 0);
    const productTotal = data.productSales.reduce((s, p) => s + (p.totalPrice || 0), 0);

    if (data.repairs.length > 0) {
        ctx.sectionTitle(`Tamir İşlemleri (${data.repairs.length})`);
        ctx.drawTable(repairColumns(withCustomer), data.repairs.map(r => repairRow(r, withCustomer)));
        ctx.totalRow('Tamir Toplamı', money(repairTotal));
    }

    if (data.phoneSales.length > 0) {
        ctx.sectionTitle(`Telefon Satışları (${data.phoneSales.length})`);
        const cols: Column[] = withCustomer
            ? [
                { header: 'Tarih', width: 22 },
                { header: 'Müşteri', width: 40 },
                { header: 'Cihaz', width: 52 },
                { header: 'IMEI', width: 40 },
                { header: 'Tutar', width: 28, align: 'right' },
            ]
            : [
                { header: 'Tarih', width: 24 },
                { header: 'Cihaz', width: 62 },
                { header: 'IMEI', width: 48 },
                { header: 'Tutar', width: 48, align: 'right' },
            ];
        ctx.drawTable(cols, data.phoneSales.map(p => {
            const device = `${p.brand || ''} ${p.model || ''}`.trim() || '-';
            return withCustomer
                ? [shortDate(p.date), p.customerName || '-', device, p.imei || '-', money(p.salePrice)]
                : [shortDate(p.date), device, p.imei || '-', money(p.salePrice)];
        }));
        ctx.totalRow('Telefon Satışları Toplamı', money(phoneTotal));
    }

    if (data.productSales.length > 0) {
        ctx.sectionTitle(`Ürün Satışları (${data.productSales.length})`);
        const cols: Column[] = withCustomer
            ? [
                { header: 'Tarih', width: 22 },
                { header: 'Müşteri', width: 40 },
                { header: 'Ürünler', width: 82 },
                { header: 'Tutar', width: 38, align: 'right' },
            ]
            : [
                { header: 'Tarih', width: 24 },
                { header: 'Ürünler', width: 118 },
                { header: 'Tutar', width: 40, align: 'right' },
            ];
        ctx.drawTable(cols, data.productSales.map(s => {
            const items = (s.items || []).map(i => `${i.productName} x${i.quantity}`).join(', ') || '-';
            return withCustomer
                ? [shortDate(s.date), s.customerInfo?.name || '-', items, money(s.totalPrice)]
                : [shortDate(s.date), items, money(s.totalPrice)];
        }));
        ctx.totalRow('Ürün Satışları Toplamı', money(productTotal));
    }

    const count = data.repairs.length + data.phoneSales.length + data.productSales.length;
    if (count === 0) {
        ctx.emptyNotice('Seçilen dönemde kayıt bulunamadı.');
        return;
    }

    ctx.sectionTitle('Genel Toplam');
    ctx.totalRow(`Toplam ${count} işlem`, money(repairTotal + phoneTotal + productTotal));
}

/** Tek müşteri için dönemsel iş dökümü. */
export async function generateCustomerReport(
    customer: Customer,
    data: ReportData,
    meta: ReportMeta,
    store: StoreInfo = getStoreInfo(),
): Promise<void> {
    const doc = await createDoc();
    const ctx = createContext(doc, store, 'MÜŞTERİ RAPORU', meta.periodLabel);
    ctx.start();

    ctx.heading(customer.name, [customer.phone, customer.address].filter(Boolean).join(' · ') || undefined);
    ctx.note(`Dönem: ${meta.periodLabel}`);

    renderSections(ctx, data, false);
    ctx.note('Tutarlar müşteriden alınan ücretleri gösterir. Bu belge bilgi amaçlıdır.');
    ctx.finish();

    doc.save(`Rapor_${safeFileName(customer.name, 'Musteri')}_${safeFileName(meta.periodLabel, 'Donem')}.pdf`);
}

/** Müşteri ayrımı olmadan, seçilen dönemdeki tüm işlemlerin dökümü. */
export async function generateAllTransactionsReport(
    data: ReportData,
    meta: ReportMeta,
    store: StoreInfo = getStoreInfo(),
): Promise<void> {
    const doc = await createDoc();
    const ctx = createContext(doc, store, 'İŞLEM DÖKÜMÜ', meta.periodLabel);
    ctx.start();

    ctx.heading('Tüm İşlemler', `Dönem: ${meta.periodLabel}`);

    renderSections(ctx, data, true);
    ctx.note('Tutarlar müşterilerden alınan ücretleri gösterir; maliyet ve kâr bilgisi içermez.');
    ctx.finish();

    doc.save(`Islem_Dokumu_${safeFileName(meta.periodLabel, 'Donem')}.pdf`);
}
