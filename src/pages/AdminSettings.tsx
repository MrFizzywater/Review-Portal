import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { ArrowLeft, Save, Upload, Image as ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

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
    brandColor: '#000000'
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
    try {
      await setDoc(doc(db, 'users', user.uid), profile, { merge: true });
      setMessage('Settings saved successfully!');
    } catch (error) {
      console.error("Error saving profile", error);
      setMessage('Failed to save settings.');
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
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-bold text-gray-900">Workspace Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <form onSubmit={handleSave} className="p-6 space-y-6">
            
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Brand Identity</h2>
              <div className="flex items-start gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
                  <div 
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden relative cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {profile.logoUrl ? (
                      <img src={profile.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-400" />
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
                  <p className="text-xs text-gray-500 mt-2">Click to upload (max 512x512)</p>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={profile.brandColor}
                        onChange={e => setProfile({...profile, brandColor: e.target.value})}
                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                      />
                      <input
                        type="text"
                        value={profile.brandColor}
                        onChange={e => setProfile({...profile, brandColor: e.target.value})}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none font-mono text-sm uppercase"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Creator Details (Optional)</h2>
              <p className="text-sm text-gray-500 mb-4">These details will be visible to clients in the review portal.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name / Studio Name</label>
                  <input
                    type="text"
                    value={profile.displayName}
                    onChange={e => setProfile({...profile, displayName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                    placeholder="e.g. Acme Studios"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bio / Short Description</label>
                  <textarea
                    value={profile.bio}
                    onChange={e => setProfile({...profile, bio: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none h-24"
                    placeholder="Tell your clients a bit about yourself..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input
                      type="url"
                      value={profile.website}
                      onChange={e => setProfile({...profile, website: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={profile.contactEmail}
                      onChange={e => setProfile({...profile, contactEmail: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                      placeholder="hello@example.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <span className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                {message}
              </span>
              <button
                type="submit"
                disabled={isSaving}
                className="bg-black text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-50"
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
