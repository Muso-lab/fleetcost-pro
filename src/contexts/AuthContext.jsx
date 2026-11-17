import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  // Supporto sessione locale persistente
  const [currentUser, setCurrentUser] = useState(() => {
    const savedLocalUser = localStorage.getItem('four_local_user');
    if (savedLocalUser) {
      try {
        return JSON.parse(savedLocalUser);
      } catch (e) {
        return null;
      }
    }
    // Per consentire lo sviluppo locale immediato, impostiamo di default l'utente locale FOUR
    const defaultUser = {
      uid: 'local_four_admin',
      email: 'operativo@four-trasporti.it',
      displayName: 'FOUR Team',
      isLocal: true
    };
    localStorage.setItem('four_local_user', JSON.stringify(defaultUser));
    return defaultUser;
  });

  const [loading, setLoading] = useState(false);

  // Login con credenziali Firebase
  const login = async (email, password) => {
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      setCurrentUser(userCred.user);
      localStorage.removeItem('four_local_user');
      return userCred.user;
    } catch (error) {
      console.warn('Login Firebase fallito, consento fallback locale:', error);
      throw error;
    }
  };

  // Login locale istantaneo per sviluppo locale / offline
  const loginLocal = (role = 'Amministratore') => {
    const localUser = {
      uid: 'local_four_admin',
      email: 'operativo@four-trasporti.it',
      displayName: `FOUR ${role}`,
      isLocal: true
    };
    localStorage.setItem('four_local_user', JSON.stringify(localUser));
    setCurrentUser(localUser);
    return localUser;
  };

  const signup = async (email, password) => {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    setCurrentUser(userCred.user);
    return userCred.user;
  };

  const logout = async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (e) {
      console.warn('Errore logout Firebase:', e);
    } finally {
      localStorage.removeItem('four_local_user');
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        localStorage.removeItem('four_local_user');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    login,
    loginLocal,
    signup,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
