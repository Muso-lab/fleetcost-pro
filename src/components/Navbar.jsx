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
    <nav className="bg-slate-900 border-b border-blue-900/40 text-white shadow-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="bg-white px-2 py-1 rounded-xl shadow-sm border border-slate-700/60 group-hover:border-cyan-400/60 transition flex items-center justify-center">
              <img
                src={logoFour}
                alt="FOUR Sustainable Logistics"
                className="h-9 w-auto object-contain max-w-[130px]"
                onError={(e) => {
                  e.currentTarget.src = './logo-four.png';
                }}
              />
            </div>
            <div className="hidden sm:flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="text-lg font-black tracking-wider text-white">FOUR</span>
                <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 text-[10px] font-bold rounded uppercase border border-cyan-500/30">
                  SUSTAINABLE LOGISTICS
                </span>
              </div>
              <span className="text-[11px] text-slate-400 -mt-0.5 font-medium">Cost &amp; Cash Flow Manager</span>
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
                  className={`flex items-center space-x-1.5 px-2.5 lg:px-3 py-2 rounded-lg text-xs font-bold transition ${
                    active
                      ? 'bg-[#164e87] text-white shadow-md shadow-blue-950/50 border border-cyan-500/40'
                      : link.isSpecial
                      ? 'text-cyan-300 hover:text-white hover:bg-slate-800 bg-slate-800/60 border border-cyan-500/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-cyan-300' : link.isSpecial ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{link.label}</span>
                  {link.isSpecial && !active && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block animate-pulse"></span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Action buttons on desktop */}
          <div className="hidden md:flex items-center space-x-2">
            <button
              onClick={handleExportBackup}
              title="Esporta Backup di Sicurezza dei Dati (JSON)"
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition flex items-center space-x-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Backup</span>
            </button>

            {currentUser && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
                <div className="text-right hidden xl:block leading-tight">
                  <span className="text-[11px] font-bold text-slate-200 block truncate max-w-[150px]">
                    {currentUser.email}
                  </span>
                  <span className="text-[9px] text-emerald-400 font-bold flex items-center justify-end gap-1">
                    <ShieldCheck className="w-2.5 h-2.5 inline" /> Protetto
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  title="Esci dalla sessione sicura (Logout)"
                  className="px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 rounded-lg transition flex items-center space-x-1"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
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
        <div className="md:hidden bg-slate-950 border-b border-slate-800 px-4 pt-2 pb-4 space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setIsMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-bold ${
                  active ? 'bg-[#164e87] text-white border border-cyan-500/40' : 'text-slate-300 hover:bg-slate-800'
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
