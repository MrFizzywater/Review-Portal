import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
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

export let db: Firestore;
export let auth: Auth;
export const googleProvider = new GoogleAuthProvider();

export async function initFirebase() {
  let configToUse = { ...defaultFirebaseConfig };

  // 1. First fallback: build-time environment variables in process.env (baked by Vite)
  const buildTimeConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  };

  for (const key of Object.keys(buildTimeConfig)) {
    const val = (buildTimeConfig as any)[key];
    if (val && !val.includes('PLACEHOLDER') && val.trim() !== "") {
      (configToUse as any)[key] = val;
    }
  }

  // 2. High-priority runtime config: fetch from backend API (dynamic env variables from Coolify/Docker at runtime)
  try {
    const res = await fetch('/api/firebase-config');
    if (res.ok) {
      const serverConfig = await res.json();
      // Overwrite the build-time ones with any valid keys supplied by the active container environment
      for (const key of Object.keys(serverConfig)) {
        const val = serverConfig[key];
        if (val && !val.includes('PLACEHOLDER') && val.trim() !== "") {
          (configToUse as any)[key] = val;
        }
      }
    }
  } catch (error) {
    console.warn("Failed to fetch runtime backend firebase-config:", error);
  }

  // 3. Fallback / Merge with custom config from localStorage override (if any is active)
  const customConfigStr = localStorage.getItem('custom_firebase_config');
  if (customConfigStr) {
    try {
      const customConfig = JSON.parse(customConfigStr);
      configToUse = { ...configToUse, ...customConfig };
    } catch (e) {
      console.error("Failed to parse custom local storage firebase config", e);
    }
  }

  const activeConfig = cleanConfigObj(configToUse);

  let app;
  if (getApps().length === 0) {
    app = initializeApp(activeConfig);
  } else {
    app = getApp();
  }

  db = activeConfig.firestoreDatabaseId 
    ? getFirestore(app, activeConfig.firestoreDatabaseId)
    : getFirestore(app);
  auth = getAuth(app);
}
