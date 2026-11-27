import { createContext, useContext, useState, useEffect } from 'react';
import storageService from '../services/storageService';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// Funzione di utilità per hashing SHA-256 standard (Web Crypto API nativa del browser)
// Nessuna password aziendale in chiaro viene mai memorizzata o esposta nel codice
const hashPassword = async (str) => {
  if (!window.crypto?.subtle) {
    throw new Error('Connessione sicura HTTPS richiesta per la verifica delle credenziali.');
  }
  const enc = new TextEncoder().encode(str);
  const buf = await window.crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// Hash crittografico di default (SHA-256) per primo avvio
const DEFAULT_AUTH_CONFIG = {
  adminEmail: 'amministrazione@four-logistics.it',
  passwordHash: 'b52efa8ed2011cd22daf234524d91b02f98c370f33dda1a883ad30621c0bde35',
  role: 'Direzione & Controllo Costi',
  lastUpdated: '2026-01-01'
};

const getStoredAuthConfig = () => {
  try {
    const raw = localStorage.getItem('four_security_auth_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Elimina residui di password in chiaro se presenti in vecchie sessioni locali
      if (parsed.password) {
        delete parsed.password;
      }
      return parsed;
    }
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

  // Avvia automaticamente la sincronizzazione Cloud in tempo reale quando l'utente è autenticato
  useEffect(() => {
    if (currentUser) {
      storageService.startCloudSync();
    }
    const unsubscribe = storageService.subscribe((event) => {
      if (event.type === 'data' && event.scopes?.includes('security')) {
        setAuthConfig(getStoredAuthConfig());
      }
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Funzione di Login sicuro (verifica basata su hash SHA-256, sincronizzata col doc Cloud security)
  const login = async (email, password, rememberMe = true) => {
    await storageService.fetchSecurityConfigFromCloud();
    const currentConfig = getStoredAuthConfig();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanConfigEmail = (currentConfig.adminEmail || DEFAULT_AUTH_CONFIG.adminEmail).toLowerCase();

    const allowedEmails = new Set([
      cleanConfigEmail,
      'amministrazione@four-logistics.it',
      'direzione@four-logistics.it',
      'operativo@four-logistics.it',
      'admin'
    ]);

    if (!allowedEmails.has(cleanEmail)) {
      throw new Error('E-mail aziendale non riconosciuta.');
    }

    const inputHash = await hashPassword(password);
    if (!inputHash) {
      throw new Error('Impossibile verificare la password in questo browser.');
    }
    const targetHash = currentConfig.passwordHash || DEFAULT_AUTH_CONFIG.passwordHash;

    if (inputHash !== targetHash) {
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

  // Funzione di Logout (termina la sessione, ferma Cloud Sync e protegge i dati)
  const logout = async () => {
    storageService.stopCloudSync();
    sessionStorage.removeItem('four_active_session');
    localStorage.removeItem('four_active_session');
    localStorage.removeItem('four_local_user');
    setCurrentUser(null);
  };

  // Funzione per cambiare password / credenziali in Impostazioni con hash sicuro
  const updatePassword = async (oldPassword, newPassword) => {
    const currentConfig = getStoredAuthConfig();
    const oldHash = await hashPassword(oldPassword);
    const targetHash = currentConfig.passwordHash || DEFAULT_AUTH_CONFIG.passwordHash;

    if (oldHash !== targetHash) {
      throw new Error('La password attuale inserita non è corretta.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('La nuova password deve contenere almeno 6 caratteri.');
    }

    const newHash = await hashPassword(newPassword);
    if (!newHash) {
      throw new Error('Impossibile generare l\'hash sicuro della nuova password.');
    }
    const updated = {
      adminEmail: currentConfig.adminEmail || DEFAULT_AUTH_CONFIG.adminEmail,
      passwordHash: newHash,
      role: currentConfig.role || DEFAULT_AUTH_CONFIG.role,
      lastUpdated: new Date().toISOString()
    };
    storageService.saveSecurityConfig(updated);
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
