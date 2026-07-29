import type { Customer } from '../types';

/**
 * Tamir/satış kayıtlarında `customerId` alanı yok — eşleştirme telefon, olmazsa
 * isim tam eşleşmesiyle yapılır. Raporlar ve müşteri istatistikleri aynı mantığı
 * kullanmalı, yoksa iki ekran farklı sonuç gösterir.
 */
export function findCustomer(customers: Customer[], name?: string, phone?: string): Customer | undefined {
    const n = (name || '').trim().toLowerCase();
    const p = (phone || '').trim();
    return customers.find(c => {
        const cn = (c.name || '').trim().toLowerCase();
        const cp = (c.phone || '').trim();
        if (p && cp && p === cp) return true;
        if (n && cn === n) return true;
        return false;
    });
}
