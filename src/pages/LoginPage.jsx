import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Truck, Mail, Lock, ShieldCheck, ArrowRight } from 'lucide-react';
import logoFour from '../assets/logo-four.png';

const LoginPage = () => {
  const { login, signup, loginLocal } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password);
      }
      navigate('/');
    } catch (error) {
      console.error('Errore autenticazione:', error);
      setError(
        isLogin
          ? 'Accesso online fallito. Puoi comunque entrare subito usando la Modalità Locale sotto.'
          : 'Errore durante la registrazione. Email già in uso?'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLocalAccess = () => {
    loginLocal('Manager');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        {/* Brand FOUR */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl mb-3 shadow-xl border border-slate-700">
            <img src={logoFour} alt="FOUR Sustainable Logistics" className="h-14 w-auto object-contain" onError={(e) => { e.currentTarget.src = './logo-four.png'; }} />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">FOUR Sustainable Logistics</h1>
          <p className="text-cyan-200/90 text-sm">Controllo Costi, Flotta, Budget & Cash Flow Forecast</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-emerald-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {isLogin ? 'Accedi al Gestionale' : 'Crea Account'}
            </h2>
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
              Versione Locale 2.0
            </span>
          </div>

          {error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          {/* Quick Local Access Button (1-Click) */}
          <div className="mb-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200/70">
            <div className="flex items-start">
              <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5 mr-2.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-900 mb-1">Sviluppo & Operatività Locale</p>
                <p className="text-xs text-emerald-700 mb-3">
                  Tutti i dati del file Excel, flotta e commesse sono pre-caricati e funzionanti offline al 100%.
                </p>
                <button
                  type="button"
                  onClick={handleLocalAccess}
                  className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition"
                >
                  <span>Entra Subito in Locale</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <span className="relative px-3 bg-white text-xs text-gray-500 uppercase tracking-wider">
              oppure accedi online
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  placeholder="operativo@four-trasporti.it"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 rounded-lg transition text-sm disabled:opacity-50"
            >
              {loading ? 'Accesso in corso...' : isLogin ? 'Accedi con Firebase' : 'Registrati'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-xs text-emerald-700 hover:underline"
            >
              {isLogin ? 'Non hai un account online? Registrati' : 'Hai già un account? Accedi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
