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

/** Tamir edilen cihaz geri geldiğinde açılan iade veya değişim işlemi. */
export interface RepairReturn {
  id: string;
  type: 'iade' | 'degisim';
  date: string;
  reason: string;
  /** İade edilen tutar. Değişimde 0 olabilir. */
  refundAmount: number;
  /** Değişim yapıldıysa müşteriye verilen cihaz. */
  replacementDevice?: string;
  notes?: string;
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
  /** İade/değişim işlemleri. Edge Function KV store şemasız olduğu için migration gerekmez. */
  returns?: RepairReturn[];
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
  debt: number;
  credit: number;
  createdAt: string;
  // New fields for loyalty & segmentation
  loyaltyPoints?: number;
  loyaltyTier?: 'bronze' | 'silver' | 'gold' | 'platinum';
  totalSpent?: number;
  purchaseCount?: number;
  segment?: CustomerSegment;
  lastPurchaseDate?: string;
  profilePhotoUrl?: string;
  idCardFrontUrl?: string;
  idCardBackUrl?: string;
  idNumber?: string;
}

// ── New Types for Mega Features ──

export type CustomerSegment = 'vip' | 'frequent' | 'regular' | 'new' | 'inactive';
export type WarrantyStatus = 'active' | 'expiring' | 'expired';

export interface BarcodeLabel {
  productId: string;
  productName: string;
  barcode: string;
  price: number;
  quantity: number;
}

export interface BarcodePrintSettings {
  labelWidth: number;
  labelHeight: number;
  labelsPerRow: number;
  showPrice: boolean;
  showProductName: boolean;
}

export interface IMEICheckResult {
  imei: string;
  isValid: boolean;
  isBlacklisted: boolean;
  status: 'VALID' | 'INVALID' | 'BLACKLISTED';
}

export interface WarrantyRecord {
  id: string;
  itemType: 'product' | 'phone' | 'repair';
  itemId: string;
  serialNumber?: string;
  imei?: string;
  purchaseDate: string;
  warrantyStartDate: string;
  warrantyEndDate: string;
  warrantyMonths: number;
  warrantyProvider?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  createdAt: string;
  daysRemaining?: number;
}

export interface RepairPhoto {
  id: string;
  url: string;
  uploadedAt: string;
  note?: string;
  type: 'before' | 'after';
}

export interface Technician {
  id: string;
  name: string;
  phone?: string;
  specialties?: string[];
  isActive: boolean;
  totalRepairs: number;
  averageRating: number;
  createdAt: string;
}

export interface RepairPart {
  id: string;
  partNumber: string;
  partName: string;
  category?: string;
  compatibleDevices?: string[];
  stockQuantity: number;
  minStock: number;
  unitCost: number;
  unitPrice: number;
  supplierId?: string;
  location?: string;
  isActive: boolean;
  createdAt: string;
}

export interface RepairPartUsage {
  id: string;
  repairId: string;
  partId: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  createdAt: string;
  part?: RepairPart;
}

export interface ProfitLossRow {
  transactionDate: string;
  transactionType: 'sale' | 'repair' | 'phone_sale' | 'expense';
  revenue: number;
  profit: number;
  expense: number;
}

export interface ProductProfitability {
  productId: string;
  productName: string;
  totalSold: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
}

export interface ProfitLossReport {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  byProduct: ProductProfitability[];
  byDate: { date: string; revenue: number; profit: number }[];
  bySource: { name: string; value: number }[];
}

export interface ABCItem {
  productId: string;
  productName: string;
  totalRevenue: number;
  percentage: number;
  cumulative: number;
  category: 'A' | 'B' | 'C';
}

export interface ReceiptData {
  storeName: string;
  storePhone?: string;
  date: string;
  receiptNo: string;
  items: { name: string; qty: number; price: number; total: number }[];
  subtotal: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  cashierName?: string;
  note?: string;
}

export type Permission =
  | 'edit_historical_sales'
  | 'delete_sales'
  | 'view_all_reports'
  | 'manage_expenses'
  | 'manage_users'
  | 'backup_restore';

export interface UserPermission {
  id: string;
  userId: string;
  permission: Permission;
  grantedAt: string;
  expiresAt?: string;
}

export interface RepairAppointment {
  id: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  deviceInfo: string;
  issueDescription?: string;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: number;
  technicianId?: string;
  technicianName?: string;
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
  createdAt: string;
}
