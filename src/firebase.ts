import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
// @ts-ignore
import defaultFirebaseConfigJson from '../firebase-applet-config.json';
const defaultFirebaseConfig = defaultFirebaseConfigJson as any;

// Utility to clean quotes, slashes, and spaces from config values
const cleanStr = (val: any): any => {
  if (typeof val !== 'string') return val;
  let str = val.trim();

  // Strip potential accidentally copied key prefix e.g. 'authDomain: "value",'
  const colonIndex = str.indexOf(':');
  if (colonIndex !== -1) {
    const prefix = str.substring(0, colonIndex).trim().toLowerCase();
    const keysToCheck = ['apikey', 'authdomain', 'projectid', 'storagebucket', 'messagingsenderid', 'appid', 'measurementid'];
    if (keysToCheck.includes(prefix)) {
      str = str.substring(colonIndex + 1).trim();
    }
  }

  let changed = true;
  while (changed) {
    const prev = str;
    str = str.trim();
    
    // Remove trailing comma or semicolon
    if (str.endsWith(',') || str.endsWith(';')) {
      str = str.slice(0, -1);
    }
    // Remove outer standard quotes
    else if (str.startsWith('"') && str.endsWith('"')) {
      str = str.slice(1, -1);
    } else if (str.startsWith("'") && str.endsWith("'")) {
      str = str.slice(1, -1);
    }
    // Remove outer escaped quotes
    else if (str.startsWith('\\"') && str.endsWith('\\"')) {
      str = str.slice(2, -2);
    } else if (str.startsWith("\\'") && str.endsWith("\\'")) {
      str = str.slice(2, -2);
    }
    // Remove stray backslashes or unmatched quotes at the edges
    else if (str.startsWith('\\')) {
      str = str.slice(1);
    } else if (str.endsWith('\\')) {
      str = str.slice(0, -1);
    } else if (str.startsWith('"')) {
      str = str.slice(1);
    } else if (str.endsWith('"')) {
      str = str.slice(0, -1);
    } else if (str.startsWith("'")) {
      str = str.slice(1);
    } else if (str.endsWith("'")) {
      str = str.slice(0, -1);
    }

    changed = (str !== prev);
  }
  return str.trim();
};

const cleanConfigObj = (config: Record<string, any>): Record<string, any> => {
  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(config)) {
    cleaned[key] = cleanStr(config[key]);
  }
  return cleaned;
};

// Build the config dynamically using environment variables exposed at build-time, with config file placeholders as backup.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
  projectId: process.env.FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
  appId: process.env.FIREBASE_APP_ID || defaultFirebaseConfig.appId,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || defaultFirebaseConfig.measurementId,
  firestoreDatabaseId: defaultFirebaseConfig.firestoreDatabaseId,
};

// Allow overriding firebase config via localStorage for backup purposes
const customConfigStr = localStorage.getItem('custom_firebase_config');
const rawConfig = customConfigStr ? JSON.parse(customConfigStr) : firebaseConfig;

// Ensure all string keys are cleaned before passing to initializeApp
const activeConfig = cleanConfigObj(rawConfig);

const app = initializeApp(activeConfig);
export const db = activeConfig.firestoreDatabaseId 
  ? getFirestore(app, activeConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
