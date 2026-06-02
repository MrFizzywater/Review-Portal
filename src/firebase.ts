import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
// @ts-ignore
import defaultFirebaseConfig from '../firebase-applet-config.json';

// Allow overriding firebase config via localStorage for backup purposes
const customConfigStr = localStorage.getItem('custom_firebase_config');
const firebaseConfig = customConfigStr ? JSON.parse(customConfigStr) : defaultFirebaseConfig;

const app = initializeApp(firebaseConfig);
export const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
