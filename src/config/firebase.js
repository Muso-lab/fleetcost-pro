import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// SOSTITUISCI CON LE TUE CREDENZIALI REALI
const firebaseConfig = {
  apiKey: "AIzaSyDGzLJ6EflTKvCU1cpUiIQo5xi7VzmFAVQ",
  authDomain: "fleetcost-pro.firebaseapp.com",
  projectId: "fleetcost-pro",
  storageBucket: "fleetcost-pro.firebasestorage.app",
  messagingSenderId: "759551307291",
  appId: "1:759551307291:web:52fc871e76569fbb22d2be"
};

// Inizializza Firebase
let app;
let db;
let auth;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  console.log('Firebase inizializzato correttamente');
} catch (error) {
  console.error('Errore inizializzazione Firebase:', error);
}

export { db, auth };
