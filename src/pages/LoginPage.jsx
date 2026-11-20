import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import logoFour from '../assets/logo-four.png';

const LoginPage = () => {
  const { currentUser, login, authConfig } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('amministrazione@four-logistics.it');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Se l'utente è già autenticato, reindirizza subito alla dashboard
  useEffect(() => {
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, rememberMe);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Errore durante l\'accesso. Controlla le credenziali.');
    } finally {
      setLoading(false);
    }
  };

  const handleFillDefaults = () => {
    setEmail(authConfig?.adminEmail || 'amministrazione@four-logistics.it');
    setPassword(authConfig?.password || 'Four2026!');
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#0d233e] to-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Elementi grafici di sfondo */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full relative z-10 space-y-6">
        {/* Brand & Logo Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3.5 bg-white rounded-2xl shadow-2xl border border-slate-700/60 transition hover:scale-105 duration-300">
            <img
              src={logoFour}
              alt="FOUR Sustainable Logistics"
              className="h-12 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.src = './logo-four.png';
              }}
            />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">FOUR Sustainable Logistics</h1>
            <p className="text-xs text-cyan-300/90 font-medium mt-0.5">
              Controllo Costi, Flotta, Budget Commesse &amp; Cash Flow
            </p>
          </div>
        </div>

        {/* Card di Login */}
        <div className="bg-white rounded-3xl shadow-2xl p-7 border border-slate-100 space-y-5">
          {/* Badge Sicurezza Dati */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Accesso Riservato</h2>
                <p className="text-[11px] text-slate-500">Dati finanziari &amp; contratti protetti</p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Sicurezza 2026
            </span>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl text-xs flex items-start space-x-2 animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Campo E-mail */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                E-mail o Utente Aziendale
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#164e87] focus:border-[#164e87] font-medium text-slate-800 transition outline-none"
                  placeholder="amministrazione@four-logistics.it"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Campo Password */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block font-semibold text-slate-700">
                  Password di Accesso
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#164e87] focus:border-[#164e87] font-medium text-slate-800 transition outline-none"
                  placeholder="Inserisci la password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Opzione Resta collegato */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-[#164e87] rounded border-slate-300 focus:ring-[#164e87]"
                />
                <span className="text-slate-600 font-medium text-[11px]">
                  Resta collegato su questo computer
                </span>
              </label>
            </div>

            {/* Tasto Login */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#164e87] hover:bg-[#0f3b75] text-white font-bold rounded-xl shadow-md shadow-blue-950/30 transition flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
            >
              {loading ? (
                <span>Verifica in corso...</span>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-cyan-300" />
                  <span>Accedi in Sicurezza</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Box Credenziali di Primo Accesso */}
          <div className="pt-3 border-t border-slate-100 bg-slate-50/80 -mx-7 -mb-7 p-4 rounded-b-3xl">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                  Credenziali Aziendali di Accesso:
                </span>
                <p className="text-[11px] text-slate-700">
                  Email: <strong className="font-mono text-slate-900">{authConfig?.adminEmail || 'amministrazione@four-logistics.it'}</strong>
                </p>
                <p className="text-[11px] text-slate-700">
                  Password: <strong className="font-mono text-[#164e87]">{authConfig?.password || 'Four2026!'}</strong>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  (La password può essere modificata in qualsiasi momento nella scheda Impostazioni)
                </p>
              </div>

              <button
                type="button"
                onClick={handleFillDefaults}
                className="px-2.5 py-1 text-[11px] font-bold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg transition whitespace-nowrap self-start"
                title="Inserisci automaticamente le credenziali nei campi"
              >
                Compila Rapido
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400">
          FOUR Sustainable Logistics © 2026 • Area Riservata Direzione
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
