import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  OAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  onSnapshot, 
  serverTimestamp,
  addDoc,
  query,
  orderBy,
  limit,
  where,
  deleteDoc,
  updateDoc,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Auth persistence error:", err);
});
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Enable Firestore Offline Persistence
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
    } else if (err.code === 'unimplemented') {
      console.warn("The current browser doesn't support all of the features required to enable persistence");
    }
  });
}

export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export const appleProvider = new OAuthProvider('apple.com');

export { 
  GoogleAuthProvider,
  serverTimestamp,
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  onSnapshot,
  setPersistence,
  browserLocalPersistence,
  addDoc,
  query,
  orderBy,
  limit,
  where,
  deleteDoc,
  updateDoc,
  ref,
  uploadBytesResumable,
  getDownloadURL
};
export type { User };
