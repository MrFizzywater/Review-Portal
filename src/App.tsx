import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import CreatorDashboard from './pages/CreatorDashboard';
import ProjectDetails from './pages/ProjectDetails';
import ClientPortal from './pages/ClientPortal';
import AdminSettings from './pages/AdminSettings';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={user ? <CreatorDashboard user={user} /> : <Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/project/:projectId" element={user ? <ProjectDetails user={user} /> : <Navigate to="/login" />} />
        <Route path="/settings" element={user ? <AdminSettings user={user} /> : <Navigate to="/login" />} />
        <Route path="/p/:projectId" element={<ClientPortal />} />
      </Routes>
    </BrowserRouter>
  );
}

function Login() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfigOptions, setShowConfigOptions] = useState(false);
  const [customConfig, setCustomConfig] = useState('');

  const handleLogin = async () => {
    setErrorMsg(null);
    const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
    const { auth, googleProvider } = await import('./firebase');
    try {
      await signInWithPopup(auth, googleProvider);
      window.location.href = '/';
    } catch (error: any) {
      console.error("Login failed", error);
      setErrorMsg(error.message || "An unknown error occurred during login.");
    }
  };

  const handleSaveConfig = () => {
    try {
      if (!customConfig.trim()) {
        localStorage.removeItem('custom_firebase_config');
      } else {
        JSON.parse(customConfig); // validate JSON
        localStorage.setItem('custom_firebase_config', customConfig);
      }
      window.location.reload();
    } catch (e) {
      alert("Invalid JSON format. Please paste a valid Firebase JS config object.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Creator Login</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">Sign in to manage your client review portals.</p>
        
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg text-left break-words">
            <strong>Login Error:</strong><br/>
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleLogin}
          className="w-full bg-black dark:bg-white text-white dark:text-black rounded-lg py-3 font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors mb-4"
        >
          Sign in with Google
        </button>

        <button 
          onClick={() => setShowConfigOptions(!showConfigOptions)}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
        >
          {showConfigOptions ? 'Hide connection settings' : 'Advanced: Custom Database Connection'}
        </button>

        {showConfigOptions && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-left">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">Backup Firebase Config</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              If the default AI Studio database is temporarily suspended, paste your personal Firebase Web config JSON here to continue working.
            </p>
            <textarea 
              value={customConfig}
              onChange={(e) => setCustomConfig(e.target.value)}
              placeholder='{ "apiKey": "...", "authDomain": "...", ... }'
              className="w-full text-xs font-mono p-2 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 focus:ring-1"
              rows={6}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button 
                onClick={() => {
                  localStorage.removeItem('custom_firebase_config');
                  window.location.reload();
                }}
                className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded"
              >
                Reset to Default
              </button>
              <button 
                onClick={handleSaveConfig}
                className="px-3 py-1.5 text-xs bg-black text-white hover:bg-gray-800 rounded font-bold"
              >
                Save & Restart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

