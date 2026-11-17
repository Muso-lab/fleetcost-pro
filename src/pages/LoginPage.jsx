import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Truck, Mail, Lock } from 'lucide-react';

const LoginPage = () => {
  const { login, signup } = useAuth();
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
          ? 'Email o password non corretti'
          : 'Errore durante la registrazione. Email già in uso?'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo e Titolo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-primary-600 p-4 rounded-full">
              <Truck className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">FleetCost Pro</h1>
          <p className="text-gray-600">Simulatore costi operativi flotte</p>
        </div>

        {/* Form Login/Signup */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">
            {isLogin ? 'Accedi' : 'Registrati'}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="tuo@email.com"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 text-white py-3 rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50"
            >
              {loading ? 'Caricamento...' : isLogin ? 'Accedi' : 'Registrati'}
            </button>
          </form>

          {/* Toggle Login/Signup */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              {isLogin ? 'Non hai un account? Registrati' : 'Hai già un account? Accedi'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-sm mt-6">
          © 2025 FleetCost Pro - Gestione costi flotte veicoli
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
