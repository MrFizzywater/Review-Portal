import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Lock, CheckCircle, AlertCircle, ExternalLink, Clock, Send, Upload, X, Plus, FileText, Download, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { ThemeToggle } from '../components/ThemeToggle';
import { sendEmail } from '../lib/email';

function getDriveEmbedUrl(url: string) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('drive.google.com')) {
      const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch && folderMatch[1]) {
        return `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
      }
      const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `https://drive.google.com/file/d/${match[1]}/preview`;
      }
    }
  } catch (e) {
    // Ignore invalid URLs
  }
  return url;
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
}

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
        const maxSize = 1080;
        
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

export default function ClientPortal() {
  const { projectId } = useParams();
  const [password, setPassword] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [project, setProject] = useState<any>(null);
  const [creatorProfile, setCreatorProfile] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [error, setError] = useState('');

  const [newChangeText, setNewChangeText] = useState('');
  const [isMajorChange, setIsMajorChange] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [clientNotes, setClientNotes] = useState('');
  const [nextStep, setNextStep] = useState('post_social');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) return;

    const fetchProjectAndCreator = async () => {
      try {
        const docRef = doc(db, 'projects', projectId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const projData: any = { id: docSnap.id, ...docSnap.data() };
          setProject(projData);
          
          if (projData.creatorId) {
            const creatorRef = doc(db, 'users', projData.creatorId);
            const creatorSnap = await getDoc(creatorRef);
            if (creatorSnap.exists()) {
              const profileData = creatorSnap.data();
              setCreatorProfile(profileData);
              if (profileData.displayName) {
                document.title = `${profileData.displayName}'s Media Review Portal`;
              }
            }
          }
        }
      } catch (err) {
        console.error("Error fetching project:", err);
      }
    };
    fetchProjectAndCreator();
  }, [projectId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !reviewerName.trim()) return;
    
    if (project.password === password) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Incorrect password');
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !projectId) return;

    const qVersions = query(collection(db, 'versions'), where('projectId', '==', projectId));
    const unsubVersions = onSnapshot(qVersions, (snapshot) => {
      const vData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setVersions(vData.sort((a, b) => b.versionNumber - a.versionNumber));
    });

    const qAssets = query(collection(db, 'project_assets'), where('projectId', '==', projectId));
    const unsubAssets = onSnapshot(qAssets, (snapshot) => {
      const aData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAssets(aData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
    });

    const qRequests = query(collection(db, 'change_requests'), where('projectId', '==', projectId));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      const rData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setChangeRequests(rData.sort((a, b) => a.createdAt?.toMillis() - b.createdAt?.toMillis()));
    });

    return () => {
      unsubVersions();
      unsubAssets();
      unsubRequests();
    };
  }, [isAuthenticated, projectId]);

  const currentVersion = versions.find(v => v.isCurrent);
  const currentRequests = changeRequests.filter(r => r.versionId === currentVersion?.id);
  const brandColor = creatorProfile?.brandColor || '#000000';
  const brandRgb = hexToRgb(brandColor);

  const submitChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChangeText.trim() || !currentVersion) return;
    setIsSubmitting(true);

    try {
      await addDoc(collection(db, 'change_requests'), {
        projectId,
        versionId: currentVersion.id,
        text: newChangeText.trim(),
        isMajor: isMajorChange,
        reviewerName,
        completed: false,
        createdAt: serverTimestamp()
      });

      if (currentVersion.status !== 'changes_requested') {
        await updateDoc(doc(db, 'versions', currentVersion.id), {
          status: 'changes_requested'
        });
      }

      if (creatorProfile?.contactEmail) {
        try {
          await sendEmail(
            creatorProfile.contactEmail,
            `Change Requested: ${project.title}`,
            `
              <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
                <h2>Changes requested for ${project.title}</h2>
                <p><strong>${reviewerName}</strong> requested a change on Version ${currentVersion.versionNumber}:</p>
                <blockquote style="border-left: 4px solid #ccc; padding-left: 16px; color: #555;">
                  ${newChangeText.trim()}
                </blockquote>
                <p>Severity: ${isMajorChange ? 'Important Fix' : 'Minor Tweak'}</p>
                <div style="margin-top: 30px;">
                  <a href="${window.location.origin}/project/${projectId}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Project</a>
                </div>
              </div>
            `
          );
        } catch (emailError) {
          console.error("Failed to send notification email", emailError);
        }
      }

      setNewChangeText('');
      setIsMajorChange(false);
    } catch (err) {
      console.error(err);
      alert('Failed to add request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitApproval = async () => {
    if (!currentVersion) return;
    setIsSubmitting(true);

    try {
      await updateDoc(doc(db, 'versions', currentVersion.id), {
        status: 'approved',
        approvalNotes: clientNotes,
        nextStep: nextStep
      });

      if (creatorProfile?.contactEmail) {
        try {
          await sendEmail(
            creatorProfile.contactEmail,
            `Project Approved: ${project.title}`,
            `
              <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
                <h2>${project.title} has been approved!</h2>
                <p><strong>${reviewerName}</strong> approved Version ${currentVersion.versionNumber}.</p>
                <p><strong>Next Step:</strong> ${nextStep}</p>
                ${clientNotes ? `<p><strong>Notes:</strong><br/>${clientNotes}</p>` : ''}
                <div style="margin-top: 30px;">
                  <a href="${window.location.origin}/project/${projectId}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Project</a>
                </div>
              </div>
            `
          );
        } catch (emailError) {
          console.error("Failed to send notification email", emailError);
        }
      }

      setIsApproving(false);
    } catch (err) {
      console.error(err);
      alert('Failed to approve');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;

    setIsUploadingAsset(true);
    try {
      const base64Data = await resizeImage(file);
      
      await addDoc(collection(db, 'project_assets'), {
        projectId,
        fileName: file.name,
        fileType: file.type === 'image/svg+xml' ? 'image/svg+xml' : 'image/webp',
        data: base64Data,
        createdAt: serverTimestamp()
      });
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      alert('Failed to upload file');
    } finally {
      setIsUploadingAsset(false);
    }
  };

  const deleteAsset = async (assetId: string) => {
    if (window.confirm('Remove this asset?')) {
      try {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'project_assets', assetId));
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (!isAuthenticated) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center dark:bg-gray-900 transition-colors"
        style={{ backgroundColor: `rgba(${brandRgb}, 0.03)` }}
      >
        <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 text-center max-w-md w-full transition-colors">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 overflow-hidden" style={{ backgroundColor: `rgba(${brandRgb}, 0.1)` }}>
            {creatorProfile?.logoUrl ? (
              <img src={creatorProfile.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
            ) : (
              <Lock className="w-8 h-8" style={{ color: brandColor }} />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{creatorProfile?.displayName || 'Client Portal'}</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Enter your name and the project password to view your project.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="text"
                required
                value={reviewerName}
                onChange={e => setReviewerName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none text-center text-lg bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 dark:text-white transition-colors"
                style={{ '--tw-ring-color': brandColor } as any}
                placeholder="Your Name / Initials"
              />
            </div>
            <div>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none text-center text-lg tracking-widest bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 dark:text-white transition-colors"
                style={{ '--tw-ring-color': brandColor } as any}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
            <button
              type="submit"
              style={{ backgroundColor: brandColor }}
              className="w-full text-white rounded-lg py-3.5 font-bold text-lg hover:opacity-90 transition-opacity shadow-md mt-2"
            >
              Access Project
            </button>
          </form>
        </div>
      </div>
    );
  }

  const pastVersions = versions.filter(v => !v.isCurrent);
  const revisionsUsed = versions.length > 0 ? versions.length - 1 : 0;
  const revisionsLeft = project.maxRevisions - revisionsUsed;
  const hasInvoice = project.invoice && project.invoice.status !== 'draft';

  return (
    <div 
      className="min-h-screen pb-12 print:bg-white print:pb-0 dark:bg-gray-900 transition-colors"
      style={{ backgroundColor: `rgba(${brandRgb}, 0.02)` }}
    >
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 shadow-sm print:hidden transition-colors">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {creatorProfile?.logoUrl && (
              <img src={creatorProfile.logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
            )}
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white">{project.title}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Prepared for {project.clientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300 hidden sm:inline">Reviewing as: <span className="text-black dark:text-white">{reviewerName}</span></span>
            <div 
              className="text-sm font-bold px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: `rgba(${brandRgb}, 0.1)`, color: brandColor }}
            >
              {revisionsLeft} revisions remaining
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8 print:p-0">
        
        {currentVersion ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:hidden">
            
            {/* Left Column: Player & Approval */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center" style={{ backgroundColor: `rgba(${brandRgb}, 0.03)` }}>
                  <div>
                    <span 
                      className="text-white font-bold px-3 py-1 rounded-md text-sm inline-block shadow-sm"
                      style={{ backgroundColor: brandColor }}
                    >
                      Current Version (v{currentVersion.versionNumber})
                    </span>
                  </div>
                  {currentVersion.status === 'approved' && (
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" /> Approved
                    </span>
                  )}
                </div>

                <div className="bg-gray-100 dark:bg-gray-900 relative" style={{ paddingTop: '56.25%' }}>
                  <iframe
                    src={getDriveEmbedUrl(currentVersion.driveLink)}
                    className="absolute top-0 left-0 w-full h-full border-0"
                    allow="autoplay"
                    allowFullScreen
                  ></iframe>
                </div>

                {currentVersion.creatorNotes && (
                  <div className="p-4 border-t border-gray-100 dark:border-gray-700" style={{ backgroundColor: `rgba(${brandRgb}, 0.05)` }}>
                    <h3 className="text-sm font-bold mb-1" style={{ color: brandColor }}>Notes from Creator:</h3>
                    <div className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                      {currentVersion.creatorNotes}
                    </div>
                  </div>
                )}
              </div>

              {currentVersion.status !== 'approved' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6 transition-colors">
                  {!isApproving ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Ready to finalize?</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Approve this version if no more changes are needed.</p>
                      </div>
                      <button
                        onClick={() => setIsApproving(true)}
                        className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <CheckCircle className="w-5 h-5" />
                        Approve Project
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" /> Approving Version
                        </h3>
                        <button onClick={() => setIsApproving(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium">Cancel</button>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next Steps</label>
                        <select
                          value={nextStep}
                          onChange={(e) => setNextStep(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 dark:text-white"
                          style={{ '--tw-ring-color': brandColor } as any}
                        >
                          <option value="post_social">Post to Social Media</option>
                          <option value="provide_download">Provide Download Link</option>
                          <option value="finalize">Finalize Project</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Notes (Optional)</label>
                        <textarea
                          value={clientNotes}
                          onChange={(e) => setClientNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none h-20 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 dark:text-white"
                          style={{ '--tw-ring-color': brandColor } as any}
                          placeholder="Any final thoughts?"
                        />
                      </div>

                      <button
                        onClick={submitApproval}
                        disabled={isSubmitting}
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-md"
                      >
                        <CheckCircle className="w-5 h-5" />
                        {isSubmitting ? 'Approving...' : 'Confirm Approval'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Change Requests */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-[600px] transition-colors">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700" style={{ backgroundColor: `rgba(${brandRgb}, 0.03)` }}>
                  <h3 className="font-bold text-gray-900 dark:text-white">Requested Changes</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">For Version {currentVersion.versionNumber}</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {currentRequests.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No changes requested yet.</p>
                  ) : (
                    currentRequests.map(req => (
                      <div key={req.id} className={`p-3 rounded-lg border ${req.completed ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm'}`}>
                        <div className="flex justify-between items-start mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${req.isMajor ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'}`}>
                            {req.isMajor ? 'Important Fix' : 'Minor Tweak'}
                          </span>
                          {req.completed && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Done
                            </span>
                          )}
                        </div>
                        <p className={`text-sm mt-1 ${req.completed ? 'text-gray-500 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-200'}`}>{req.text}</p>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 flex justify-between">
                          <span>{req.reviewerName}</span>
                          <span>{req.createdAt ? format(req.createdAt.toDate(), 'MMM d, h:mm a') : ''}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {currentVersion.status !== 'approved' && (
                  <div className="p-4 border-t border-gray-100 dark:border-gray-700" style={{ backgroundColor: `rgba(${brandRgb}, 0.03)` }}>
                    <form onSubmit={submitChangeRequest} className="space-y-3">
                      <textarea
                        required
                        value={newChangeText}
                        onChange={e => setNewChangeText(e.target.value)}
                        placeholder="Describe the change needed..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none text-sm h-20 resize-none focus:ring-2 bg-white dark:bg-gray-700 dark:text-white"
                        style={{ '--tw-ring-color': brandColor } as any}
                      />
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isMajorChange}
                            onChange={e => setIsMajorChange(e.target.checked)}
                            className="rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-600 dark:bg-gray-700"
                          />
                          Important Fix
                        </label>
                        <button
                          type="submit"
                          disabled={isSubmitting || !newChangeText.trim()}
                          style={{ backgroundColor: brandColor }}
                          className="text-white px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1 shadow-sm"
                        >
                          <Plus className="w-4 h-4" /> Add
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
            <p className="text-gray-500 dark:text-gray-400">No versions available yet.</p>
          </div>
        )}

        {hasInvoice && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden print:shadow-none print:border-none print:mt-0 transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center print:hidden" style={{ backgroundColor: `rgba(${brandRgb}, 0.03)` }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `rgba(${brandRgb}, 0.1)`, color: brandColor }}>
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Project Invoice</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {project.invoice.status === 'paid' ? 'Paid in full. Thank you!' : `Due by ${project.invoice.dueDate ? format(new Date(project.invoice.dueDate), 'MMM d, yyyy') : 'Receipt'}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
                {project.invoice.status === 'paid' ? (
                  <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Paid
                  </span>
                ) : (
                  <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 px-3 py-1.5 rounded-lg text-sm font-bold">
                    Payment Pending
                  </span>
                )}
              </div>
            </div>

            {/* Print Only Header */}
            <div className="hidden print:block p-8 pb-0">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">INVOICE</h1>
                  <p className="text-gray-600 dark:text-gray-400 font-medium">{project.title}</p>
                </div>
                <div className="text-right">
                  <h2 className="font-bold text-gray-900 dark:text-white">{creatorProfile?.displayName || 'Creator'}</h2>
                  {creatorProfile?.businessAddress && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap mt-1">{creatorProfile.businessAddress}</p>
                  )}
                  {creatorProfile?.taxId && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Tax ID: {creatorProfile.taxId}</p>
                  )}
                </div>
              </div>
              <div className="mt-8 flex justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Billed To</p>
                  <p className="font-bold text-gray-900 dark:text-white">{project.clientName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Due Date</p>
                  <p className="font-bold text-gray-900 dark:text-white">{project.invoice.dueDate ? format(new Date(project.invoice.dueDate), 'MMM d, yyyy') : 'Receipt'}</p>
                </div>
              </div>
            </div>

            <div className="p-6 print:p-8">
              <div className="space-y-4">
                <div className="hidden print:flex border-b border-gray-300 dark:border-gray-700 pb-2 mb-2 font-bold text-gray-900 dark:text-white">
                  <div className="flex-1">Description</div>
                  <div className="w-32 text-right">Amount</div>
                </div>
                {project.invoice.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-4 last:border-0 last:pb-0 print:border-b print:border-gray-100 print:py-2">
                    <span className="text-gray-800 dark:text-gray-200 font-medium flex-1">{item.description}</span>
                    <span className="text-gray-900 dark:text-white font-bold w-32 text-right">${Number(item.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Subtotal</span>
                    <span>${Number(project.invoice.subtotal || project.invoice.total).toFixed(2)}</span>
                  </div>
                  {project.invoice.taxRate > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Tax ({project.invoice.taxRate}%)</span>
                      <span>${Number(project.invoice.taxAmount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-100 dark:border-gray-700">
                    <span>Total</span>
                    <span style={{ color: brandColor }}>${Number(project.invoice.total).toFixed(2)}</span>
                  </div>
                  
                  {project.invoice.amountPaid > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Amount Paid</span>
                      <span>${Number(project.invoice.amountPaid).toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-xl font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span>Balance Due</span>
                    <span className={(project.invoice.total - (project.invoice.amountPaid || 0)) <= 0 ? 'text-green-600 dark:text-green-400' : ''}>
                      ${Math.max(0, project.invoice.total - (project.invoice.amountPaid || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              {project.invoice.notes && (
                <div className="mt-8 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap print:bg-transparent print:border-none print:p-0">
                  <strong className="block text-gray-900 dark:text-white mb-1">Payment Instructions:</strong>
                  {project.invoice.notes}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden print:hidden transition-colors">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center" style={{ backgroundColor: `rgba(${brandRgb}, 0.03)` }}>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Essential Elements</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Upload logos, photos, or assets needed for the project.</p>
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAsset}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              {isUploadingAsset ? 'Uploading...' : 'Upload Asset'}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
          
          {assets.length > 0 && (
            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {assets.map(asset => (
                <div key={asset.id} className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
                  <img src={asset.data} alt={asset.fileName} className="w-full h-32 object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={() => deleteAsset(asset.id)}
                      className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] p-1 truncate">
                    {asset.fileName}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {pastVersions.length > 0 && (
          <div className="mt-8 print:hidden">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Previous Versions</h3>
            <div className="space-y-3">
              {pastVersions.map(version => (
                <div key={version.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-between transition-colors">
                  <div>
                    <span className="font-bold text-gray-900 dark:text-white mr-3">Version {version.versionNumber}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {version.createdAt ? format(version.createdAt.toDate(), 'MMM d, yyyy') : ''}
                    </span>
                  </div>
                  <a 
                    href={getDriveEmbedUrl(version.driveLink)} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-sm hover:underline font-bold"
                    style={{ color: brandColor }}
                  >
                    View Reference
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {creatorProfile && (creatorProfile.displayName || creatorProfile.bio || creatorProfile.website || creatorProfile.contactEmail) && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6 print:hidden transition-colors">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">About the Creator</h3>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              {creatorProfile.logoUrl && (
                <img src={creatorProfile.logoUrl} alt="Logo" className="w-16 h-16 rounded-xl object-contain bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 p-1" />
              )}
              <div>
                {creatorProfile.displayName && <h4 className="font-bold text-gray-900 dark:text-white text-lg">{creatorProfile.displayName}</h4>}
                {creatorProfile.bio && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 max-w-2xl whitespace-pre-wrap">{creatorProfile.bio}</p>}
                <div className="flex flex-wrap gap-4 mt-3 text-sm font-bold">
                  {creatorProfile.website && (
                    <a href={creatorProfile.website} target="_blank" rel="noreferrer" style={{ color: brandColor }} className="hover:opacity-80">Website</a>
                  )}
                  {creatorProfile.contactEmail && (
                    <a href={`mailto:${creatorProfile.contactEmail}`} style={{ color: brandColor }} className="hover:opacity-80">Contact</a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
