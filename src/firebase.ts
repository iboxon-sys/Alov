import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  User 
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication ONLY (100% Free of Firestore DB)
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Auth persistence error:", err);
});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { 
  GoogleAuthProvider,
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
};
export type { User };
