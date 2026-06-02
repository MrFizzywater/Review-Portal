import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';
import { db, isFirebasePlaceholder } from '../firebase';
import { User } from 'firebase/auth';
import { ArrowLeft, Save, Upload, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';

const resizeImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxSize = 512;
        
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > width && height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function AdminSettings({ user }: { user: User }) {
  const [profile, setProfile] = useState({
    logoUrl: '',
    displayName: '',
    bio: '',
    website: '',
    contactEmail: '',
    brandColor: '#000000',
    taxRate: 0,
    taxId: '',
    businessAddress: '',
    googleDriveFolderId: '',
    googleClientId: '',
    googleApiKey: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProfile((prev) => ({ ...prev, ...docSnap.data() }));
      }
    };
    fetchProfile();
  }, [user.uid]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');

    if (isFirebasePlaceholder) {
      setMessage('No active Firebase database configured. If using a custom database, please sign out and configure it in "Advanced: Custom Database Connection" at login.');
      setIsSaving(false);
      return;
    }

    const isIframe = window.self !== window.top;
    const timeoutMs = isIframe ? 20000 : 35000;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    );

    // Fast connection diagnostic check
    try {
      await getDocFromServer(doc(db, 'users', user.uid));
    } catch (diagError: any) {
      console.error("Connection diagnostic failed:", diagError);
      setMessage(`Firestore Connection Error!\n\n` +
                 `We couldn't connect directly to your Firestore database. This usually means either the server is unreachable or the credentials/API keys configured are invalid.\n\n` +
                 `Error message: ${diagError?.message || diagError?.toString()}\n` +
                 `Error code: ${diagError?.code || 'unknown'}`);
      setIsSaving(false);
      return;
    }

    try {
      await Promise.race([
        setDoc(doc(db, 'users', user.uid), profile, { merge: true }),
        timeoutPromise
      ]);
      setMessage('Settings saved successfully!');
    } catch (error: any) {
      console.error("Error saving profile", error);
      if (error?.message === 'TIMEOUT') {
        const dbInfo = localStorage.getItem('custom_firebase_config')
          ? 'a custom Firebase project'
          : 'the built-in default Firebase project';
          
        setMessage(`Firestore Connection Timed Out! (${timeoutMs / 1000}s)

Your app is currently using ${dbInfo}. Because Firebase Auth (the login screen) completes successfully, this timeout means the client is unable to establish a write channel to Firestore.

Please check the following steps:
1. UNINITIALIZED DATABASE: In your Firebase Console (console.firebase.google.com), open this project, select "Firestore Database" in the left sidebar, and click "Create Database". Firebase Auth is active by default, but Firestore will ignore or hang on write queries until the database is explicitly initialized.
2. SANDBOX WRITES: If you are running inside the AI Studio Live Preview panel, some browsers block database cookies. Please click "Open in a new tab" in the top-right corner of the live preview.
3. FIREWALL/NETWORKS: Make sure you do not have extensions or firewalls active that block secure gRPC or web socket connections.`);
      } else if (error?.code === 'permission-denied') {
        setMessage('Permission denied. Please try logging out and signing in again, or verify your database setup rules.');
      } else {
        setMessage('Failed to save settings: ' + (error?.message || error?.toString() || 'Unknown error'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const resizedDataUrl = await resizeImage(file);
      setProfile({ ...profile, logoUrl: resizedDataUrl });
    } catch (error) {
      console.error("Error uploading logo", error);
      alert("Failed to process image");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors pb-12">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-bold text-gray-900 dark:text-white">Workspace Settings</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <form onSubmit={handleSave} className="p-6 space-y-6">
            
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Brand Identity</h2>
              <div className="flex items-start gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Logo</label>
                  <div 
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-700 overflow-hidden relative cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {profile.logoUrl ? (
                      <img src={profile.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleLogoUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Click to upload (max 512x512)</p>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Brand Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={profile.brandColor}
                        onChange={e => setProfile({...profile, brandColor: e.target.value})}
                        className="w-10 h-10 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={profile.brandColor}
                        onChange={e => setProfile({...profile, brandColor: e.target.value})}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none font-mono text-sm uppercase dark:bg-gray-700 dark:text-white"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-gray-100 dark:border-gray-700" />

            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Billing Details (Optional)</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">These details will be used when generating invoices for your clients.</p>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tax Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={profile.taxRate}
                      onChange={e => setProfile({...profile, taxRate: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                      placeholder="e.g. 13"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tax ID / HST Number</label>
                    <input
                      type="text"
                      value={profile.taxId}
                      onChange={e => setProfile({...profile, taxId: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                      placeholder="e.g. 123456789 RT0001"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Address</label>
                  <textarea
                    value={profile.businessAddress}
                    onChange={e => setProfile({...profile, businessAddress: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none h-20 dark:bg-gray-700 dark:text-white"
                    placeholder="123 Main St&#10;City, State, ZIP"
                  />
                </div>
              </div>
            </div>

            <hr className="border-gray-100 dark:border-gray-700" />

            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Cloud Integrations</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Connect your Google Drive to allow direct file uploads. 
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="ml-1 text-black dark:text-white underline font-medium">
                  Get your API Key & Client ID here <ExternalLink className="w-3 h-3 inline" />
                </a>
              </p>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6 border border-blue-100 dark:border-blue-800">
                <h4 className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase tracking-wider mb-2">Setup Instructions</h4>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc pl-4">
                  <li>Enable **Google Drive API** and **Google Picker API** in Cloud Console.</li>
                  <li>Create **OAuth Client ID** (Web application).</li>
                  <li>Add your app URL to **Authorized JavaScript origins**.</li>
                  <li>Create an **API Key** (restrict usage to Google Drive API if possible).</li>
                </ul>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Google Drive Root Folder ID</label>
                  <input
                    type="text"
                    value={profile.googleDriveFolderId}
                    onChange={e => setProfile({...profile, googleDriveFolderId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                    placeholder="e.g. 1aBCdEfGhIjKlMnOpQrStUvWxYz"
                  />
                  <p className="text-xs text-gray-500 mt-1">Files will be organized in subfolders: Client Name / Project Title</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Google Client ID</label>
                    <input
                      type="text"
                      value={profile.googleClientId}
                      onChange={e => setProfile({...profile, googleClientId: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                      placeholder="Enter your Google Client ID"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Google API Key</label>
                    <input
                      type="password"
                      value={profile.googleApiKey}
                      onChange={e => setProfile({...profile, googleApiKey: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                      placeholder="Enter your Google API Key"
                    />
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-gray-100 dark:border-gray-700" />
            
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Creator Details (Optional)</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">These details will be visible to clients in the review portal.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name / Studio Name</label>
                  <input
                    type="text"
                    value={profile.displayName}
                    onChange={e => setProfile({...profile, displayName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                    placeholder="e.g. Acme Studios"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio / Short Description</label>
                  <textarea
                    value={profile.bio}
                    onChange={e => setProfile({...profile, bio: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none h-24 dark:bg-gray-700 dark:text-white"
                    placeholder="Tell your clients a bit about yourself..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website</label>
                    <input
                      type="url"
                      value={profile.website}
                      onChange={e => setProfile({...profile, website: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={profile.contactEmail}
                      onChange={e => setProfile({...profile, contactEmail: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                      placeholder="hello@example.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            {message && (
              <div 
                className={`p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap border text-left ${
                  message.includes('successfully') 
                    ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/60' 
                    : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                }`}
              >
                {message}
              </div>
            )}

            <div className="flex items-center justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                type="submit"
                disabled={isSaving}
                className="bg-black dark:bg-white text-white dark:text-black px-6 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
