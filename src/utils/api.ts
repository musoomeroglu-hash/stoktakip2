import type {
    Category, Product, Sale, RepairRecord, PhoneSale, PhoneStock,
    Expense, CustomerRequest, Supplier, Purchase, PurchaseItem, CariHareket, Payment, Customer,
    WarrantyRecord, Technician, RepairAppointment
} from '../types';

export const SUPABASE_URL = 'https://xtjvbkhappiceyrlovkx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0anZia2hhcHBpY2V5cmxvdmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NTUzNTksImV4cCI6MjA4MjIzMTM1OX0.bUSQ4nkoasOVQdtQwGSxtXiLGbyV9Ih8qlf-sGg3LCg';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/make-server-929c4905`;

// ── Edge Function REST helpers ──
// The Edge Function uses RESTful endpoints, NOT a KV action body format.
// GET  /endpoint       → list all
// POST /endpoint       → create (returns { data: {...} })
// PUT  /endpoint/:id   → update (returns { data: {...} })
// DELETE /endpoint/:id → delete

async function edgeFetch(endpoint: string, options: RequestInit = {}) {
    const res = await fetch(`${EDGE_FUNCTION_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            ...options.headers,
        },
    });
    if (!res.ok) {
        const text = await res.text();
        console.warn(`Edge Error ${res.status} on ${endpoint}:`, text);
        throw new Error(`Edge Error: ${res.status}`);
    }
    return res.json();
}

// ── Supabase REST helpers ──

async function dbFetch(path: string, options?: RequestInit) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'return=representation',
            ...options?.headers,
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`DB Error ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

// ── snake_case <-> camelCase mappers ──

function snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
        result[camelKey] = obj[key];
    }
    return result;
}

function camelToSnake(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const snakeKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
        result[snakeKey] = obj[key];
    }
    return result;
}

// ══════════════════════════════════════
// PUBLIC API — Edge Function (RESTful)
// ══════════════════════════════════════

// ── Categories ──
export async function getCategories(): Promise<Category[]> {
    const data = await dbFetch('/categories?select=*&order=created_at.desc');
    return data || [];
}
export async function saveCategory(cat: Category) {
    const payload = {
        name: cat.name,
        icon: cat.icon || null,
        color: cat.color || null,
    };
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUUID = cat.id && uuidRegex.test(cat.id);

    if (isUUID) {
        const res = await dbFetch(`/categories?id=eq.${cat.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
        return res?.[0] || null;
    } else {
        const res = await dbFetch('/categories', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return res?.[0] || null;
    }
}
export async function deleteCategory(id: string) {
    return dbFetch(`/categories?id=eq.${id}`, { method: 'DELETE' });
}

