import { useState, useEffect, useCallback } from 'react';
import { ToastProvider } from './components/Toast';
import { PriceVisibilityProvider, usePriceVisibility } from './components/PriceVisibility';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import SalesPage from './pages/SalesPage';
import ProductsPage from './pages/ProductsPage';
import RepairsPage from './pages/RepairsPage';
import PhoneSalesPage from './pages/PhoneSalesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import RequestsPage from './pages/RequestsPage';
import CalculatorPage from './pages/CalculatorPage';
import PurchasesPage from './pages/PurchasesPage';
import ExpensesPage from './pages/ExpensesPage';
import SuppliersPage from './pages/SuppliersPage';
import CustomersPage from './pages/CustomersPage';
import RemindersPage from './pages/RemindersPage';
import type { Category, Product, Sale, RepairRecord, PhoneSale, PhoneStock, Expense, CustomerRequest, Supplier, Purchase, Customer } from './types';
import * as api from './utils/api';

const viewLabels: Record<string, string> = {
  sales: 'Satış & Raporlar', products: 'Ürünler', repairs: 'Tamir Kayıtları',
  phoneSales: 'Telefon Satışları', customers: 'Müşteriler', analytics: 'Analizler', requests: 'İstek & Siparişler',
  calculator: 'Hesap Makinası', purchases: 'Alışlar', expenses: 'Giderler', suppliers: 'Tedarikçiler',
  reminders: 'Hatırlatıcılar',
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('isAuth') === 'true');
  const [activeView, setActiveView] = useState('sales');
  const [loading, setLoading] = useState(false);

  // Data states
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [phoneSales, setPhoneSales] = useState<PhoneSale[]>([]);
  const [phoneStocks, setPhoneStocks] = useState<PhoneStock[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api.getCategories().then(setCategories),
        api.getProducts().then(setProducts),
        api.getSales().then(setSales),
        api.getRepairs().then(setRepairs),
        api.getPhoneSales().then(setPhoneSales),
        api.getPhoneStocks().then(setPhoneStocks),
        api.getExpenses().then(setExpenses),
        api.getCustomerRequests().then(setRequests),
        api.getSuppliers().then(setSuppliers),
        api.getPurchases().then(setPurchases),
        api.getCustomers().then(setCustomers).catch(() => { }),
      ]);
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.warn(`Data load ${i} failed:`, r.reason);
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadAllData();
  }, [isAuthenticated, loadAllData]);

  const handleLogin = () => setIsAuthenticated(true);
  const handleLogout = () => {
    localStorage.removeItem('isAuth');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <ToastProvider>
        <LoginPage onLogin={handleLogin} />
      </ToastProvider>
    );
  }

  const renderView = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-slate-400 text-sm">Veriler yükleniyor...</p>
          </div>
        </div>
      );
    }

    switch (activeView) {
      case 'sales': return <SalesPage sales={sales} repairs={repairs} phoneSales={phoneSales} suppliers={suppliers} products={products} setSales={setSales} onRefresh={loadAllData} customers={customers} setCustomers={setCustomers} />;
      case 'products': return <ProductsPage products={products} categories={categories} setProducts={setProducts} setCategories={setCategories} />;
      case 'repairs': return <RepairsPage repairs={repairs} setRepairs={setRepairs} suppliers={suppliers} customers={customers} setCustomers={setCustomers} />;
      case 'phoneSales': return <PhoneSalesPage phoneStocks={phoneStocks} phoneSales={phoneSales} setPhoneStocks={setPhoneStocks} setPhoneSales={setPhoneSales} customers={customers} setCustomers={setCustomers} />;
      case 'customers': return <CustomersPage repairs={repairs} phoneSales={phoneSales} sales={sales} customers={customers} setCustomers={setCustomers} />;
      case 'analytics': return <AnalyticsPage sales={sales} repairs={repairs} phoneSales={phoneSales} expenses={expenses} />;
      case 'requests': return <RequestsPage requests={requests} setRequests={setRequests} />;
      case 'calculator': return <CalculatorPage />;
      case 'purchases': return <PurchasesPage purchases={purchases} suppliers={suppliers} products={products} setPurchases={setPurchases} onRefresh={loadAllData} />;
      case 'expenses': return <ExpensesPage expenses={expenses} setExpenses={setExpenses} />;
      case 'suppliers': return <SuppliersPage suppliers={suppliers} setSuppliers={setSuppliers} repairs={repairs} />;
      case 'reminders': return <RemindersPage />;
      default: return <SalesPage sales={sales} repairs={repairs} phoneSales={phoneSales} suppliers={suppliers} products={products} setSales={setSales} onRefresh={loadAllData} customers={customers} setCustomers={setCustomers} />;
    }
  };

  return (
    <ToastProvider>
      <PriceVisibilityProvider>
        <AppShell activeView={activeView} onViewChange={setActiveView} onLogout={handleLogout} renderView={renderView} />
      </PriceVisibilityProvider>
    </ToastProvider>
  );
}

function AppShell({ activeView, onViewChange, onLogout, renderView }: { activeView: string; onViewChange: (v: string) => void; onLogout: () => void; renderView: () => React.ReactNode }) {
  const { visible, toggle, currency, setCurrency, usdRate, rateLoading } = usePriceVisibility();

  const [isLight, setIsLight] = useState(() => localStorage.getItem('theme') === 'light');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLight]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeView={activeView}
        onViewChange={(v) => { onViewChange(v); setIsMobileMenuOpen(false); }}
        onLogout={onLogout}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <main className="flex-1 flex flex-col h-screen overflow-hidden overflow-x-hidden">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 bg-surface-dark/50 backdrop-blur-md flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3 text-sm">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-surface-hover hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="hidden sm:inline text-slate-400">StokTakip Pro</span>
            <span className="hidden sm:inline text-slate-600">/</span>
            <span className="font-medium text-white truncate max-w-[150px] sm:max-w-none">{viewLabels[activeView] || activeView}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={() => setIsLight(prev => !prev)}
              title={isLight ? 'Karanlık Mod' : 'Aydınlık Mod'}
              className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-surface-hover hover:text-white transition-all"
            >
              <span className="material-symbols-outlined text-xl">
                {isLight ? 'dark_mode' : 'light_mode'}
              </span>
            </button>
            {/* Currency Toggle */}
            <div className="flex items-center gap-1.5">
              <div className="flex bg-slate-800 rounded-full p-0.5 border border-slate-700">
                <button
                  onClick={() => setCurrency('TRY')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${currency === 'TRY' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                >₺ TL</button>
                <button
                  onClick={() => setCurrency('USD')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${currency === 'USD' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                >$ USD</button>
              </div>
              {usdRate > 0 && (
                <span className="hidden md:inline-block text-xs text-slate-400 bg-slate-800/80 border border-slate-700 rounded-full px-3 py-1.5 whitespace-nowrap">
                  {rateLoading ? '...' : `$1.00 = ₺${usdRate.toFixed(2).replace('.', ',')}`}
                </span>
              )}
            </div>
            <button
              onClick={toggle}
              title={visible ? 'Fiyatları Gizle' : 'Fiyatları Göster'}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${visible
                ? 'text-slate-400 hover:bg-surface-hover hover:text-white'
                : 'text-primary bg-primary/10 ring-1 ring-primary/30'
                }`}
            >
              <span className="material-symbols-outlined text-xl">{visible ? 'visibility' : 'visibility_off'}</span>
            </button>
            <button className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface-hover transition-colors">
              <span className="material-symbols-outlined text-xl">notifications</span>
            </button>
          </div>
        </header>
        {/* Content */}
        {renderView()}
      </main>
    </div>
  );
}
