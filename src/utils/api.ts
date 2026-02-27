import type {
    Category, Product, Sale, RepairRecord, PhoneSale, PhoneStock,
    Expense, CustomerRequest, Supplier, Purchase, PurchaseItem, CariHareket, Payment, Customer
} from '../types';

const SUPABASE_URL = 'https://xtjvbkhappiceyrlovkx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0anZia2hhcHBpY2V5cmxvdmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NTUzNTksImV4cCI6MjA4MjIzMTM1OX0.bUSQ4nkoasOVQdtQwGSxtXiLGbyV9Ih8qlf-sGg3LCg';
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
    const result = await edgeFetch('/categories');
    return result.data || [];
}
export async function saveCategory(cat: Category) {
    if (cat.id && cat.id.length > 5) {
        // update
        const result = await edgeFetch(`/categories/${cat.id}`, {
            method: 'PUT', body: JSON.stringify(cat),
        });
        return result.data;
    }
    // create — let server generate ID
    const result = await edgeFetch('/categories', {
        method: 'POST', body: JSON.stringify({ name: cat.name }),
    });
    return result.data;
}
export async function deleteCategory(id: string) {
    return edgeFetch(`/categories/${id}`, { method: 'DELETE' });
}

// ── Products ──
export async function getProducts(): Promise<Product[]> {
    const result = await edgeFetch('/products');
    return result.data || [];
}
export async function saveProduct(p: Product) {
    if (p.id && p.id.length > 5) {
        const result = await edgeFetch(`/products/${p.id}`, {
            method: 'PUT', body: JSON.stringify(p),
        });
        return result.data;
    }
    const { id, ...rest } = p;
    const result = await edgeFetch('/products', {
        method: 'POST', body: JSON.stringify(rest),
    });
    return result.data;
}
export async function deleteProduct(id: string) {
    return edgeFetch(`/products/${id}`, { method: 'DELETE' });
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
    const payload = items.map(i => camelToSnake(i as unknown as Record<string, unknown>));
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
