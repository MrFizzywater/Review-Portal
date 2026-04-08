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
  const handleLogin = async () => {
    const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
    const { auth, googleProvider } = await import('./firebase');
    try {
      await signInWithPopup(auth, googleProvider);
      window.location.href = '/';
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Creator Login</h1>
        <p className="text-gray-500 mb-6">Sign in to manage your client review portals.</p>
        <button
          onClick={handleLogin}
          className="w-full bg-black text-white rounded-lg py-3 font-medium hover:bg-gray-800 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

