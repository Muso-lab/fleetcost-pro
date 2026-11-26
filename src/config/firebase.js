import { initializeApp } from 'firebase/app';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDGzLJ6EflTKvCU1cpUiIQo5xi7VzmFAVQ",
  authDomain: "fleetcost-pro.firebaseapp.com",
  projectId: "fleetcost-pro",
  storageBucket: "fleetcost-pro.firebasestorage.app",
  messagingSenderId: "759551307291",
  appId: "1:759551307291:web:52fc871e76569fbb22d2be"
};

let app;
let db;
let auth;

try {
  app = initializeApp(firebaseConfig);
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true
    });
  } catch {
    db = getFirestore(app);
  }
  auth = getAuth(app);
} catch (error) {
  console.error('Errore inizializzazione Firebase:', error);
}

let authSessionPromise = null;

/**
 * Garantisce una sessione Firebase Auth valida (necessaria per le regole di sicurezza Cloud Firestore)
 * riutilizzando eventuali sessioni già attive nel browser oppure autenticandosi in modo trasparente.
 */
export const ensureFirebaseSession = () => {
  if (!auth) return Promise.resolve(null);
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (authSessionPromise) return authSessionPromise;

  authSessionPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (user) => {
      if (!settled) {
        settled = true;
        authSessionPromise = null;
        resolve(user || null);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (existingUser) => {
      unsubscribe();
      if (existingUser) {
        finish(existingUser);
        return;
      }
      try {
        const cred = await signInAnonymously(auth);
        finish(cred?.user || null);
      } catch (err) {
        console.warn('Autenticazione Cloud Firebase non disponibile:', err?.code || err?.message);
        finish(null);
      }
    });

    // Timeout di sicurezza per non bloccare mai l'avvio offline
    setTimeout(() => finish(auth.currentUser || null), 6000);
  });

  return authSessionPromise;
};

export { app, db, auth };
