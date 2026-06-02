import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const cleanValue = (val: string | undefined): string => {
  if (!val) return '';
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

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(cleanValue(env.GEMINI_API_KEY)),
      'process.env.APP_URL': JSON.stringify(cleanValue(env.APP_URL)),
      'process.env.FIREBASE_API_KEY': JSON.stringify(cleanValue(env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY || '')),
      'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(cleanValue(env.FIREBASE_AUTH_DOMAIN || env.VITE_FIREBASE_AUTH_DOMAIN || '')),
      'process.env.FIREBASE_PROJECT_ID': JSON.stringify(cleanValue(env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || '')),
      'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(cleanValue(env.FIREBASE_STORAGE_BUCKET || env.VITE_FIREBASE_STORAGE_BUCKET || '')),
      'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(cleanValue(env.FIREBASE_MESSAGING_SENDER_ID || env.VITE_FIREBASE_MESSAGING_SENDER_ID || '')),
      'process.env.FIREBASE_APP_ID': JSON.stringify(cleanValue(env.FIREBASE_APP_ID || env.VITE_FIREBASE_APP_ID || '')),
      'process.env.FIREBASE_MEASUREMENT_ID': JSON.stringify(cleanValue(env.FIREBASE_MEASUREMENT_ID || env.VITE_FIREBASE_MEASUREMENT_ID || '')),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
