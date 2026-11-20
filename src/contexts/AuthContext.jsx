import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const DEFAULT_AUTH_CONFIG = {
  adminEmail: 'amministrazione@four-logistics.it',
  password: 'Four2026!',
  role: 'Direzione & Controllo Costi',
  lastUpdated: '2026-01-01'
};

const getStoredAuthConfig = () => {
  try {
    const raw = localStorage.getItem('four_security_auth_config');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Errore lettura configurazione sicurezza:', e);
  }
  return DEFAULT_AUTH_CONFIG;
};

export const AuthProvider = ({ children }) => {
  // Controlla prima la sessione in sessionStorage (scade alla chiusura scheda)
  // o in localStorage (se l'utente ha scelto "Ricordami")
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const sessionUser = sessionStorage.getItem('four_active_session');
      if (sessionUser) return JSON.parse(sessionUser);

      const persistentUser = localStorage.getItem('four_active_session');
      if (persistentUser) return JSON.parse(persistentUser);
    } catch (e) {
      console.error('Errore lettura sessione attiva:', e);
    }
    return null; // NON loggato di default: richiede autenticazione
  });

  const [authConfig, setAuthConfig] = useState(getStoredAuthConfig);

  // Funzione di Login sicuro
  const login = async (email, password, rememberMe = true) => {
    const currentConfig = getStoredAuthConfig();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanConfigEmail = currentConfig.adminEmail.toLowerCase();

    // Accetta l'email aziendale configurata o alias operativi
    const isEmailValid = cleanEmail === cleanConfigEmail ||
      cleanEmail === 'direzione@four-logistics.it' ||
      cleanEmail === 'operativo@four-logistics.it' ||
      cleanEmail === 'admin' ||
      cleanEmail.includes('four');

    if (!isEmailValid) {
      throw new Error('E-mail aziendale non riconosciuta.');
    }

    if (password !== currentConfig.password) {
      throw new Error('Password di accesso non corretta. Verifica maiuscole/minuscole.');
    }

    const authenticatedUser = {
      uid: 'four_auth_' + Date.now(),
      email: cleanEmail.includes('@') ? cleanEmail : currentConfig.adminEmail,
      displayName: 'FOUR ' + (currentConfig.role || 'Amministrazione'),
      role: currentConfig.role || 'Direzione & Controllo Costi',
      loginTime: new Date().toISOString()
    };

    if (rememberMe) {
      localStorage.setItem('four_active_session', JSON.stringify(authenticatedUser));
      sessionStorage.removeItem('four_active_session');
    } else {
      sessionStorage.setItem('four_active_session', JSON.stringify(authenticatedUser));
      localStorage.removeItem('four_active_session');
    }

    setCurrentUser(authenticatedUser);
    return authenticatedUser;
  };

  // Funzione di Logout (termina la sessione e protegge i dati)
  const logout = async () => {
    sessionStorage.removeItem('four_active_session');
    localStorage.removeItem('four_active_session');
    localStorage.removeItem('four_local_user');
    setCurrentUser(null);
  };

  // Funzione per cambiare password / credenziali in Impostazioni
  const updatePassword = (oldPassword, newPassword) => {
    const currentConfig = getStoredAuthConfig();
    if (oldPassword !== currentConfig.password) {
      throw new Error('La password attuale inserita non è corretta.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('La nuova password deve contenere almeno 6 caratteri.');
    }
    const updated = {
      ...currentConfig,
      password: newPassword,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem('four_security_auth_config', JSON.stringify(updated));
    setAuthConfig(updated);
    return true;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        login,
        logout,
        updatePassword,
        authConfig
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
