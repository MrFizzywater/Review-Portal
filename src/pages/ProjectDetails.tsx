import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { ArrowLeft, Plus, Link as LinkIcon, Eye, CheckCircle, Clock, AlertCircle, ExternalLink, Image as ImageIcon, Settings, FileText, LayoutDashboard, Trash2, Save, Printer, Send, Edit2, ArrowUp } from 'lucide-react';
import { format } from 'date-fns';
import { ThemeToggle } from '../components/ThemeToggle';
import { sendEmail } from '../lib/email';

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

interface InvoiceItem {
  description: string;
  amount: number;
}

export default function ProjectDetails({ user }: { user: User }) {
  const { projectId } = useParams();
  const [project, setProject] = useState<any>(null);
  const [creatorProfile, setCreatorProfile] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [isAddingVersion, setIsAddingVersion] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [newVersion, setNewVersion] = useState({ driveLink: '', type: 'video', creatorNotes: '', notifyClient: true });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'invoice' | 'settings'>('overview');

  // Settings State
  const [editForm, setEditForm] = useState({ title: '', clientName: '', clientEmail: '', password: '' });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Invoice State
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<'draft' | 'sent' | 'paid'>('draft');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        setCreatorProfile(userDoc.data());
      }

      const docRef = doc(db, 'projects', projectId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as any;
        setProject(data);
        setEditForm({ title: data.title || '', clientName: data.clientName || '', clientEmail: data.clientEmail || '', password: data.password || '' });
        
        if (data.invoice) {
          setInvoiceItems(data.invoice.items || []);
          setInvoiceDueDate(data.invoice.dueDate || '');
          setInvoiceNotes(data.invoice.notes || '');
          setInvoiceStatus(data.invoice.status || 'draft');
          setAmountPaid(data.invoice.amountPaid || 0);
        }
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
    
    if (editingVersionId) {
      try {
        await updateDoc(doc(db, 'versions', editingVersionId), {
          driveLink: newVersion.driveLink,
          type: newVersion.type,
          creatorNotes: newVersion.creatorNotes
        });
        setIsAddingVersion(false);
        setEditingVersionId(null);
        setNewVersion({ driveLink: '', type: 'video', creatorNotes: '', notifyClient: true });
      } catch (error) {
        console.error("Error updating version", error);
      }
      return;
    }

    const nextVersionNumber = versions.length > 0 ? versions[0].versionNumber + 1 : 1;
    
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

      if (newVersion.notifyClient && project.clientEmail) {
        try {
          const clientUrl = `${window.location.origin}/p/${projectId}`;
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: project.clientEmail,
              subject: `New Version Available: ${project.title}`,
              html: `
                <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
                  <h2>A new version is ready for review!</h2>
                  <p>Version ${nextVersionNumber} of <strong>${project.title}</strong> has been uploaded.</p>
                  ${newVersion.creatorNotes ? `<p><strong>Notes from creator:</strong><br/>${newVersion.creatorNotes}</p>` : ''}
                  <div style="margin-top: 30px;">
                    <a href="${clientUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Project</a>
                  </div>
                </div>
              `
            })
          });
        } catch (emailError) {
          console.error("Failed to send notification email", emailError);
          alert("Version added, but failed to send email notification.");
        }
      }

      setIsAddingVersion(false);
      setNewVersion({ driveLink: '', type: 'video', creatorNotes: '', notifyClient: true });
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
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/p/${projectId}`;
    navigator.clipboard.writeText(url);
    alert('Client link copied to clipboard!\n\n' + url);
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await updateDoc(doc(db, 'projects', projectId!), {
        title: editForm.title,
        clientName: editForm.clientName,
        clientEmail: editForm.clientEmail,
        password: editForm.password
      });
      setProject({ ...project, ...editForm });
      alert('Settings saved successfully');
    } catch (error) {
      console.error("Error saving settings", error);
      alert('Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const saveInvoice = async () => {
    setIsSavingInvoice(true);
    try {
      const subtotal = invoiceItems.reduce((sum, item) => sum + Number(item.amount), 0);
      const taxRate = creatorProfile?.taxRate || 0;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      const invoiceData = {
        items: invoiceItems,
        dueDate: invoiceDueDate,
        notes: invoiceNotes,
        status: invoiceStatus,
        amountPaid,
        subtotal,
        taxRate,
        taxAmount,
        total
      };
      await updateDoc(doc(db, 'projects', projectId!), {
        invoice: invoiceData
      });
      setProject({ ...project, invoice: invoiceData });
      alert('Invoice saved successfully');
    } catch (error) {
      console.error("Error saving invoice", error);
      alert('Failed to save invoice');
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const sendInvoiceEmail = async () => {
    if (!project.clientEmail) {
      alert("Please set a client email in the project settings first.");
      return;
    }

    try {
      const clientUrl = `${window.location.origin}/p/${projectId}`;
      await sendEmail(
        project.clientEmail,
        `Invoice for ${project.title}`,
        `
          <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
            <h2>Your invoice is ready</h2>
            <p>An invoice for <strong>${project.title}</strong> has been generated.</p>
            <p><strong>Total Due:</strong> $${(invoiceTotal - amountPaid).toFixed(2)}</p>
            ${invoiceDueDate ? `<p><strong>Due Date:</strong> ${format(new Date(invoiceDueDate), 'MMM d, yyyy')}</p>` : ''}
            <div style="margin-top: 30px;">
              <a href="${clientUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View & Pay Invoice</a>
            </div>
          </div>
        `
      );
      
      // Update status to sent
      setInvoiceStatus('sent');
      await updateDoc(doc(db, 'projects', projectId!), {
        'invoice.status': 'sent'
      });
      setProject({ ...project, invoice: { ...project.invoice, status: 'sent' } });
      
      alert('Invoice sent to client successfully!');
    } catch (error) {
      console.error("Error sending invoice email", error);
      alert("Failed to send invoice email.");
    }
  };

  const addInvoiceItem = () => {
    setInvoiceItems([...invoiceItems, { description: '', amount: 0 }]);
  };

  const updateInvoiceItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...invoiceItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setInvoiceItems(newItems);
  };

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const handleDeleteVersion = async (id: string) => {
    if (confirm('Are you sure you want to delete this version?')) {
      try {
        // If we delete the current version, we should probably make the previous one current
        const versionToDelete = versions.find(v => v.id === id);
        await deleteDoc(doc(db, 'versions', id));
        
        if (versionToDelete?.isCurrent && versions.length > 1) {
          const previousVersion = versions.find(v => v.id !== id);
          if (previousVersion) {
            await updateDoc(doc(db, 'versions', previousVersion.id), { isCurrent: true });
          }
        }
      } catch (error) {
        console.error("Error deleting version", error);
      }
    }
  };

  const currentVersion = versions.find(v => v.isCurrent);
  const currentRequests = changeRequests.filter(r => r.versionId === currentVersion?.id);
  const allChangesCompleted = currentRequests.length > 0 && currentRequests.every(r => r.completed);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!project) return <div className="p-8">Project not found</div>;

  const invoiceSubtotal = invoiceItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const invoiceTaxRate = creatorProfile?.taxRate || 0;
  const invoiceTaxAmount = invoiceSubtotal * (invoiceTaxRate / 100);
  const invoiceTotal = invoiceSubtotal + invoiceTaxAmount;
  const invoiceBalanceDue = invoiceTotal - amountPaid;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors pb-12">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 print:hidden transition-colors">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-bold text-gray-900 dark:text-white">{project.title}</h1>
            <span className="text-sm text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md hidden sm:inline-block">
              {project.clientName}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              onClick={copyClientLink}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg"
            >
              <LinkIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Copy Client Link</span>
            </button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 flex gap-6 border-t border-gray-100 dark:border-gray-700 print:hidden">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'overview' ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <LayoutDashboard className="w-4 h-4" /> Overview
          </button>
          <button 
            onClick={() => setActiveTab('invoice')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'invoice' ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <FileText className="w-4 h-4" /> Invoice
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'settings' ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Settings className="w-4 h-4" /> Settings
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 print:p-0">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:hidden">
            {/* Left Column: Versions */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Versions</h2>
                  {currentVersion?.status === 'changes_requested' && allChangesCompleted && (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium animate-pulse">
                      <ArrowUp className="w-4 h-4" />
                      Ready for new version!
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditingVersionId(null);
                    setNewVersion({ driveLink: '', type: 'video', creatorNotes: '', notifyClient: true });
                    setIsAddingVersion(true);
                  }}
                  className="bg-black dark:bg-white text-white dark:text-black px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Version
                </button>
              </div>

              {isAddingVersion && (
                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-4">{editingVersionId ? 'Edit Version' : 'New Version'}</h3>
                  <form onSubmit={handleAddVersion} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Google Drive Link</label>
                      <input
                        type="url"
                        required
                        value={newVersion.driveLink}
                        onChange={e => setNewVersion({...newVersion, driveLink: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                        placeholder="https://drive.google.com/..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                      <select
                        value={newVersion.type}
                        onChange={e => setNewVersion({...newVersion, type: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                      >
                        <option value="video">Video</option>
                        <option value="photo">Photo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes for Client</label>
                      <textarea
                        value={newVersion.creatorNotes}
                        onChange={e => setNewVersion({...newVersion, creatorNotes: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none h-24 dark:bg-gray-700 dark:text-white"
                        placeholder="What changed in this version?"
                      />
                    </div>
                    {!editingVersionId && project.clientEmail && (
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={newVersion.notifyClient}
                            onChange={e => setNewVersion({...newVersion, notifyClient: e.target.checked})}
                            className="rounded border-gray-300 dark:border-gray-600 text-black focus:ring-black dark:bg-gray-700"
                          />
                          Notify client via email ({project.clientEmail})
                        </label>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => {
                        setIsAddingVersion(false);
                        setEditingVersionId(null);
                      }} className="px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
                      <button type="submit" className="px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">{editingVersionId ? 'Save Changes' : 'Upload Version'}</button>
                    </div>
                  </form>
                </div>
              )}

              {currentVersion && (
                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-black dark:border-white shadow-md transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <span className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold px-2.5 py-1 rounded-md text-sm">
                        v{currentVersion.versionNumber}
                      </span>
                      <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs font-medium px-2 py-0.5 rounded-full">Current</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {currentVersion.createdAt ? format(currentVersion.createdAt.toDate(), 'MMM d, h:mm a') : 'Just now'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {currentVersion.status === 'pending' && <span className="text-yellow-600 dark:text-yellow-500 text-sm flex items-center gap-1"><Eye className="w-4 h-4"/> Pending Review</span>}
                      {currentVersion.status === 'approved' && <span className="text-green-600 dark:text-green-400 text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Approved</span>}
                      {currentVersion.status === 'changes_requested' && !allChangesCompleted && <span className="text-red-600 dark:text-red-400 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Changes Requested</span>}
                      {currentVersion.status === 'changes_requested' && allChangesCompleted && <span className="text-green-600 dark:text-green-400 text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Changes Complete</span>}
                      
                      <div className="flex gap-1 ml-2 border-l border-gray-200 dark:border-gray-700 pl-2">
                        <button 
                          onClick={() => {
                            setEditingVersionId(currentVersion.id);
                            setNewVersion({
                              driveLink: currentVersion.driveLink,
                              type: currentVersion.type || 'video',
                              creatorNotes: currentVersion.creatorNotes || '',
                              notifyClient: false
                            });
                            setIsAddingVersion(true);
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteVersion(currentVersion.id)}
                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-100 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-4 relative" style={{ paddingTop: '56.25%' }}>
                    <iframe
                      src={getDriveEmbedUrl(currentVersion.driveLink)}
                      className="absolute top-0 left-0 w-full h-full border-0"
                      allow="autoplay"
                      allowFullScreen
                    ></iframe>
                  </div>
                  
                  {currentVersion.creatorNotes && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-600">
                      <span className="font-medium block mb-1 text-gray-900 dark:text-white">Your notes:</span>
                      {currentVersion.creatorNotes}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {versions.filter(v => !v.isCurrent).map(version => (
                  <div key={version.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 opacity-75 hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <span className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold px-2.5 py-1 rounded-md text-sm">
                          v{version.versionNumber}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {version.createdAt ? format(version.createdAt.toDate(), 'MMM d, h:mm a') : 'Just now'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {version.status === 'pending' && <span className="text-yellow-600 dark:text-yellow-500 text-sm flex items-center gap-1"><Eye className="w-4 h-4"/> Pending Review</span>}
                        {version.status === 'approved' && <span className="text-green-600 dark:text-green-400 text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Approved</span>}
                        {version.status === 'changes_requested' && <span className="text-red-600 dark:text-red-400 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Changes Requested</span>}
                        
                        <div className="flex gap-1 ml-2 border-l border-gray-200 dark:border-gray-700 pl-2">
                          <button 
                            onClick={() => {
                              setEditingVersionId(version.id);
                              setNewVersion({
                                driveLink: version.driveLink,
                                type: version.type || 'video',
                                creatorNotes: version.creatorNotes || '',
                                notifyClient: false
                              });
                              setIsAddingVersion(true);
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteVersion(version.id)}
                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <a href={getDriveEmbedUrl(version.driveLink)} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium flex items-center gap-1 mb-3">
                      <ExternalLink className="w-4 h-4" /> View Content
                    </a>
                    
                    {version.creatorNotes && (
                      <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-600">
                        <span className="font-medium block mb-1 text-gray-900 dark:text-white">Your notes:</span>
                        {version.creatorNotes}
                      </div>
                    )}
                  </div>
                ))}
                {versions.length === 0 && !isAddingVersion && (
                  <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                    <p className="text-gray-500 dark:text-gray-400">No versions uploaded yet.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Feedback & Assets */}
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Client Feedback</h2>
              
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-colors">
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Revisions Used</span>
                  <span className="font-bold text-gray-900 dark:text-white">{versions.length > 0 ? versions.length - 1 : 0} / {project.maxRevisions}</span>
                </div>
                
                <div className="p-4 space-y-6 max-h-[600px] overflow-y-auto">
                  {versions.map(version => {
                    const versionRequests = changeRequests.filter(r => r.versionId === version.id);
                    const isApproved = version.status === 'approved';
                    
                    if (versionRequests.length === 0 && !isApproved) return null;

                    return (
                      <div key={version.id} className="border-b border-gray-100 dark:border-gray-700 pb-6 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-bold bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                            v{version.versionNumber}
                          </span>
                        </div>
                        
                        {isApproved && (
                          <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400 p-3 rounded-lg text-sm border border-green-100 dark:border-green-900/30 mb-4">
                            <strong className="block mb-1 flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Approved!</strong>
                            Next step: {version.nextStep?.replace('_', ' ')}
                            {version.approvalNotes && <p className="mt-2 text-green-700 dark:text-green-500">{version.approvalNotes}</p>}
                          </div>
                        )}
                        
                        {versionRequests.length > 0 && (
                          <div className="space-y-2">
                            {versionRequests.map(req => (
                              <div key={req.id} className={`p-3 rounded-lg border ${req.completed ? 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm'}`}>
                                <div className="flex justify-between items-start mb-1">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${req.isMajor ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'}`}>
                                    {req.isMajor ? 'Important Fix' : 'Minor Tweak'}
                                  </span>
                                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white">
                                    <input 
                                      type="checkbox" 
                                      checked={req.completed}
                                      onChange={(e) => toggleChangeCompletion(req.id, e.target.checked)}
                                      className="rounded border-gray-300 dark:border-gray-600 text-black dark:text-white focus:ring-black dark:focus:ring-white dark:bg-gray-700"
                                    />
                                    Done
                                  </label>
                                </div>
                                <p className={`text-sm mt-1 ${req.completed ? 'text-gray-500 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-200'}`}>{req.text}</p>
                                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 flex justify-between">
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No feedback received yet.</p>
                  )}
                </div>
              </div>

              <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8">Essential Elements</h2>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 transition-colors">
                {assets.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No assets uploaded by client.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {assets.map(asset => (
                      <a key={asset.id} href={asset.data} download={asset.fileName} className="block group relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        {asset.fileType.startsWith('image/') ? (
                          <img src={asset.data} alt={asset.fileName} className="w-full h-24 object-cover group-hover:opacity-75 transition-opacity" />
                        ) : (
                          <div className="w-full h-24 bg-gray-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-gray-100 dark:group-hover:bg-gray-600 transition-colors">
                            <ImageIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
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
        )}

        {activeTab === 'invoice' && (
          <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 md:p-8 print:shadow-none print:border-none print:p-0 transition-colors">
            <div className="flex justify-between items-center mb-6 print:hidden">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice Generator</h2>
                <p className="text-gray-500 dark:text-gray-400">Attach an invoice to the client portal.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
                <select
                  value={invoiceStatus}
                  onChange={e => setInvoiceStatus(e.target.value as any)}
                  className={`px-3 py-1.5 rounded-lg font-medium text-sm border outline-none ${
                    invoiceStatus === 'draft' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600' :
                    invoiceStatus === 'sent' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' :
                    'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                  }`}
                >
                  <option value="draft">Draft (Hidden)</option>
                  <option value="sent">Sent (Visible to Client)</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            {/* Print Only Header */}
            <div className="hidden print:block mb-8">
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
                  <p className="font-bold text-gray-900 dark:text-white">{invoiceDueDate ? format(new Date(invoiceDueDate), 'MMM d, yyyy') : 'Receipt'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 print:hidden">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={invoiceDueDate}
                    onChange={e => setInvoiceDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2 print:hidden">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Line Items</label>
                  <button onClick={addInvoiceItem} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </div>
                
                <div className="space-y-3 print:space-y-0">
                  {/* Print Table Header */}
                  <div className="hidden print:flex border-b border-gray-300 dark:border-gray-700 pb-2 mb-2 font-bold text-gray-900 dark:text-white">
                    <div className="flex-1">Description</div>
                    <div className="w-32 text-right">Amount</div>
                  </div>

                  {invoiceItems.map((item, index) => (
                    <div key={index} className="flex gap-3 items-start print:border-b print:border-gray-100 print:py-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={e => updateInvoiceItem(index, 'description', e.target.value)}
                        placeholder="Description (e.g. Video Editing)"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none print:border-none print:p-0 print:bg-transparent dark:bg-gray-700 dark:text-white"
                      />
                      <div className="relative w-32 print:text-right">
                        <span className="absolute left-3 top-2.5 text-gray-500 dark:text-gray-400 print:hidden">$</span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={e => updateInvoiceItem(index, 'amount', parseFloat(e.target.value) || 0)}
                          className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none print:border-none print:p-0 print:bg-transparent print:text-right dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      <button onClick={() => removeInvoiceItem(index)} className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors print:hidden">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  {invoiceItems.length === 0 && (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 text-sm print:hidden">
                      No items added yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end border-t border-gray-100 dark:border-gray-700 pt-4 mt-4">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Subtotal</span>
                    <span>${invoiceSubtotal.toFixed(2)}</span>
                  </div>
                  {invoiceTaxRate > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Tax ({invoiceTaxRate}%)</span>
                      <span>${invoiceTaxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-100 dark:border-gray-700">
                    <span>Total</span>
                    <span>${invoiceTotal.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center pt-4 print:hidden">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Amount Paid</span>
                    <div className="flex items-center gap-2">
                      <div className="relative w-24">
                        <span className="absolute left-2 top-1.5 text-gray-500 dark:text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          value={amountPaid}
                          onChange={e => setAmountPaid(parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 pr-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm outline-none focus:ring-1 focus:ring-black dark:focus:ring-white dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 print:hidden">
                    <button onClick={() => setAmountPaid(invoiceTotal / 2)} className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded font-medium dark:text-gray-300">Half</button>
                    <button onClick={() => setAmountPaid(invoiceTotal)} className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded font-medium dark:text-gray-300">All</button>
                  </div>

                  <div className="flex justify-between text-gray-600 dark:text-gray-400 print:flex hidden">
                    <span>Amount Paid</span>
                    <span>${amountPaid.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-xl font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span>Balance Due</span>
                    <span className={invoiceBalanceDue <= 0 ? 'text-green-600 dark:text-green-400' : ''}>${invoiceBalanceDue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 print:hidden">Notes / Payment Terms</label>
                <textarea
                  value={invoiceNotes}
                  onChange={e => setInvoiceNotes(e.target.value)}
                  placeholder="e.g. Please pay via bank transfer to..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none h-24 print:border-none print:p-0 print:bg-transparent print:resize-none dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="flex justify-end pt-4 print:hidden gap-3">
                <button
                  onClick={sendInvoiceEmail}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Send to Client
                </button>
                <button
                  onClick={saveInvoice}
                  disabled={isSavingInvoice}
                  className="bg-black dark:bg-white text-white dark:text-black px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSavingInvoice ? 'Saving...' : 'Save Invoice'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 md:p-8 print:hidden transition-colors">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Project Settings</h2>
            <form onSubmit={saveSettings} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Title</label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={e => setEditForm({...editForm, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Name</label>
                <input
                  type="text"
                  required
                  value={editForm.clientName}
                  onChange={e => setEditForm({...editForm, clientName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Email (for notifications)</label>
                <input
                  type="email"
                  value={editForm.clientEmail}
                  onChange={e => setEditForm({...editForm, clientEmail: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                  placeholder="client@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Password</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={editForm.password}
                    onChange={e => setEditForm({...editForm, password: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none font-mono dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This is the password the client uses to log in.</p>
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="bg-black dark:bg-white text-white dark:text-black px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSavingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}
