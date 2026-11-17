import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Calculator, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Errore logout:', error);
    }
  };

  return (
    <nav className="bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3">
            <Calculator className="w-8 h-8" />
            <div className="flex flex-col">
              <span className="text-xl font-bold">FOUR</span>
              <span className="text-xs opacity-90">Fleet Cost Calculator</span>
            </div>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-6">
            {currentUser && (
              <>
                <Link to="/" className="hover:text-primary-100 transition">
                  Simulazione
                </Link>
                <Link to="/vehicles" className="hover:text-primary-100 transition">
                  Mezzi
                </Link>
                <Link to="/settings" className="hover:text-primary-100 transition">
                  Impostazioni
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1 bg-white text-primary-600 px-4 py-2 rounded-lg hover:bg-primary-50 transition"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Esci</span>
                </button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && currentUser && (
          <div className="md:hidden pb-4 space-y-2">
            <Link
              to="/"
              onClick={() => setIsMenuOpen(false)}
              className="block py-2 hover:text-primary-100 transition"
            >
              Simulazione
            </Link>
            <Link
              to="/vehicles"
              onClick={() => setIsMenuOpen(false)}
              className="block py-2 hover:text-primary-100 transition"
            >
              Mezzi
            </Link>
            <Link
              to="/settings"
              onClick={() => setIsMenuOpen(false)}
              className="block py-2 hover:text-primary-100 transition"
            >
              Impostazioni
            </Link>
            <button
              onClick={() => {
                handleLogout();
                setIsMenuOpen(false);
              }}
              className="w-full text-left py-2 hover:text-primary-100 transition"
            >
              Esci
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
