export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
}

export function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

export function getStockStatus(stock: number, minStock: number) {
    if (stock === 0) return { label: 'Stoksuz', color: 'bg-slate-500/20 text-slate-400', pulse: false };
    if (stock <= minStock) return { label: 'Kritik', color: 'bg-red-500/20 text-red-400', pulse: true };
    return { label: 'Stokta', color: 'bg-emerald-500/20 text-emerald-400', pulse: false };
}

export function getRepairStatusInfo(status: string) {
    const map: Record<string, { label: string; color: string; pulse: boolean }> = {
        in_progress: { label: 'İşlemde', color: 'bg-blue-500/20 text-blue-400', pulse: true },
        completed: { label: 'Tamamlandı', color: 'bg-green-500/20 text-green-400', pulse: false },
        delivered: { label: 'Teslim Edildi', color: 'bg-emerald-500/20 text-emerald-400', pulse: false },
        waiting_parts: { label: 'Parça Bekliyor', color: 'bg-orange-500/20 text-orange-400', pulse: false },
        cancelled: { label: 'İptal', color: 'bg-red-500/20 text-red-400', pulse: false },
    };
    return map[status] || map.in_progress;
}

export function getRequestStatusInfo(status: string) {
    const map: Record<string, { label: string; color: string }> = {
        pending: { label: 'Beklemede', color: 'bg-blue-500/20 text-blue-400' },
        found: { label: 'Bulundu', color: 'bg-green-500/20 text-green-400' },
        notified: { label: 'Bildirildi', color: 'bg-purple-500/20 text-purple-400' },
        completed: { label: 'Tamamlandı', color: 'bg-emerald-500/20 text-emerald-400' },
        cancelled: { label: 'İptal', color: 'bg-red-500/20 text-red-400' },
    };
    return map[status] || map.pending;
}

export function getPaymentMethodLabel(method: string) {
    const map: Record<string, string> = {
        cash: 'Nakit', nakit: 'Nakit',
        card: 'Kart', kart: 'Kart',
        transfer: 'Havale', havale: 'Havale',
        mixed: 'Karışık', vadeli: 'Vadeli',
    };
    return map[method] || method;
}

export function getPurchaseStatusInfo(status: string) {
    const map: Record<string, { label: string; color: string }> = {
        odenmedi: { label: 'Ödenmedi', color: 'bg-red-500/20 text-red-400' },
        kismi_odendi: { label: 'Kısmi Ödendi', color: 'bg-orange-500/20 text-orange-400' },
        odendi: { label: 'Ödendi', color: 'bg-emerald-500/20 text-emerald-400' },
    };
    return map[status] || map.odenmedi;
}

export function generateId(): string {
    return Date.now().toString();
}
