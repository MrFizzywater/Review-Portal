import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { ArrowLeft, Plus, Link as LinkIcon, Eye, CheckCircle, Clock, AlertCircle, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';

function getDriveEmbedUrl(url: string) {
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
  }
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return url;
}

export default function ProjectDetails({ user }: { user: User }) {
  const { projectId } = useParams();
  const [project, setProject] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [isAddingVersion, setIsAddingVersion] = useState(false);
  const [newVersion, setNewVersion] = useState({ driveLink: '', type: 'video', creatorNotes: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      const docRef = doc(db, 'projects', projectId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    };
    fetchProject();

    const qVersions = query(collection(db, 'versions'), where('projectId', '==', projectId));
    const unsubVersions = onSnapshot(qVersions, (snapshot) => {
      const vData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setVersions(vData.sort((a, b) => b.versionNumber - a.versionNumber));
    });

    const qRequests = query(collection(db, 'change_requests'), where('projectId', '==', projectId));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      const rData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setChangeRequests(rData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
    });

    const qAssets = query(collection(db, 'project_assets'), where('projectId', '==', projectId));
    const unsubAssets = onSnapshot(qAssets, (snapshot) => {
      const aData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAssets(aData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
    });

    return () => {
      unsubVersions();
      unsubRequests();
      unsubAssets();
    };
  }, [projectId]);

  const handleAddVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextVersionNumber = versions.length > 0 ? versions[0].versionNumber + 1 : 1;
    
    // Set previous versions to not current
    for (const v of versions) {
      if (v.isCurrent) {
        await updateDoc(doc(db, 'versions', v.id), { isCurrent: false });
      }
    }

    try {
      await addDoc(collection(db, 'versions'), {
        projectId,
        versionNumber: nextVersionNumber,
        driveLink: newVersion.driveLink,
        type: newVersion.type,
        creatorNotes: newVersion.creatorNotes,
        status: 'pending',
        isCurrent: true,
        createdAt: serverTimestamp()
      });
      setIsAddingVersion(false);
      setNewVersion({ driveLink: '', type: 'video', creatorNotes: '' });
    } catch (error) {
      console.error("Error adding version", error);
    }
  };

  const toggleChangeCompletion = async (requestId: string, completed: boolean) => {
    await updateDoc(doc(db, 'change_requests', requestId), {
      completed
    });
  };

  const copyClientLink = () => {
    const baseUrl = process.env.APP_URL || window.location.origin;
    const url = `${baseUrl}/p/${projectId}`;
    navigator.clipboard.writeText(url);
    alert('Client link copied to clipboard!\n\n' + url);
  };

  const currentVersion = versions.find(v => v.isCurrent);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!project) return <div className="p-8">Project not found</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-900">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-bold text-gray-900">{project.title}</h1>
            <span className="text-sm text-gray-500 px-2 py-1 bg-gray-100 rounded-md">
              {project.clientName}
            </span>
          </div>
          <button
            onClick={copyClientLink}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-black transition-colors"
          >
            <LinkIcon className="w-4 h-4" />
            Copy Client Link
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Versions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Versions</h2>
              <button
                onClick={() => setIsAddingVersion(true)}
                className="bg-black text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Version
              </button>
            </div>

            {isAddingVersion && (
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-4">New Version</h3>
                <form onSubmit={handleAddVersion} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Google Drive Link</label>
                    <input
                      type="url"
                      required
                      value={newVersion.driveLink}
                      onChange={e => setNewVersion({...newVersion, driveLink: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                      placeholder="https://drive.google.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={newVersion.type}
                      onChange={e => setNewVersion({...newVersion, type: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                    >
                      <option value="video">Video</option>
                      <option value="photo">Photo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes for Client</label>
                    <textarea
                      value={newVersion.creatorNotes}
                      onChange={e => setNewVersion({...newVersion, creatorNotes: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none h-24"
                      placeholder="What changed in this version?"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIsAddingVersion(false)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button type="submit" className="px-3 py-1.5 bg-black text-white rounded-lg">Upload Version</button>
                  </div>
                </form>
              </div>
            )}

            {currentVersion && (
              <div className="bg-white p-5 rounded-xl border border-black shadow-md">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-gray-100 text-gray-800 font-bold px-2.5 py-1 rounded-md text-sm">
                      v{currentVersion.versionNumber}
                    </span>
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded-full">Current</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {currentVersion.createdAt ? format(currentVersion.createdAt.toDate(), 'MMM d, h:mm a') : 'Just now'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentVersion.status === 'pending' && <span className="text-yellow-600 text-sm flex items-center gap-1"><Eye className="w-4 h-4"/> Pending Review</span>}
                    {currentVersion.status === 'approved' && <span className="text-green-600 text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Approved</span>}
                    {currentVersion.status === 'changes_requested' && <span className="text-red-600 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Changes Requested</span>}
                  </div>
                </div>
                
                <div className="bg-gray-100 rounded-xl border border-gray-200 overflow-hidden mb-4 relative" style={{ paddingTop: '56.25%' }}>
                  <iframe
                    src={getDriveEmbedUrl(currentVersion.driveLink)}
                    className="absolute top-0 left-0 w-full h-full border-0"
                    allow="autoplay"
                    allowFullScreen
                  ></iframe>
                </div>
                
                {currentVersion.creatorNotes && (
                  <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700 border border-gray-100">
                    <span className="font-medium block mb-1">Your notes:</span>
                    {currentVersion.creatorNotes}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              {versions.filter(v => !v.isCurrent).map(version => (
                <div key={version.id} className="bg-white p-5 rounded-xl border border-gray-200 opacity-75">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <span className="bg-gray-100 text-gray-800 font-bold px-2.5 py-1 rounded-md text-sm">
                        v{version.versionNumber}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {version.createdAt ? format(version.createdAt.toDate(), 'MMM d, h:mm a') : 'Just now'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {version.status === 'pending' && <span className="text-yellow-600 text-sm flex items-center gap-1"><Eye className="w-4 h-4"/> Pending Review</span>}
                      {version.status === 'approved' && <span className="text-green-600 text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Approved</span>}
                      {version.status === 'changes_requested' && <span className="text-red-600 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Changes Requested</span>}
                    </div>
                  </div>
                  
                  <a href={getDriveEmbedUrl(version.driveLink)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-sm font-medium flex items-center gap-1 mb-3">
                    <ExternalLink className="w-4 h-4" /> View Content
                  </a>
                  
                  {version.creatorNotes && (
                    <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700 border border-gray-100">
                      <span className="font-medium block mb-1">Your notes:</span>
                      {version.creatorNotes}
                    </div>
                  )}
                </div>
              ))}
              {versions.length === 0 && !isAddingVersion && (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                  <p className="text-gray-500">No versions uploaded yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Feedback & Assets */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Client Feedback</h2>
            
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <span className="font-medium text-gray-700">Revisions Used</span>
                <span className="font-bold text-gray-900">{versions.length > 0 ? versions.length - 1 : 0} / {project.maxRevisions}</span>
              </div>
              
              <div className="p-4 space-y-6 max-h-[600px] overflow-y-auto">
                {versions.map(version => {
                  const versionRequests = changeRequests.filter(r => r.versionId === version.id);
                  const isApproved = version.status === 'approved';
                  
                  if (versionRequests.length === 0 && !isApproved) return null;

                  return (
                    <div key={version.id} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">
                          v{version.versionNumber}
                        </span>
                      </div>
                      
                      {isApproved && (
                        <div className="bg-green-50 text-green-800 p-3 rounded-lg text-sm border border-green-100 mb-4">
                          <strong className="block mb-1 flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Approved!</strong>
                          Next step: {version.nextStep?.replace('_', ' ')}
                          {version.approvalNotes && <p className="mt-2 text-green-700">{version.approvalNotes}</p>}
                        </div>
                      )}
                      
                      {versionRequests.length > 0 && (
                        <div className="space-y-2">
                          {versionRequests.map(req => (
                            <div key={req.id} className={`p-3 rounded-lg border ${req.completed ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                              <div className="flex justify-between items-start mb-1">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${req.isMajor ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                  {req.isMajor ? 'Important Fix' : 'Minor Tweak'}
                                </span>
                                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer hover:text-gray-900">
                                  <input 
                                    type="checkbox" 
                                    checked={req.completed}
                                    onChange={(e) => toggleChangeCompletion(req.id, e.target.checked)}
                                    className="rounded border-gray-300 text-black focus:ring-black"
                                  />
                                  Done
                                </label>
                              </div>
                              <p className={`text-sm mt-1 ${req.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{req.text}</p>
                              <div className="text-[10px] text-gray-400 mt-2 flex justify-between">
                                <span>{req.reviewerName}</span>
                                <span>{req.createdAt ? format(req.createdAt.toDate(), 'MMM d, h:mm a') : ''}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {changeRequests.length === 0 && !versions.some(v => v.status === 'approved') && (
                  <p className="text-sm text-gray-500 text-center py-4">No feedback received yet.</p>
                )}
              </div>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mt-8">Essential Elements</h2>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              {assets.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No assets uploaded by client.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {assets.map(asset => (
                    <a key={asset.id} href={asset.data} download={asset.fileName} className="block group relative border border-gray-200 rounded-lg overflow-hidden">
                      {asset.fileType.startsWith('image/') ? (
                        <img src={asset.data} alt={asset.fileName} className="w-full h-24 object-cover group-hover:opacity-75 transition-opacity" />
                      ) : (
                        <div className="w-full h-24 bg-gray-50 flex items-center justify-center group-hover:bg-gray-100 transition-colors">
                          <ImageIcon className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 truncate">
                        {asset.fileName}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
