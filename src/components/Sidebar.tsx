interface SidebarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    onLogout: () => void;
    isOpen?: boolean;
    onClose?: () => void;
}

const menuItems = [
    { id: 'sales', label: 'Satış & Raporlar', icon: 'dashboard' },
    { id: 'products', label: 'Ürünler', icon: 'inventory_2' },
    { id: 'repairs', label: 'Tamir Kayıtları', icon: 'build' },
    { id: 'phoneSales', label: 'Telefon Satışları', icon: 'smartphone' },
    { id: 'customers', label: 'Müşteriler', icon: 'group' },
    { id: 'analytics', label: 'Analizler', icon: 'bar_chart' },
    { id: 'requests', label: 'İstek & Siparişler', icon: 'list_alt' },
    { id: 'calculator', label: 'Hesap Makinası', icon: 'calculate' },
    { id: 'purchases', label: 'Alışlar', icon: 'shopping_bag' },
    { id: 'expenses', label: 'Giderler', icon: 'trending_down' },
    { id: 'suppliers', label: 'Tedarikçiler', icon: 'store' },
];

export default function Sidebar({ activeView, onViewChange, onLogout, isOpen, onClose }: SidebarProps) {
    return (
        <>
            {/* Mobile Menu Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-in"
                    onClick={onClose}
                />
            )}

            <aside className={`fixed md:relative z-50 w-64 flex-shrink-0 border-r border-slate-800 bg-surface-dark flex flex-col justify-between h-screen transition-transform duration-300 ease-in-out md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                {/* Logo */}
                <div className="p-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/20 p-2 rounded-lg">
                            <span className="material-symbols-outlined text-primary text-3xl">inventory_2</span>
                        </div>
                        <div>
                            <h1 className="text-white text-lg font-bold leading-tight">StokTakip Pro</h1>
                            <p className="text-slate-400 text-xs">Yönetici Paneli</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-thin">
                    <p className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-4">Menü</p>
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all relative ${activeView === item.id
                                ? 'bg-primary/10 text-primary'
                                : 'text-slate-300 hover:bg-surface-hover group'
                                }`}
                        >
                            {activeView === item.id && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary rounded-r-full"></div>
                            )}
                            <span className={`material-symbols-outlined ${activeView === item.id ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>
                                {item.icon}
                            </span>
                            <span className={`text-sm ${activeView === item.id ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                        </button>
                    ))}
                </nav>

                {/* User section */}
                <div className="p-4 border-t border-slate-800">
                    <div
                        onClick={onLogout}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors"
                    >
                        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary">person</span>
                        </div>
                        <div className="flex-1">
                            <span className="text-sm font-semibold text-white block">Admin</span>
                            <span className="text-xs text-slate-400">technocep</span>
                        </div>
                        <span className="material-symbols-outlined text-slate-400 hover:text-red-400 transition-colors">logout</span>
                    </div>
                </div>
            </aside>
        </>
    );
}
