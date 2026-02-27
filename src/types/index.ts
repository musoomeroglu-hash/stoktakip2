// ── KV Store Types (camelCase) ──

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  barcode: string;
  stock: number;
  minStock: number;
  purchasePrice: number;
  salePrice: number;
  description: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  salePrice: number;
  purchasePrice: number;
  profit: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  totalPrice: number;
  totalProfit: number;
  date: string;
  paymentMethod: string;
  paymentDetails?: Record<string, number>;
  customerInfo?: { name: string; phone: string };
}

export interface RepairRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  deviceInfo: string;
  imei: string;
  problemDescription: string;
  repairCost: number;
  partsCost: number;
  profit: number;
  status: 'in_progress' | 'completed' | 'delivered' | 'waiting_parts' | 'cancelled';
  paymentMethod?: string;
  paymentDetails?: Record<string, number>;
  prePayment: number;
  technicianNotes: string;
  supplierId?: string;
  supplierName?: string;
  createdAt: string;
  deliveredAt?: string;
}

export interface PhoneSale {
  id: string;
  brand: string;
  model: string;
  imei: string;
  purchasePrice: number;
  salePrice: number;
  profit: number;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  date: string;
  paymentMethod: string;
  paymentDetails?: Record<string, number>;
}

export interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  paymentMethod: string;
  isRecurring: boolean;
  recurrencePeriod?: string;
  status: 'odendi' | 'bekliyor';
  createdAt: string;
}

export interface CustomerRequest {
  id: string;
  customerName: string;
  phoneNumber: string;
  productName: string;
  notes: string;
  priority: 'normal' | 'urgent';
  estimatedBudget: number;
  status: 'pending' | 'found' | 'notified' | 'completed' | 'cancelled';
  createdAt: string;
}

// ── Supabase Types (snake_case in DB, camelCase here after mapping) ──

export interface PhoneStock {
  id: string;
  brand: string;
  model: string;
  imei: string;
  purchasePrice: number;
  salePrice: number;
  notes: string;
  status: 'in_stock' | 'sold';
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  notes: string;
  paymentTerms: string;
  currency: string;
  isActive: boolean;
  totalPurchased: number;
  totalPaid: number;
  balance: number;
  createdAt: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  purchaseDate: string;
  invoiceNumber: string;
  status: 'odenmedi' | 'kismi_odendi' | 'odendi';
  paymentMethod: string;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  remaining: number;
  currency: string;
  exchangeRate: number;
  notes: string;
  createdAt: string;
  supplier?: Supplier;
  items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface CariHareket {
  id: string;
  supplierId: string;
  islemTarihi: string;
  islemTipi: 'alis' | 'odeme' | 'iade' | 'borc_ekleme' | 'alacak_ekleme';
  miktar: number;
  aciklama: string;
  ilgiliId?: string;
  faturaNo?: string;
  bakiyeEtkisi: number;
  createdAt: string;
}

export interface Payment {
  id: string;
  purchaseId: string;
  supplierId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  receiptNumber?: string;
  notes?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
}
