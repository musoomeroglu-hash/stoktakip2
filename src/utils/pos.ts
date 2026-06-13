import type { ReceiptData } from '../types';

// ── Browser-based receipt printing ──
export function printReceiptBrowser(data: ReceiptData): void {
    const html = `
    <html><head><style>
      body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; padding: 4mm; font-size: 11px; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
      .divider { border-top: 1px dashed #000; margin: 4px 0; }
      .row { display: flex; justify-content: space-between; }
      .total-row { font-size: 14px; font-weight: bold; }
      @media print { body { width: 72mm; } }
    </style></head><body>
      <div class="center bold" style="font-size:14px">${data.storeName}</div>
      ${data.storePhone ? `<div class="center">${data.storePhone}</div>` : ''}
      <div class="divider"></div>
      <div class="row"><span>Tarih: ${data.date}</span><span>No: ${data.receiptNo}</span></div>
      ${data.cashierName ? `<div>Kasiyer: ${data.cashierName}</div>` : ''}
      <div class="divider"></div>
      ${data.items.map(item => `
        <div>${item.name}</div>
        <div class="row"><span>${item.qty} x ₺${item.price.toFixed(2)}</span><span>₺${item.total.toFixed(2)}</span></div>
      `).join('')}
      <div class="divider"></div>
      <div class="row"><span>Ara Toplam:</span><span>₺${data.subtotal.toFixed(2)}</span></div>
      ${data.discount ? `<div class="row"><span>İndirim:</span><span>-₺${data.discount.toFixed(2)}</span></div>` : ''}
      <div class="row total-row"><span>TOPLAM:</span><span>₺${data.total.toFixed(2)}</span></div>
      <div class="divider"></div>
      <div>Ödeme: ${data.paymentMethod}</div>
      ${data.note ? `<div class="center" style="margin-top:8px">${data.note}</div>` : ''}
    </body></html>`;

    const win = window.open('', '_blank', 'width=320,height=600');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.onafterprint = () => win.close();
        setTimeout(() => win.print(), 300);
    }
}

// ── ESC/POS via Web Serial API ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let savedPort: any = null;

export async function connectPrinter(): Promise<unknown> {
    try {
        // TODO: PRODUCTION — may need different baud rate
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nav = navigator as any;
        if (!nav.serial) throw new Error('Web Serial API desteklenmiyor');
        const port = await nav.serial.requestPort();
        await port.open({ baudRate: 9600 });
        savedPort = port;
        return port;
    } catch (err) {
        console.warn('Yazıcı bağlantısı başarısız:', err);
        return null;
    }
}

export async function printWithSavedPrinter(data: ReceiptData): Promise<void> {
    if (!savedPort?.writable) throw new Error('Yazıcı bağlı değil');
    const writer = savedPort.writable.getWriter();
    const encoder = new TextEncoder();
    const ESC = '\x1B';
    const GS = '\x1D';

    const lines: string[] = [
        `${ESC}@`,
        `${ESC}a\x01`,
        `${GS}!\x11`,
        data.storeName,
        `${GS}!\x00`,
        data.storePhone || '',
        '─'.repeat(32),
        `${ESC}a\x00`,
        `Tarih: ${data.date}    No: ${data.receiptNo}`,
        '─'.repeat(32),
    ];

    data.items.forEach(item => {
        lines.push(item.name);
        const qty = `${item.qty}x₺${item.price.toFixed(2)}`;
        const total = `₺${item.total.toFixed(2)}`;
        lines.push(qty + ' '.repeat(Math.max(1, 32 - qty.length - total.length)) + total);
    });

    lines.push('─'.repeat(32));
    const totalStr = `₺${data.total.toFixed(2)}`;
    lines.push(`${GS}!\x11TOPLAM:${' '.repeat(Math.max(1, 20 - totalStr.length))}${totalStr}${GS}!\x00`);
    lines.push('─'.repeat(32));
    lines.push(`Ödeme: ${data.paymentMethod}`);
    if (data.note) { lines.push(`${ESC}a\x01`); lines.push(data.note); }
    lines.push('\n\n\n');
    lines.push(`${GS}V\x00`);

    await writer.write(encoder.encode(lines.join('\n')));
    writer.releaseLock();
}
