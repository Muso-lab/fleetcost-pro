import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Truck,
  Briefcase,
  TrendingUp,
  Calculator,
  Settings,
  LogOut,
  Menu,
  X,
  Leaf,
  RefreshCw,
  Download
} from 'lucide-react';
import { useState } from 'react';
import storageService from '../services/storageService';

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Errore logout:', error);
    }
  };

  const handleResetData = () => {
    if (confirm('Attenzione: Ripristinare tutti i dati originali dal file Excel di FOUR (17 progetti e flotta completa)?')) {
      storageService.resetToDefaults();
      window.location.reload();
    }
  };

  const handleExportBackup = () => {
    const json = storageService.exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FOUR_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/fleet', label: 'Flotta Disponibile', icon: Truck },
    { to: '/projects', label: 'Commesse & Budget', icon: Briefcase },
    { to: '/cashflow', label: 'Cash Flow & Forecast', icon: TrendingUp },
    { to: '/simulation', label: 'Simulatore Tratte', icon: Calculator },
    { to: '/settings', label: 'Impostazioni', icon: Settings }
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="bg-slate-900 border-b border-emerald-900/50 text-white shadow-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="bg-emerald-600/30 border border-emerald-500/40 p-2 rounded-xl group-hover:bg-emerald-600/40 transition">
              <Leaf className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black tracking-wider text-white">FOUR</span>
                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded uppercase">
                  ECO-FLEET
                </span>
              </div>
              <span className="text-[11px] text-slate-400 -mt-0.5 font-medium">Cost & Cash Flow Manager</span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center space-x-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    active
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Action buttons on desktop */}
          <div className="hidden md:flex items-center space-x-2">
            <button
              onClick={handleExportBackup}
              title="Esporta Backup Dati JSON"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={handleResetData}
              title="Ripristina Dati Originali Excel"
              className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-slate-800 mx-1"></div>

            <div className="text-right">
              <p className="text-xs font-medium text-slate-200">
                {currentUser?.displayName || 'Team FOUR'}
              </p>
              <span className="text-[10px] text-emerald-400 font-mono">Locale</span>
            </div>

            <button
              onClick={handleLogout}
              title="Esci"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMenuOpen && (
        <div className="lg:hidden bg-slate-950 border-b border-slate-800 px-4 pt-2 pb-4 space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setIsMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{link.label}</span>
              </Link>
            );
          })}
          <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
            <button
              onClick={() => {
                handleResetData();
                setIsMenuOpen(false);
              }}
              className="text-amber-400 hover:underline"
            >
              Ripristina Dati Excel
            </button>
            <button
              onClick={handleLogout}
              className="text-rose-400 hover:underline"
            >
              Esci
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