// ── Products ──
export async function getProducts(): Promise<Product[]> {
    const data = await dbFetch('/products?select=*&order=created_at.desc');
    return (data || []).map((d: Record<string, unknown>) => snakeToCamel(d) as unknown as Product);
}
export async function saveProduct(p: Product) {
    const payload = camelToSnake(p as unknown as Record<string, unknown>);
    delete payload['created_at'];
    delete payload['category_name']; // categories are referenced by id

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUUID = p.id && uuidRegex.test(p.id);

    if (isUUID) {
        const res = await dbFetch(`/products?id=eq.${p.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
        return res?.[0] ? (snakeToCamel(res[0]) as unknown as Product) : null;
    } else {
        delete payload['id'];
        const res = await dbFetch('/products', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return res?.[0] ? (snakeToCamel(res[0]) as unknown as Product) : null;
    }
}
export async function deleteProduct(id: string) {
    return dbFetch(`/products?id=eq.${id}`, { method: 'DELETE' });
}

// ── Next Internal Barcode RPC ──
export async function getNextInternalBarcode(): Promise<string> {
    try {
        const res = await dbFetch('/rpc/next_internal_barcode', {
            method: 'POST'
        });
        if (typeof res === 'string') return res;
        if (Array.isArray(res) && res[0]) {
            return typeof res[0] === 'string' ? res[0] : (res[0].next_internal_barcode || res[0].value || JSON.stringify(res[0]));
        }
        if (res && res.next_internal_barcode) return res.next_internal_barcode;
        return String(res);
    } catch (err) {
        console.warn("Failed to fetch next barcode from RPC, using timestamp fallback:", err);
        return 'STK' + Date.now().toString().slice(-9);
    }
}

// ── Sales ──
export async function getSales(): Promise<Sale[]> {
    const result = await edgeFetch('/sales');
    const raw: Sale[] = result.data || [];
    // Deduplicate by ID — edge function may return duplicates
    const seen = new Set<string>();
    return raw.filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
    });
}
export async function saveSale(s: Sale) {
    if (s.id && s.id.length > 5) {
        const result = await edgeFetch(`/sales/${s.id}`, {
            method: 'PUT', body: JSON.stringify(s),
        });
        return result.data;
    }
    const { id, ...rest } = s;
    const result = await edgeFetch('/sales', {
        method: 'POST', body: JSON.stringify(rest),
    });
    return result.data;
}
export async function deleteSale(id: string) {
    return edgeFetch(`/sales/${id}`, { method: 'DELETE' });
}

// ── Repairs ──
export async function getRepairs(): Promise<RepairRecord[]> {
    const result = await edgeFetch('/repairs');
    return result.data || [];
}
export async function saveRepair(r: RepairRecord) {
    if (r.id && r.id.length > 5) {
        const result = await edgeFetch(`/repairs/${r.id}`, {
            method: 'PUT', body: JSON.stringify(r),
        });
        return result.data;
    }
    const { id, ...rest } = r;
    const result = await edgeFetch('/repairs', {
        method: 'POST', body: JSON.stringify(rest),
    });
    return result.data;
}
export async function deleteRepair(id: string) {
    return edgeFetch(`/repairs/${id}`, { method: 'DELETE' });
}

// ── Phone Sales (Edge Function) ──
export async function getPhoneSales(): Promise<PhoneSale[]> {
    try {
        const result = await edgeFetch('/phone-sales');
        return result.data || [];
    } catch {
        // Endpoint might not exist yet; return empty
        return [];
    }
}
export async function savePhoneSale(ps: PhoneSale) {
    const { id, ...rest } = ps;
    const result = await edgeFetch('/phone-sales', {
        method: 'POST', body: JSON.stringify(rest),
    });
    return result.data;
}
export async function deletePhoneSale(id: string) {
    return edgeFetch(`/phone-sales/${id}`, { method: 'DELETE' });
}

// ── Expenses ──
export async function getExpenses(): Promise<Expense[]> {
    try {
        const result = await edgeFetch('/expenses');
        return result.data || [];
    } catch {
        return [];
    }
}
export async function saveExpense(e: Expense) {
    if (e.id && e.id.length > 5) {
        const result = await edgeFetch(`/expenses/${e.id}`, {
            method: 'PUT', body: JSON.stringify(e),
        });
        return result.data;
    }
    const { id, ...rest } = e;
    const result = await edgeFetch('/expenses', {
        method: 'POST', body: JSON.stringify(rest),
    });
    return result.data;
}
export async function deleteExpense(id: string) {
    return edgeFetch(`/expenses/${id}`, { method: 'DELETE' });
}

// ── Customer Requests ──
export async function getCustomerRequests(): Promise<CustomerRequest[]> {
    try {
        const result = await edgeFetch('/customer-requests');
        return result.data || [];
    } catch {
        return [];
    }
}
export async function saveCustomerRequest(cr: CustomerRequest) {
    if (cr.id && cr.id.length > 5) {
        const result = await edgeFetch(`/customer-requests/${cr.id}`, {
            method: 'PUT', body: JSON.stringify(cr),
        });
        return result.data;
    }
    const { id, ...rest } = cr;
    const result = await edgeFetch('/customer-requests', {
        method: 'POST', body: JSON.stringify(rest),
    });
    return result.data;
}
export async function deleteCustomerRequest(id: string) {
    return edgeFetch(`/customer-requests/${id}`, { method: 'DELETE' });
}

// ══════════════════════════════════════
// PUBLIC API — Supabase REST (Direct)
// ══════════════════════════════════════

// ── Phone Stocks (Supabase) ──
export async function getPhoneStocks(): Promise<PhoneStock[]> {
    const data = await dbFetch('/phone_stocks?select=*&order=created_at.desc');
    return (data || []).map((d: Record<string, unknown>) => snakeToCamel(d) as unknown as PhoneStock);
}
export async function savePhoneStock(ps: Omit<PhoneStock, 'id' | 'createdAt'> & { id?: string }) {
    const payload = camelToSnake(ps as unknown as Record<string, unknown>);
    delete payload['created_at'];
    if (ps.id) {
        const res = await dbFetch(`/phone_stocks?id=eq.${ps.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return res?.[0] ? snakeToCamel(res[0]) : null;
    }
    delete payload['id'];
    const res = await dbFetch('/phone_stocks', { method: 'POST', body: JSON.stringify(payload) });
    return res?.[0] ? snakeToCamel(res[0]) : null;
}
export async function updatePhoneStockStatus(id: string, status: string) {
    return dbFetch(`/phone_stocks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export async function deletePhoneStock(id: string) {
    return dbFetch(`/phone_stocks?id=eq.${id}`, { method: 'DELETE' });
}

// ── Suppliers (Supabase) ──
export async function getSuppliers(): Promise<Supplier[]> {
    const data = await dbFetch('/suppliers?select=*&order=created_at.desc');
    return (data || []).map((d: Record<string, unknown>) => snakeToCamel(d) as unknown as Supplier);
}
export async function saveSupplier(s: Partial<Supplier>) {
    const payload = camelToSnake(s as unknown as Record<string, unknown>);
    delete payload['created_at'];
    if (s.id) {
        const res = await dbFetch(`/suppliers?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return res?.[0] ? snakeToCamel(res[0]) : null;
    }
    delete payload['id'];
    const res = await dbFetch('/suppliers', { method: 'POST', body: JSON.stringify(payload) });
    return res?.[0] ? snakeToCamel(res[0]) : null;
}
export async function updateSupplierBalance(supplierId: string, addAmount: number) {
    // Use edge function to bypass RLS
    return edgeFetch('/supplier-balance', {
        method: 'POST',
        body: JSON.stringify({ supplier_id: supplierId, add_amount: addAmount }),
    });
}

// ── Purchases (Supabase) ──
export async function getPurchases(): Promise<Purchase[]> {
    const data = await dbFetch('/purchases?select=*,supplier:suppliers(*),items:purchase_items(*)&order=created_at.desc');
    return (data || []).map((d: Record<string, unknown>) => {
        const mapped = snakeToCamel(d) as unknown as Purchase;
        if (d.supplier) mapped.supplier = snakeToCamel(d.supplier as Record<string, unknown>) as unknown as Supplier;
        if (d.items && Array.isArray(d.items)) {
            mapped.items = (d.items as Record<string, unknown>[]).map(i => snakeToCamel(i) as unknown as PurchaseItem);
        }
        return mapped;
    });
}
export async function savePurchase(p: Partial<Purchase>) {
    const payload = camelToSnake(p as unknown as Record<string, unknown>);
    delete payload['created_at'];
    delete payload['supplier'];
    delete payload['items'];
    if (p.id) {
        const res = await dbFetch(`/purchases?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return res?.[0] ? snakeToCamel(res[0]) : null;
    }
    delete payload['id'];
    const res = await dbFetch('/purchases', { method: 'POST', body: JSON.stringify(payload) });
    return res?.[0] ? snakeToCamel(res[0]) : null;
}
export async function savePurchaseItems(items: Omit<PurchaseItem, 'id'>[]) {
    const payload = items.map(i => {
        const mapped = camelToSnake(i as unknown as Record<string, unknown>);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (mapped.product_id && !uuidRegex.test(String(mapped.product_id))) {
            delete mapped.product_id; // Edge function IDs are not UUIDs, avoid 22P02 DB error
        }
        return mapped;
    });
    return dbFetch('/purchase_items', { method: 'POST', body: JSON.stringify(payload) });
}
export async function deletePurchase(id: string) {
    return dbFetch(`/purchases?id=eq.${id}`, { method: 'DELETE' });
}

// ── Cari Hareketler (Supabase) ──
export async function getCariHareketler(supplierId: string): Promise<CariHareket[]> {
    const data = await dbFetch(`/cari_hareketler?supplier_id=eq.${supplierId}&order=islem_tarihi.desc`);
    return (data || []).map((d: Record<string, unknown>) => snakeToCamel(d) as unknown as CariHareket);
}
export async function saveCariHareket(h: Partial<CariHareket>) {
    const payload = camelToSnake(h as unknown as Record<string, unknown>);
    delete payload['created_at'];
    delete payload['id'];
    // Use edge function to bypass RLS
    const result = await edgeFetch('/cari-hareket', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    return result;
}

// ── Payments (Supabase) ──
export async function savePayment(p: Partial<Payment>) {
    const payload = camelToSnake(p as unknown as Record<string, unknown>);
    delete payload['created_at'];
    delete payload['id'];
    return dbFetch('/payments', { method: 'POST', body: JSON.stringify(payload) });
}

// ── Update product stock in Supabase products table ──
export async function updateProductStockDB(productId: string, stock: number, purchasePrice?: number) {
    const body: Record<string, unknown> = { stock };
    if (purchasePrice !== undefined) body.purchase_price = purchasePrice;
    return dbFetch(`/products?id=eq.${productId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

// ── Customers (Supabase) ──
export async function getCustomers(): Promise<Customer[]> {
    const data = await dbFetch('/customers?select=*&order=created_at.desc');
    return (data || []).map((d: Record<string, unknown>) => snakeToCamel(d) as unknown as Customer);
}
export async function saveCustomer(c: Partial<Customer>) {
    const payload = camelToSnake(c as unknown as Record<string, unknown>);
    delete payload['created_at'];
    if (c.id) {
        const res = await dbFetch(`/customers?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return res?.[0] ? snakeToCamel(res[0]) : null;
    }
    delete payload['id'];
    const res = await dbFetch('/customers', { method: 'POST', body: JSON.stringify(payload) });
    return res?.[0] ? snakeToCamel(res[0]) : null;
}
export async function deleteCustomer(id: string) {
    return dbFetch(`/customers?id=eq.${id}`, { method: 'DELETE' });
}

// ── Reminder API ──────────────────────────────────────────────────
import type { Reminder } from '../pages/RemindersPage';

function reminderFromDb(row: Record<string, unknown>): Reminder {
    return {
        id: row.id as string,
        title: row.title as string,
        description: (row.description as string) || '',
        remindAt: row.remind_at as string,
        repeatType: (row.repeat_type as Reminder['repeatType']) || 'none',
        phoneNumber: (row.phone_number as string) || '',
        isSent: (row.is_sent as boolean) || false,
        isCompleted: (row.is_completed as boolean) || false,
        priority: (row.priority as Reminder['priority']) || 'medium',
        category: (row.category as string) || 'genel',
        createdAt: row.created_at as string,
    };
}

function reminderToDb(r: Partial<Reminder>): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    if (r.title !== undefined) obj.title = r.title;
    if (r.description !== undefined) obj.description = r.description;
    if (r.remindAt !== undefined) obj.remind_at = new Date(r.remindAt).toISOString();
    if (r.repeatType !== undefined) obj.repeat_type = r.repeatType;
    if (r.phoneNumber !== undefined) obj.phone_number = r.phoneNumber;
    if (r.isSent !== undefined) obj.is_sent = r.isSent;
    if (r.isCompleted !== undefined) obj.is_completed = r.isCompleted;
    if (r.priority !== undefined) obj.priority = r.priority;
    if (r.category !== undefined) obj.category = r.category;
    return obj;
}

export async function getReminders(): Promise<Reminder[]> {
    const data = await dbFetch('/reminders?order=remind_at.asc');
    return (data || []).map(reminderFromDb);
}

export async function createReminder(r: Partial<Reminder>): Promise<Reminder> {
    const data = await dbFetch('/reminders', {
        method: 'POST',
        body: JSON.stringify(reminderToDb(r)),
    });
    return reminderFromDb(Array.isArray(data) ? data[0] : data);
}

export async function updateReminder(id: string, r: Partial<Reminder>): Promise<Reminder> {
    const data = await dbFetch(`/reminders?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(reminderToDb(r)),
    });
    return reminderFromDb(Array.isArray(data) ? data[0] : data);
}

export async function deleteReminder(id: string): Promise<void> {
    await dbFetch(`/reminders?id=eq.${id}`, { method: 'DELETE' });
}

export async function markReminderSent(id: string): Promise<void> {
    await dbFetch(`/reminders?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_sent: true }),
    });
}

// ══════════════════════════════════════
// MEGA FEATURES — New API Functions
// ══════════════════════════════════════

// ── Warranty Records ──
export async function getWarrantyRecords(): Promise<WarrantyRecord[]> {
    const data = await dbFetch('/warranty_records?order=warranty_end_date.asc');
    return (data || []).map(withDaysRemaining);
}

function withDaysRemaining(row: Record<string, unknown>): WarrantyRecord {
    const mapped = snakeToCamel(row) as unknown as WarrantyRecord;
    return {
        ...mapped,
        daysRemaining: Math.ceil((new Date(mapped.warrantyEndDate).getTime() - Date.now()) / 86400000),
    };
}

export async function saveWarrantyRecord(w: Partial<WarrantyRecord>): Promise<WarrantyRecord | null> {
    const payload = camelToSnake(w as Record<string, unknown>);
    delete payload['created_at'];
    delete payload['days_remaining'];
    if (w.id) {
        const res = await dbFetch(`/warranty_records?id=eq.${w.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return res?.[0] ? withDaysRemaining(res[0] as Record<string, unknown>) : null;
    }
    delete payload['id'];
    const res = await dbFetch('/warranty_records', { method: 'POST', body: JSON.stringify(payload) });
    return res?.[0] ? withDaysRemaining(res[0] as Record<string, unknown>) : null;
}

export async function deleteWarrantyRecord(id: string) {
    return dbFetch(`/warranty_records?id=eq.${id}`, { method: 'DELETE' });
}

// Garanti kaydını bağlı olduğu tamir/telefon kaydına göre bul (mükerrer kayıt önlemi)
export async function getWarrantyForItem(itemType: string, itemId: string): Promise<WarrantyRecord | null> {
    const data = await dbFetch(`/warranty_records?item_type=eq.${itemType}&item_id=eq.${encodeURIComponent(itemId)}&limit=1`);
    return data?.[0] ? withDaysRemaining(data[0]) : null;
}

// ── Technicians ──
export async function getTechnicians(): Promise<Technician[]> {
    const data = await dbFetch('/technicians?is_active=eq.true&order=name.asc');
    return (data || []).map((d: Record<string, unknown>) => snakeToCamel(d) as unknown as Technician);
}

export async function saveTechnician(t: Partial<Technician>) {
    const payload = camelToSnake(t as Record<string, unknown>);
    delete payload['created_at'];
    if (t.id) {
        const res = await dbFetch(`/technicians?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return res?.[0] ? snakeToCamel(res[0] as Record<string, unknown>) : null;
    }
    delete payload['id'];
    const res = await dbFetch('/technicians', { method: 'POST', body: JSON.stringify(payload) });
    return res?.[0] ? snakeToCamel(res[0] as Record<string, unknown>) : null;
}

// ── Repair Parts ──
export async function getRepairParts() {
    const data = await dbFetch('/repair_parts?is_active=eq.true&order=part_name.asc');
    return (data || []).map((d: Record<string, unknown>) => snakeToCamel(d));
}

export async function saveRepairPart(p: Record<string, unknown>) {
    const payload = camelToSnake(p);
    delete payload['created_at'];
    if (p.id) {
        const res = await dbFetch(`/repair_parts?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return res?.[0] ? snakeToCamel(res[0] as Record<string, unknown>) : null;
    }
    delete payload['id'];
    const res = await dbFetch('/repair_parts', { method: 'POST', body: JSON.stringify(payload) });
    return res?.[0] ? snakeToCamel(res[0] as Record<string, unknown>) : null;
}

export async function getRepairPartUsage(repairId: string) {
    const data = await dbFetch(`/repair_part_usage?repair_id=eq.${repairId}&select=*,part:repair_parts(*)`);
    return (data || []).map((d: Record<string, unknown>) => ({
        ...snakeToCamel(d),
        part: d.part ? snakeToCamel(d.part as Record<string, unknown>) : null,
    }));
}

export async function addPartToRepair(usage: Record<string, unknown>) {
    const res = await dbFetch('/repair_part_usage', { method: 'POST', body: JSON.stringify(camelToSnake(usage)) });
    return res?.[0] ? snakeToCamel(res[0] as Record<string, unknown>) : null;
}

// ── Repair Photos ──
export async function getRepairPhotos(repairId: string) {
    const data = await dbFetch(`/repair_photos?repair_id=eq.${repairId}&order=created_at.asc`);
    return (data || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        url: d.url as string,
        uploadedAt: d.created_at as string,
        type: d.photo_type as 'before' | 'after',
        note: (d.note as string) || '',
    }));
}

export async function saveRepairPhoto(repairId: string, photo: { id: string; url: string; type: string; note?: string }) {
    return dbFetch('/repair_photos', {
        method: 'POST',
        body: JSON.stringify({
            id: photo.id,
            repair_id: repairId,
            url: photo.url,
            photo_type: photo.type,
            note: photo.note || '',
        }),
    });
}

export async function deleteRepairPhoto(photoId: string) {
    return dbFetch(`/repair_photos?id=eq.${photoId}`, { method: 'DELETE' });
}

// ── Appointments ──
export async function getAppointments(startDate: string, endDate: string): Promise<RepairAppointment[]> {
    const data = await dbFetch(
        `/repair_appointments?appointment_date=gte.${startDate}&appointment_date=lte.${endDate}&order=appointment_date.asc,appointment_time.asc`
    );
    return (data || []).map((d: Record<string, unknown>) => snakeToCamel(d) as unknown as RepairAppointment);
}

export async function saveAppointment(apt: Record<string, unknown>) {
    const payload = camelToSnake(apt);
    delete payload['created_at'];
    if (apt.id) {
        const res = await dbFetch(`/repair_appointments?id=eq.${apt.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return res?.[0] ? snakeToCamel(res[0] as Record<string, unknown>) : null;
    }
    delete payload['id'];
    const res = await dbFetch('/repair_appointments', { method: 'POST', body: JSON.stringify(payload) });
    return res?.[0] ? snakeToCamel(res[0] as Record<string, unknown>) : null;
}

export async function deleteAppointment(id: string) {
    await dbFetch(`/repair_appointments?id=eq.${id}`, { method: 'DELETE' });
}

// ── Backup ──
// ── Backup ──
export async function saveBackupToSupabase(backupData: Record<string, unknown[]>, fileName: string) {
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/backups/${fileName}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'x-upsert': 'true',
        },
        body: file,
    });
    if (!res.ok) throw new Error('Yedek Storage\'a yüklenemedi');
    return { success: true };
}

export async function getBackupsList() {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/backups`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix: '', limit: 100, sortBy: { column: 'created_at', order: 'desc' } }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.filter((f: any) => f.name !== '.emptyFolderPlaceholder');
}

export async function deleteBackupFromSupabase(fileName: string) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/backups`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: [fileName] }),
    });
}

export async function downloadBackupFromSupabase(fileName: string) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/backups/${fileName}`, {
        headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
        }
    });
    if (!res.ok) throw new Error('Yedek indirilemedi');
    const blob = await res.blob();
    return new File([blob], fileName, { type: 'application/json' });
}

export async function triggerManualBackup(uploadToCloud: boolean = true) {
    const tables = ['products', 'categories', 'sales', 'repairs', 'phone_stocks',
        'phone_sales', 'expenses', 'customer_requests', 'suppliers', 'purchases',
        'customers', 'reminders'];
    const backup: Record<string, unknown[]> = {};
    const rowCounts: Record<string, number> = {};
    for (const table of tables) {
        try {
            const data = await dbFetch(`/${table}?order=created_at.desc&limit=10000`);
            backup[table] = data || [];
            rowCounts[table] = (data || []).length;
        } catch { backup[table] = []; rowCounts[table] = 0; }
    }

    const fileName = `stoktakip_backup_${new Date().toISOString().split('T')[0]}_${Math.random().toString(36).slice(2, 6)}.json`;

    if (uploadToCloud) {
        await saveBackupToSupabase(backup, fileName);
    } else {
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    }

    return { success: true, rowCounts, fileName };
}

export async function restoreFromBackup(file: File) {
    const text = await file.text();
    const backup = JSON.parse(text);
    // Simple import: insert rows one by one (upsert)
    for (const [table, rows] of Object.entries(backup)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
            try {
                await dbFetch(`/${table}`, {
                    method: 'POST',
                    headers: { 'Prefer': 'resolution=merge-duplicates' },
                    body: JSON.stringify(row),
                });
            } catch { /* skip duplicate */ }
        }
    }
    return { success: true };
}

// ── AI Forecast ──
export async function getAIForecast() {
    // Fetch sales via Edge Function (same as getSales) to avoid RLS issues
    let salesRaw: any[] = [];
    try {
        const result = await edgeFetch('/sales');
        salesRaw = result.data || [];
    } catch {
        salesRaw = [];
    }

    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

        const salesData = salesRaw.slice(0, 50).map((s: any) => ({
            date: s.date || s.created_at,
            totalPrice: s.totalPrice ?? s.total_price ?? 0,
            productName: s.items?.[0]?.productName || s.product_name || 'Ürün',
            quantity: s.items?.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0) || s.quantity || 1,
        }));

        const safeSalesData = salesData.length > 0
            ? salesData
            : [{ date: new Date().toISOString(), totalPrice: 0, productName: "Veri Yok", quantity: 0 }];

        const prompt = `Aşağıdaki son satış verilerini analiz et ve bir JSON formatında satış tahmini döndür.
Veriler: ${JSON.stringify(safeSalesData)}

JSON formatı tam olarak şu şekilde olmalıdır ve SADECE JSON döndür:
{
  "nextWeekForecast": Yedi günlük tahmini satış tutarı (number),
  "nextMonthForecast": Otuz günlük tahmini satış tutarı (number),
  "trend": "artış", "düşüş" veya "stabil",
  "trendPercent": Yüzdelik değişim beklentisi (number),
  "recommendations": ["öneri 1", "öneri 2", "öneri 3"],
  "riskFactors": ["risk 1", "risk 2"]
}`;

        if (apiKey) {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            if (response.ok) {
                const result = await response.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    return {
                        success: true,
                        forecast: JSON.parse(text),
                        dataPoints: salesRaw.length,
                    };
                }
            }
        }

        throw new Error("Gemini API yanıt vermedi");

    } catch (error) {
        console.error("AI Forecast Error:", error);
        const totalRevenue = salesRaw.reduce((s: number, sale: any) => s + (Number(sale.totalPrice ?? sale.total_price) || 0), 0);
        const avgDaily = totalRevenue / Math.max(salesRaw.length, 1);
        return {
            success: true,
            forecast: {
                nextWeekForecast: Math.round(avgDaily * 7),
                nextMonthForecast: Math.round(avgDaily * 30),
                trend: totalRevenue > 0 ? 'stabil' : 'stabil',
                trendPercent: 0,
                recommendations: [
                    'AI tahmin servisine ulaşılamadı. Yerel veriler kullanıldı.',
                    'En çok satan ürünlerin stok seviyelerini kontrol edin',
                    'Düşük stoklu ürünleri yeniden sipariş edin',
                ],
                riskFactors: ['Mevsimsel dalgalanmalara dikkat edin'],
            },
            dataPoints: salesRaw.length,
        };
    }
}

