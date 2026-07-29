import type { RepairRecord } from '../types';

/**
 * Tamir kayıtlarının para hesapları tek yerde toplanır; iade/değişim işlemleri
 * hem kârı hem ciroyu etkilediği için her iki tarafın da aynı formülü kullanması şart.
 */

/** Bir tamir kaydına işlenmiş iadelerin toplam tutarı. */
export function returnsTotal(repair: Pick<RepairRecord, 'returns'>): number {
    return (repair.returns || []).reduce((sum, r) => sum + (Number(r.refundAmount) || 0), 0);
}

/** İade düşülmüş net ciro — raporlarda ve analizlerde `repairCost` yerine bu kullanılır. */
export function repairNetRevenue(repair: Pick<RepairRecord, 'repairCost' | 'returns'>): number {
    return (Number(repair.repairCost) || 0) - returnsTotal(repair);
}

/** Kart ödemelerinde komisyon kârdan düşülür (oran Ayarlar'dan gelir). */
export function cardCommission(repairCost: number, paymentMethod: string | undefined, rate: number): number {
    if (paymentMethod !== 'card' || !rate) return 0;
    return (Number(repairCost) || 0) * (rate / 100);
}

/** Tek doğruluk kaynağı: ücret − parça − kart komisyonu − iadeler. */
export function computeRepairProfit(params: {
    repairCost: number;
    partsCost: number;
    paymentMethod?: string;
    commissionRate: number;
    returnsTotal?: number;
}): number {
    const { repairCost, partsCost, paymentMethod, commissionRate } = params;
    const commission = cardCommission(repairCost, paymentMethod, commissionRate);
    return (Number(repairCost) || 0) - (Number(partsCost) || 0) - commission - (params.returnsTotal || 0);
}

/** Ayarlar'da tutulan kredi kartı komisyon oranı. */
export function getCommissionRate(): number {
    return parseFloat(localStorage.getItem('cardCommissionRate') || '0') || 0;
}
