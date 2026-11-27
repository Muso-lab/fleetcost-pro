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
  LogOut,
  ShieldCheck,
  Cloud,
  RefreshCw
} from 'lucide-react';
import { useState, useEffect } from 'react';
import storageService from '../services/storageService';
import logoFour from '../assets/logo-four.png';

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState(() => storageService.getCloudStatus());

  useEffect(() => {
    const unsub = storageService.subscribe((event) => {
      if (event.type === 'status') {
        setCloudStatus(event.cloudStatus);
      }
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    if (confirm('Confermi di voler uscire e proteggere la sessione aziendale?')) {
      await logout();
      setIsMenuOpen(false);
      navigate('/login');
    }
  };

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/fleet', label: 'Flotta', icon: Truck },
    { to: '/projects', label: 'Commesse', icon: Briefcase },
    { to: '/cashflow', label: 'Cash Flow', icon: TrendingUp },
    { to: '/simulation', label: 'Simulatore', icon: Calculator },
    { to: '/settings', label: 'Impostazioni', icon: Settings }
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isSyncBusy = cloudStatus.state === 'syncing' || cloudStatus.state === 'connecting';
  const cloudBadgeLabel =
    cloudStatus.state === 'synced'
      ? 'Cloud Live'
      : isSyncBusy
        ? 'Sync Cloud...'
        : cloudStatus.state === 'error'
          ? 'Errore Sync'
          : 'Locale';

  const cloudBadgeClass =
    cloudStatus.state === 'synced'
      ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-400/40'
      : isSyncBusy
        ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40 cursor-wait'
        : cloudStatus.state === 'error'
          ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-rose-400/50'
          : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/40';

  const cloudTitle =
    cloudStatus.state === 'synced'
      ? `Sincronizzazione Cloud in tempo reale attiva${cloudStatus.lastSyncedAt ? ` (Ultimo sync: ${new Date(cloudStatus.lastSyncedAt).toLocaleTimeString('it-IT')})` : ''}. Clicca per forzare allineamento.`
      : cloudStatus.errorMessage || 'Stato sincronizzazione Cloud Firestore';

  return (
    <nav className="bg-[#0b2440] border-b border-[#164e87]/60 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-2">
          {/* Logo Brand Ufficiale FOUR - Pulito e senza scritte duplicate */}
          <Link to="/" className="flex items-center group py-1 flex-shrink-0 whitespace-nowrap" title="FOUR Sustainable Logistics • Home">
            <div className="bg-white px-2.5 py-1.5 rounded-xl shadow-sm border border-slate-200/90 group-hover:border-cyan-400 transition flex items-center justify-center">
              <img
                src={logoFour}
                alt="FOUR Sustainable Logistics"
                className="h-7 lg:h-8 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = './logo-four.png';
                }}
              />
            </div>
          </Link>

          {/* Desktop Navigation Links (da lg: in su per evitare overflow su tablet) */}
          <div className="hidden lg:flex items-center space-x-1 flex-nowrap">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex-shrink-0 ${
                    active
                      ? 'bg-[#164e87] text-white shadow-md shadow-blue-950/40 border border-cyan-400/50'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-cyan-300' : 'text-slate-300'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Action buttons on desktop */}
          <div className="hidden lg:flex items-center space-x-1.5 flex-shrink-0">
            {/* Indicatore Cloud Real-Time Sync multi-PC */}
            <button
              type="button"
              disabled={isSyncBusy}
              onClick={() => storageService.forceSyncFromCloud()}
              title={cloudTitle}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-xl border transition flex items-center space-x-1.5 shadow-sm whitespace-nowrap flex-shrink-0 ${cloudBadgeClass}`}
            >
              {isSyncBusy ? (
                <RefreshCw className="w-3.5 h-3.5 text-cyan-300 animate-spin flex-shrink-0" />
              ) : (
                <Cloud className={`w-3.5 h-3.5 flex-shrink-0 ${
                  cloudStatus.state === 'synced' ? 'text-emerald-400' : cloudStatus.state === 'error' ? 'text-rose-400' : 'text-amber-400'
                }`} />
              )}
              <span>{cloudBadgeLabel}</span>
            </button>

            {currentUser && (
              <div className="flex items-center space-x-1.5 pl-1.5 border-l border-white/15 flex-shrink-0">
                <div className="hidden xl:flex items-center space-x-1.5 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl whitespace-nowrap flex-shrink-0">
                  <div className="w-5 h-5 rounded-md bg-[#164e87] text-white flex items-center justify-center font-bold text-[10px] shadow-sm">
                    4
                  </div>
                  <div className="leading-tight text-right">
                    <span className="text-[11px] font-bold text-white block">
                      {currentUser.displayName || 'Amministrazione'}
                    </span>
                    <span className="text-[9px] text-emerald-300 font-semibold flex items-center justify-end gap-0.5">
                      <ShieldCheck className="w-2.5 h-2.5 inline text-emerald-400" /> {currentUser.role || 'Riservato'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Esci dalla sessione sicura (Logout)"
                  className="group px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:text-rose-200 hover:bg-rose-950/50 border border-white/15 hover:border-rose-700/60 rounded-xl transition flex items-center space-x-1 whitespace-nowrap flex-shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-300 group-hover:text-rose-300 flex-shrink-0" />
                  <span>Esci</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile / Tablet hamburger */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
            aria-label="Menu"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav-drawer"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Drawer */}
      {isMenuOpen && (
        <div id="mobile-nav-drawer" className="lg:hidden bg-[#081b30] border-b border-slate-800 px-4 pt-2 pb-4 space-y-2">
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
          <div className="pt-3 border-t border-slate-800 flex flex-wrap justify-between items-center gap-2 text-xs text-slate-400">
            <button
              type="button"
              disabled={isSyncBusy}
              onClick={() => storageService.forceSyncFromCloud()}
              title={cloudTitle}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border flex items-center space-x-1.5 ${cloudBadgeClass}`}
            >
              {isSyncBusy ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5" />
              )}
              <span>{cloudBadgeLabel}</span>
            </button>
            <Link
              to="/settings"
              onClick={() => setIsMenuOpen(false)}
              className="text-cyan-400 hover:underline flex items-center space-x-1 font-semibold"
            >
              <Settings className="w-4 h-4" />
              <span>Backup &amp; Cloud</span>
            </Link>
            {currentUser && (
              <button
                type="button"
                onClick={handleLogout}
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
