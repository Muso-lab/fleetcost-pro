import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Truck,
  Briefcase,
  TrendingUp,
  Calculator,
  Settings,
  Menu,
  X,
  Download,
  LogOut,
  ShieldCheck
} from 'lucide-react';
import { useState } from 'react';
import storageService from '../services/storageService';
import logoFour from '../assets/logo-four.png';

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    if (confirm('Confermi di voler uscire e proteggere la sessione aziendale?')) {
      await logout();
      navigate('/login');
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
    { to: '/fleet', label: 'Flotta Mezzi', icon: Truck },
    { to: '/projects', label: 'Commesse & Budget', icon: Briefcase },
    { to: '/cashflow', label: 'Cash Flow & Forecast', icon: TrendingUp },
    { to: '/simulation', label: 'Simulatore Preventivi', icon: Calculator, isSpecial: true },
    { to: '/settings', label: 'Impostazioni', icon: Settings }
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="bg-[#0b2440] border-b border-[#164e87]/60 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo Brand Ufficiale FOUR - Pulito e senza scritte duplicate */}
          <Link to="/" className="flex items-center group py-1" title="FOUR Sustainable Logistics • Home">
            <div className="bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-200/90 group-hover:border-cyan-400 transition flex items-center justify-center">
              <img
                src={logoFour}
                alt="FOUR Sustainable Logistics"
                className="h-8 md:h-9 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.src = './logo-four.png';
                }}
              />
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center space-x-1 lg:space-x-1.5">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
                    active
                      ? 'bg-[#164e87] text-white shadow-md shadow-blue-950/40 border border-cyan-400/50'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-cyan-300' : 'text-slate-300'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Action buttons on desktop */}
          <div className="hidden md:flex items-center space-x-2">
            <button
              onClick={handleExportBackup}
              title="Esporta Backup di Sicurezza dei Dati (JSON)"
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl transition flex items-center space-x-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-cyan-300" />
              <span>Backup</span>
            </button>

            {currentUser && (
              <div className="flex items-center space-x-2 pl-2 border-l border-white/15">
                <div className="hidden xl:flex items-center space-x-2 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-xl">
                  <div className="w-6 h-6 rounded-lg bg-[#164e87] text-white flex items-center justify-center font-bold text-[11px] shadow-sm">
                    4
                  </div>
                  <div className="leading-tight text-right">
                    <span className="text-[11px] font-bold text-white block">
                      Amministrazione
                    </span>
                    <span className="text-[9px] text-emerald-300 font-semibold flex items-center justify-end gap-0.5">
                      <ShieldCheck className="w-2.5 h-2.5 inline text-emerald-400" /> Riservato
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Esci dalla sessione sicura (Logout)"
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:text-rose-200 hover:bg-rose-950/50 border border-white/15 hover:border-rose-700/60 rounded-xl transition flex items-center space-x-1"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-300 hover:text-rose-300" />
                  <span>Esci</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Menu"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMenuOpen && (
        <div className="md:hidden bg-[#081b30] border-b border-slate-800 px-4 pt-2 pb-4 space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setIsMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-bold ${
                  active ? 'bg-[#164e87] text-white border border-cyan-500/40' : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <Icon className="w-5 h-5 text-cyan-400" />
                <span>{link.label}</span>
              </Link>
            );
          })}
          <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
            <button
              onClick={() => {
                handleExportBackup();
                setIsMenuOpen(false);
              }}
              className="text-cyan-400 hover:underline flex items-center space-x-1 font-semibold"
            >
              <Download className="w-4 h-4" />
              <span>Backup Dati</span>
            </button>
            {currentUser && (
              <button
                onClick={() => {
                  handleLogout();
                  setIsMenuOpen(false);
                }}
                className="text-rose-400 hover:underline flex items-center space-x-1 font-bold"
              >
                <LogOut className="w-4 h-4" />
                <span>Esci (Logout)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
