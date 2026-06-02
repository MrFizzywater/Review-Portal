import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { ArrowLeft, Plus, Link as LinkIcon, Eye, CheckCircle, Clock, AlertCircle, ExternalLink, Image as ImageIcon, Settings, FileText, LayoutDashboard, Trash2, Save, Printer, Send, Edit2, ArrowUp, X, Download, Users, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { ThemeToggle } from '../components/ThemeToggle';
import { sendEmail } from '../lib/email';

function getDriveEmbedUrl(url: string) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('drive.google.com')) {
      // Handle folder links
      const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch && folderMatch[1]) {
        return `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
      }
      
      // Handle file links - convert to preview for better embedding
      const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        // Use /preview for embedding
        return `https://drive.google.com/file/d/${match[1]}/preview`;
      }
    }
  } catch (e) {
    // Ignore invalid URLs
  }
  return url;
}

function getDriveFileId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

interface InvoiceItem {
  description: string;
  details?: string;
  type: 'hourly' | 'item' | 'fixed';
  rate: number;
  quantity: number;
  amount: number;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null, 
      email: null
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

export default function ProjectDetails({ user }: { user: User }) {
  const { projectId } = useParams();
  const [project, setProject] = useState<any>(null);
  const [clientDetails, setClientDetails] = useState<any>(null);
  const [creatorProfile, setCreatorProfile] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [viewerSuggestions, setViewerSuggestions] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [isAddingVersion, setIsAddingVersion] = useState(false);
  const [isEditingDelivery, setIsEditingDelivery] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState<{ files: { label: string, link: string }[], notes: string, notifyClient: boolean }>({ 
    files: [{ label: '', link: '' }], 
    notes: '', 
    notifyClient: true 
  });
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [newVersion, setNewVersion] = useState({ driveLink: '', type: 'video', creatorNotes: '', notifyClient: true });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'invoice' | 'settings'>('overview');

  // Settings State
  const [editForm, setEditForm] = useState({ title: '', clientName: '', clientEmail: '', password: '', clientId: '' });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Invoice State
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<'draft' | 'sent' | 'paid'>('draft');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [googleToken, setGoogleToken] = useState<{ token: string, expiresAt: number } | null>(null);

  // Trigger Drive Auth and then File Picker
  const initiateDriveUpload = async (type: 'version' | 'final', index?: number) => {
    if (!creatorProfile?.googleClientId || !creatorProfile?.googleDriveFolderId) {
      alert("Please configure your Google Drive integration (Client ID and Folder ID) in Admin Settings first.");
      return;
    }

    // Check for cached token
    if (googleToken && googleToken.expiresAt > Date.now()) {
      openFilePicker(type, googleToken.token, index);
      return;
    }

    setIsAuthenticating(true);
    try {
      // @ts-ignore
      if (typeof google === 'undefined') {
        throw new Error("Google API library not loaded yet. Please refresh.");
      }

      // @ts-ignore
      const client = google.accounts.oauth2.initTokenClient({
        client_id: creatorProfile.googleClientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install',
        callback: (response: any) => {
          setIsAuthenticating(false);
          if (response.error) {
            console.error("Auth error:", response.error);
            alert("Authentication failed: " + (response.error_description || response.error));
            return;
          }
          
          const token = response.access_token;
          const expiresAt = Date.now() + (parseInt(response.expires_in) * 1000) - 60000; // Subtract 1 min for safety
          setGoogleToken({ token, expiresAt });
          
          openFilePicker(type, token, index);
        },
      });
      client.requestAccessToken();
    } catch (e) {
      console.error("GSI library error:", e);
      setIsAuthenticating(false);
      alert("Error: " + (e instanceof Error ? e.message : "Google library error"));
    }
  };

  const openFilePicker = (type: 'version' | 'final', token: string, index?: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        performDriveUpload(type, file, token, index);
      }
    };
    input.click();
  };

  const performDriveUpload = async (type: 'version' | 'final', file: File, token: string, index?: number) => {
    setIsUploadingToDrive(true);
    setUploadProgress(0);
    
    try {
      // 1. Get or create the folder structure: Root > Client Name > Project Title
      let targetFolderId = creatorProfile.googleDriveFolderId;
      
      const getOrCreateFolder = async (name: string, parentId: string) => {
        const query = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const searchResult = await searchRes.json();
        
        if (searchResult.files && searchResult.files.length > 0) {
          return searchResult.files[0].id;
        }
        
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
          })
        });
        const createResult = await createRes.json();
        return createResult.id;
      };

      // Check if project already has a folder ID that isn't the root folder itself
      if (project.googleFolderId && project.googleFolderId !== creatorProfile.googleDriveFolderId) {
        targetFolderId = project.googleFolderId;
      } else {
        // Create Client folder inside root
        const clientFolderName = project.clientName || 'Unassigned Clients';
        const clientFolderId = await getOrCreateFolder(clientFolderName, creatorProfile.googleDriveFolderId);
        
        // Create Project folder inside client folder
        const projectFolderName = project.title || 'Untitled Project';
        targetFolderId = await getOrCreateFolder(projectFolderName, clientFolderId);
        
        // Save this folder ID to the project for future use
        await updateDoc(doc(db, 'projects', projectId!), {
          googleFolderId: targetFolderId
        });
        setProject(prev => ({ ...prev, googleFolderId: targetFolderId }));
      }

      // 2. Initiate Resumable Upload Session
      const metadata = {
        name: file.name,
        mimeType: file.type || 'video/mp4',
        parents: [targetFolderId]
      };

      const sessionResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': file.type || 'video/mp4',
          'X-Upload-Content-Length': file.size.toString()
        },
        body: JSON.stringify(metadata)
      });

      if (!sessionResponse.ok) {
        throw new Error('Failed to initiate upload session');
      }

      const uploadUrl = sessionResponse.headers.get('Location');
      if (!uploadUrl) {
        throw new Error('No upload session URL received');
      }

      // 3. Upload file with Progress Tracking using XMLHttpRequest
      const resultId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percentComplete);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText);
            resolve(response.id);
          } else {
            console.error("Upload error response:", xhr.responseText);
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      // 4. Set permission to "anyone with link"
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${resultId}/permissions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        });
      } catch (permError) {
        console.warn("Could not set file permissions. Video might not load for all viewers.", permError);
      }

      // 5. Get links
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${resultId}?fields=webViewLink`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const fileResult = await fileRes.json();
      const driveLink = fileResult.webViewLink || `https://drive.google.com/open?id=${resultId}`;
      
      if (type === 'version') {
        setNewVersion(prev => ({ ...prev, driveLink }));
      } else if (type === 'final' && typeof index === 'number') {
        const newFiles = [...deliveryForm.files];
        newFiles[index] = { 
          ...newFiles[index], 
          link: driveLink,
          label: newFiles[index].label || file.name.split('.')[0]
        };
        setDeliveryForm(prev => ({ ...prev, files: newFiles }));
      }
      
      alert(`Success! "${file.name}" uploaded to Drive.`);
    } catch (error) {
      console.error("Drive upload error:", error);
      alert("Error: " + (error instanceof Error ? error.message : "Failed to upload file"));
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;

    const getTimestampMillis = (timestamp: any): number => {
      if (!timestamp) return 0;
      if (typeof timestamp.toMillis === 'function') {
        return timestamp.toMillis();
      }
      if (timestamp.seconds !== undefined) {
        return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds || 0) / 1000000);
      }
      return 0;
    };

    // User/Creator profile snapshot
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (userSnap) => {
      if (userSnap.exists()) {
        setCreatorProfile(userSnap.data());
      }
    }, (error) => {
      console.error("Error with creator profile snapshot:", error);
    });

    // Project snapshot
    const unsubProject = onSnapshot(doc(db, 'projects', projectId), async (docSnap) => {
      try {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as any;
          setProject(data);
          setEditForm({ 
            title: data.title || '', 
            clientName: data.clientName || '', 
            clientEmail: data.clientEmail || '', 
            password: data.password || '', 
            clientId: data.clientId || '' 
          });
          
          if (data.clientId) {
            const clientDoc = await getDoc(doc(db, 'clients', data.clientId));
            if (clientDoc.exists()) {
              setClientDetails({ id: clientDoc.id, ...clientDoc.data() });
            } else {
              setClientDetails(null);
            }
          } else {
            setClientDetails(null);
          }

          if (data.invoice) {
            setInvoiceItems(data.invoice.items || []);
            setInvoiceNumber(data.invoice.number || '');
            setInvoiceDate(data.invoice.date || format(new Date(), 'yyyy-MM-dd'));
            setInvoiceDueDate(data.invoice.dueDate || '');
            setInvoiceNotes(data.invoice.notes || '');
            setInvoiceStatus(data.invoice.status || 'draft');
            setAmountPaid(data.invoice.amountPaid || 0);
          }
        }
      } catch (error) {
        console.error("Error displaying project snapshot details:", error);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error("Error with project snapshot:", error);
      setLoading(false);
    });

    const qVersions = query(collection(db, 'versions'), where('projectId', '==', projectId));
    const unsubVersions = onSnapshot(qVersions, (snapshot) => {
      const vData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setVersions(vData.sort((a, b) => b.versionNumber - a.versionNumber));
    }, (error) => {
      console.error("Error with versions snapshot:", error);
    });

    const qRequests = query(collection(db, 'change_requests'), where('projectId', '==', projectId));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      const rData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setChangeRequests(rData.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)));
    }, (error) => {
      console.error("Error with change requests snapshot:", error);
    });

    const qAssets = query(collection(db, 'project_assets'), where('projectId', '==', projectId));
    const unsubAssets = onSnapshot(qAssets, (snapshot) => {
      const aData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAssets(aData.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)));
    }, (error) => {
      console.error("Error with project assets snapshot:", error);
    });

    const qSuggestions = query(collection(db, 'viewer_suggestions'), where('projectId', '==', projectId));
    const unsubSuggestions = onSnapshot(qSuggestions, (snapshot) => {
      const sData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setViewerSuggestions(sData.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)));
    }, (error) => {
      console.error("Error with viewer suggestions snapshot:", error);
    });

    const qClients = query(collection(db, 'clients'), where('creatorId', '==', user.uid));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error with clients snapshot:", error);
    });

    return () => {
      unsubProject();
      unsubUser();
      unsubVersions();
      unsubRequests();
      unsubAssets();
      unsubSuggestions();
      unsubClients();
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

  const saveFinalDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const deliveryData = {
        files: deliveryForm.files.filter(f => f.label && f.link),
        notes: deliveryForm.notes,
        createdAt: serverTimestamp()
      };
      await updateDoc(doc(db, 'projects', projectId!), {
        finalDelivery: deliveryData
      });
      setProject({ ...project, finalDelivery: { ...deliveryData, createdAt: { toDate: () => new Date() } } });
      setIsEditingDelivery(false);

      if (deliveryForm.notifyClient && project.clientEmail) {
        try {
          const clientUrl = `${window.location.origin}/p/${projectId}`;
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: project.clientEmail,
              subject: `Final Files Ready: ${project.title}`,
              html: `
                <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
                  <h2>Your final files are ready!</h2>
                  <p>The final deliverables for <strong>${project.title}</strong> have been uploaded and are ready for download.</p>
                  ${deliveryForm.notes ? `<p><strong>Notes:</strong><br/>${deliveryForm.notes}</p>` : ''}
                  <div style="margin-top: 30px;">
                    <a href="${clientUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Download Files</a>
                  </div>
                </div>
              `
            })
          });
        } catch (emailError) {
          console.error("Failed to send notification email", emailError);
          alert("Final delivery saved, but failed to send email notification.");
        }
      }
    } catch (error) {
      console.error("Error saving final delivery", error);
      alert("Failed to save final delivery");
    }
  };

  const addDeliveryFile = () => {
    setDeliveryForm({ ...deliveryForm, files: [...deliveryForm.files, { label: '', link: '' }] });
  };

  const updateDeliveryFile = (index: number, field: 'label' | 'link', value: string) => {
    const newFiles = [...deliveryForm.files];
    newFiles[index] = { ...newFiles[index], [field]: value };
    setDeliveryForm({ ...deliveryForm, files: newFiles });
  };

  const removeDeliveryFile = (index: number) => {
    setDeliveryForm({ ...deliveryForm, files: deliveryForm.files.filter((_, i) => i !== index) });
  };

  const toggleChangeCompletion = async (requestId: string, completed: boolean) => {
    await updateDoc(doc(db, 'change_requests', requestId), {
      completed
    });
  };

  const copyClientLink = (readOnly = false) => {
    const baseUrl = window.location.origin;
    let url = `${baseUrl}/p/${projectId}`;
    if (readOnly) url += '?mode=viewer';
    navigator.clipboard.writeText(url);
    alert(`${readOnly ? 'ReadOnly Viewer' : 'Client'} link copied to clipboard!\n\n` + url);
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const selectedClient = clients.find(c => c.id === editForm.clientId);
      const finalClientName = selectedClient ? selectedClient.name : editForm.clientName;
      const finalClientEmail = selectedClient ? selectedClient.email : editForm.clientEmail;

      await updateDoc(doc(db, 'projects', projectId!), {
        title: editForm.title,
        clientId: editForm.clientId,
        clientName: finalClientName,
        clientEmail: finalClientEmail,
        password: editForm.password
      });
      
      setProject({ ...project, title: editForm.title, clientId: editForm.clientId, clientName: finalClientName, clientEmail: finalClientEmail, password: editForm.password });
      
      if (editForm.clientId !== project.clientId) {
         if (editForm.clientId) {
           const clientDoc = await getDoc(doc(db, 'clients', editForm.clientId));
           if (clientDoc.exists()) setClientDetails({ id: clientDoc.id, ...clientDoc.data() });
         } else {
           setClientDetails(null);
         }
      }

      alert('Settings saved successfully');
    } catch (error) {
      console.error("Error saving settings", error);
      alert('Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const generateInvoiceNumber = async () => {
    try {
      const date = invoiceDate ? new Date(invoiceDate) : new Date();
      const prefix = format(date, 'yyMMdd');
      
      const q = query(collection(db, 'projects'), where('creatorId', '==', user.uid));
      const snapshot = await getDocs(q);
      
      let maxSequence = 0;
      snapshot.forEach(doc => {
        const inv = doc.data().invoice;
        if (inv && inv.number && inv.number.startsWith(prefix)) {
          // Check if it's the right format YYMMDDXX
          const seqStr = inv.number.substring(6);
          const seq = parseInt(seqStr);
          if (!isNaN(seq) && seq > maxSequence) {
            maxSequence = seq;
          }
        }
      });
      
      const nextSeq = (maxSequence + 1).toString().padStart(2, '0');
      setInvoiceNumber(`${prefix}${nextSeq}`);
    } catch (error) {
      console.error("Error generating invoice number", error);
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
        number: invoiceNumber,
        date: invoiceDate,
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
    setInvoiceItems([...invoiceItems, { description: '', details: '', type: 'fixed', rate: 0, quantity: 1, amount: 0 }]);
  };

  const updateInvoiceItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...invoiceItems];
    const item = { ...newItems[index], [field]: value };
    
    // Auto-calculate amount
    if (item.type === 'fixed') {
      item.amount = item.rate;
    } else {
      item.amount = item.rate * item.quantity;
    }
    
    newItems[index] = item;
    setInvoiceItems(newItems);
  };

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const handleDeleteVersion = async (id: string, versionNum: number) => {
    console.log("Delete function called for:", id, versionNum);
    
    try {
      setIsLoading(true);
      console.log("Proceeding with deletion of version:", id);
      
      const versionDocRef = doc(db, 'versions', id);
      let versionDoc;
      try {
        versionDoc = await getDoc(versionDocRef);
      } catch (err) {
        throw handleFirestoreError(err, OperationType.GET, `versions/${id}`);
      }
      
      if (!versionDoc.exists()) {
        setVersionToDelete(null);
        return;
      }
      
      const vData = versionDoc.data();
      const wasCurrent = vData?.isCurrent;

      const qReqs = query(collection(db, 'change_requests'), where('versionId', '==', id));
      let reqsSnap;
      try {
        reqsSnap = await getDocs(qReqs);
      } catch (err) {
        throw handleFirestoreError(err, OperationType.GET, 'change_requests');
      }
      
      if (reqsSnap.size > 0) {
        const deletePromises = reqsSnap.docs.map(d => deleteDoc(doc(db, 'change_requests', d.id)).catch(e => {
          throw handleFirestoreError(e, OperationType.DELETE, `change_requests/${d.id}`);
        }));
        await Promise.all(deletePromises);
      }
      
      try {
        await deleteDoc(versionDocRef);
      } catch (err) {
        throw handleFirestoreError(err, OperationType.DELETE, `versions/${id}`);
      }
      
      if (wasCurrent) {
        const qRemaining = query(collection(db, 'versions'), where('projectId', '==', projectId));
        const remSnap = await getDocs(qRemaining);
        const remDocs = remSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(v => v.id !== id)
          .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));

        if (remDocs.length > 0) {
          const next = remDocs[0];
          await updateDoc(doc(db, 'versions', next.id), { isCurrent: true }).catch(err => {
            throw handleFirestoreError(err, OperationType.UPDATE, `versions/${next.id}`);
          });
        }
      }
      
      setVersionToDelete(null);
      alert(`Version ${versionNum} deleted.`);
    } catch (error: any) {
      console.error("Critical error during version deletion:", error);
      alert(`Delete Failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const [isLoadingState, setIsLoading] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<{id: string, num: number} | null>(null);

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
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => copyClientLink(false)}
                className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors px-2 py-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 shadow-sm"
                title="Full access with feedback tools"
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Client Link</span>
              </button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-500 mx-1"></div>
              <button
                onClick={() => copyClientLink(true)}
                className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors px-2 py-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 shadow-sm"
                title="Viewer only, no feedback or invoice"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Viewer Link</span>
              </button>
            </div>
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

      {/* Deletion Confirmation Modal */}
      {versionToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-8 shadow-2xl border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Delete Version {versionToDelete.num}?</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                This will permanently remove this version and all associated feedback. This action cannot be undone.
              </p>
              
              <div className="flex flex-col w-full gap-3">
                <button 
                  onClick={() => {
                    console.log("Confirmed deletion for:", versionToDelete.id);
                    handleDeleteVersion(versionToDelete.id, versionToDelete.num);
                  }}
                  disabled={isLoadingState}
                  className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-200 dark:shadow-none transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoadingState ? (
                    <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    "Yes, Delete Permanently"
                  )}
                </button>
                <button 
                  onClick={() => {
                    console.log("Cancelled deletion");
                    setVersionToDelete(null);
                  }}
                  disabled={isLoadingState}
                  className="w-full py-3.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl font-bold transition-all active:scale-[0.98]"
                >
                  No, Keep It
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8 print:p-0">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:hidden">
            {/* Left Column: Versions */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Final Delivery Section */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-green-900 dark:text-green-400 flex items-center gap-2">
                    <CheckCircle className="w-6 h-6" /> Final Deliverables
                  </h2>
                  {!isEditingDelivery && (
                    <button
                      onClick={() => {
                        setDeliveryForm({
                          files: project.finalDelivery?.files || [{ label: 'Master Export', link: project.finalDelivery?.link || '' }],
                          notes: project.finalDelivery?.notes || '',
                          notifyClient: !project.finalDelivery
                        });
                        setIsEditingDelivery(true);
                      }}
                      className="text-green-700 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium text-sm flex items-center gap-1"
                    >
                      <Edit2 className="w-4 h-4" /> {project.finalDelivery ? 'Edit' : 'Add Final Files'}
                    </button>
                  )}
                </div>

                {isEditingDelivery ? (
                  <form onSubmit={saveFinalDelivery} className="space-y-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-green-100 dark:border-green-800">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Files to Provide</label>
                        <button type="button" onClick={addDeliveryFile} className="text-xs text-blue-600 flex items-center gap-1 font-bold">
                          <Plus className="w-3 h-3" /> Add Another File
                        </button>
                      </div>
                      {deliveryForm.files.map((file, index) => (
                        <div key={index} className="flex gap-2 items-start bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              required
                              value={file.label}
                              onChange={e => updateDeliveryFile(index, 'label', e.target.value)}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md outline-none dark:bg-gray-700 dark:text-white"
                              placeholder="File Label (e.g. Master Export)"
                            />
                            <input
                              type="url"
                              required
                              value={file.link}
                              onChange={e => updateDeliveryFile(index, 'link', e.target.value)}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md outline-none dark:bg-gray-700 dark:text-white"
                              placeholder="Download Link (Google Drive, etc.)"
                            />
                            <div className="flex flex-col gap-2">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  disabled={isUploadingToDrive}
                                  onClick={() => initiateDriveUpload('final', index)}
                                  className="text-[10px] bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded text-gray-500 font-bold flex items-center gap-1 disabled:opacity-50"
                                >
                                  <Upload className={`w-3 h-3 ${(isUploadingToDrive || isAuthenticating) ? 'animate-bounce' : ''}`} /> {isAuthenticating ? 'Signing in...' : isUploadingToDrive ? `Uploading (${uploadProgress}%)` : 'Upload to Drive'}
                                </button>
                              </div>
                              {isUploadingToDrive && uploadProgress > 0 && uploadProgress < 100 && (
                                <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-green-500 transition-all duration-300" 
                                    style={{ width: `${uploadProgress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          {deliveryForm.files.length > 1 && (
                            <button type="button" onClick={() => removeDeliveryFile(index)} className="p-1.5 text-gray-400 hover:text-red-500">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes / Instructions (Optional)</label>
                      <textarea
                        value={deliveryForm.notes}
                        onChange={e => setDeliveryForm({...deliveryForm, notes: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none h-24 dark:bg-gray-700 dark:text-white text-sm"
                        placeholder="e.g. Here are the final high-res exports..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="notifyClientDelivery"
                        checked={deliveryForm.notifyClient}
                        onChange={e => setDeliveryForm({...deliveryForm, notifyClient: e.target.checked})}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <label htmlFor="notifyClientDelivery" className="text-sm text-gray-700 dark:text-gray-300">
                        Send email notification to client
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingDelivery(false)}
                        className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
                      >
                        Save Final Files
                      </button>
                    </div>
                  </form>
                ) : project.finalDelivery ? (
                  <div className="space-y-4">
                    {project.finalDelivery.notes && (
                      <p className="text-green-800 dark:text-green-300 text-sm whitespace-pre-wrap bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg">
                        {project.finalDelivery.notes}
                      </p>
                    )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {project.finalDelivery.files?.map((file: any, i: number) => (
                          <a
                            key={i}
                            href={file.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 px-4 py-3 rounded-xl font-bold transition-all hover:shadow-md hover:border-green-400 group"
                          >
                            <span className="truncate text-green-900 dark:text-green-400">{file.label || 'Download File'}</span>
                            <Download className="w-5 h-5 text-green-600 group-hover:scale-110 transition-transform" />
                          </a>
                        ))}
                        {/* Fallback for old single link format */}
                        {!project.finalDelivery.files && project.finalDelivery.link && (
                          <a
                            href={project.finalDelivery.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-bold transition-colors shadow-sm"
                          >
                            <ArrowUp className="w-5 h-5 rotate-180" /> Download Files
                          </a>
                        )}
                      </div>
                    <p className="text-xs text-green-700/70 dark:text-green-400/70 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Added {project.finalDelivery.createdAt?.toDate ? format(project.finalDelivery.createdAt.toDate(), 'MMM d, yyyy h:mm a') : 'Just now'}
                    </p>
                  </div>
                ) : (
                  <p className="text-green-800/70 dark:text-green-300/70 text-sm">
                    No final files have been uploaded yet.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between mt-8">
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
                      <div className="flex gap-2">
                        <input
                          type="url"
                          required
                          value={newVersion.driveLink}
                          onChange={e => setNewVersion({...newVersion, driveLink: e.target.value})}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                          placeholder="https://drive.google.com/..."
                        />
                        <button
                          type="button"
                          disabled={isUploadingToDrive}
                          onClick={() => initiateDriveUpload('version')}
                          className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 flex items-center gap-2 text-xs font-bold disabled:opacity-50"
                        >
                          <Upload className={`w-4 h-4 ${(isUploadingToDrive || isAuthenticating) ? 'animate-bounce' : ''}`} /> {isAuthenticating ? 'Auth...' : isUploadingToDrive ? `${uploadProgress}%` : 'Drive'}
                        </button>
                      </div>
                      {isUploadingToDrive && (
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between text-[10px] text-gray-500 font-bold">
                            <span>Uploading to Google Drive...</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-600 transition-all duration-300" 
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
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
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("Trash clicked for current version");
                            setVersionToDelete({ id: currentVersion.id, num: currentVersion.versionNumber });
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-lg relative z-10"
                          title="Delete this version"
                        >
                          <Trash2 className="w-5 h-5 pointer-events-none" />
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
                    
                    {/* Fallback overlay for browser blocking cookies */}
                    <div className="absolute bottom-4 right-4 flex gap-2">
                       <a 
                        href={currentVersion.driveLink} 
                        target="_blank" 
                        rel="noreferrer"
                        className="bg-black/80 hover:bg-black text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 backdrop-blur-sm transition-all"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open in Drive
                      </a>
                    </div>
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
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log("Trash clicked for history version");
                              setVersionToDelete({ id: version.id, num: version.versionNumber });
                            }}
                            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-lg relative z-10"
                            title="Delete this version"
                          >
                            <Trash2 className="w-5 h-5 pointer-events-none" />
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

              <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" /> Stakeholder Input
              </h2>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-colors">
                <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                  {versions.map(version => {
                    const versionSuggestions = viewerSuggestions.filter(s => s.versionId === version.id);
                    if (versionSuggestions.length === 0) return null;

                    return (
                      <div key={version.id} className="border-b border-gray-100 dark:border-gray-700 pb-6 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-bold bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded text-blue-600 dark:text-blue-400">
                            v{version.versionNumber} Stakeholders
                          </span>
                        </div>
                        <div className="space-y-3">
                          {versionSuggestions.map(suggestion => (
                            <div key={suggestion.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700 relative group overflow-hidden">
                              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed italic">"{suggestion.suggestion}"</p>
                              <div className="mt-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-[9px] font-bold text-blue-600 dark:text-blue-400">
                                    {suggestion.viewerName.charAt(0)}
                                  </div>
                                  <div className="truncate">
                                    <p className="text-[10px] font-bold text-gray-900 dark:text-white leading-none">{suggestion.viewerName}</p>
                                    <p className="text-[9px] text-gray-500 dark:text-gray-500">{suggestion.viewerEmail}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[9px] text-gray-400">
                                    {suggestion.createdAt ? format(suggestion.createdAt.toDate(), 'MMM d, h:mm a') : ''}
                                  </span>
                                  <button 
                                    onClick={async () => {
                                      if (window.confirm('Delete this stakeholder suggestion?')) {
                                        await deleteDoc(doc(db, 'viewer_suggestions', suggestion.id));
                                      }
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {viewerSuggestions.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No suggestions from stakeholders yet.</p>
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
                  {invoiceNumber && <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-1">Invoice #: {invoiceNumber}</p>}
                  {invoiceDate && <p className="text-sm text-gray-600 dark:text-gray-400">Date: {format(new Date(invoiceDate), 'MMM d, yyyy')}</p>}
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
                  <p className="font-bold text-gray-900 dark:text-white">{clientDetails?.name || project.clientName}</p>
                  {clientDetails?.contactPerson && <p className="text-sm text-gray-600 dark:text-gray-400">{clientDetails.contactPerson}</p>}
                  {clientDetails?.street && <p className="text-sm text-gray-600 dark:text-gray-400">{clientDetails.street}</p>}
                  {(clientDetails?.city || clientDetails?.state || clientDetails?.zip) && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {[clientDetails.city, clientDetails.state, clientDetails.zip].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {clientDetails?.country && <p className="text-sm text-gray-600 dark:text-gray-400">{clientDetails.country}</p>}
                  {!clientDetails?.street && clientDetails?.address && <p className="text-sm text-gray-600 dark:text-gray-400">{clientDetails.address}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Due Date</p>
                  <p className="font-bold text-gray-900 dark:text-white">{invoiceDueDate ? format(new Date(invoiceDueDate), 'MMM d, yyyy') : 'Receipt'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Number</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={e => setInvoiceNumber(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                      placeholder="e.g. 24050601"
                    />
                    <button 
                      onClick={generateInvoiceNumber}
                      title="Auto-generate number"
                      className="px-2 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
                    >
                      <ArrowUp className="w-4 h-4 rotate-90" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                  />
                </div>
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
                  {/* Table Header */}
                  <div className="flex border-b border-gray-200 dark:border-gray-700 pb-2 mb-2 font-bold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 px-2">
                    <div className="flex-1">Description</div>
                    <div className="w-24 px-2">Type</div>
                    <div className="w-24 px-2 text-right">Rate</div>
                    <div className="w-16 px-2 text-center">Qty</div>
                    <div className="w-28 text-right pr-2">Amount</div>
                    <div className="w-10 print:hidden"></div>
                  </div>

                  {invoiceItems.map((item, index) => (
                    <div key={index} className="flex flex-col gap-2 print:border-b print:border-gray-100 print:py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg py-2 transition-colors group">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => updateInvoiceItem(index, 'description', e.target.value)}
                            placeholder="Description (e.g. Video Production)"
                            className="w-full px-2 py-1 border-none focus:ring-1 focus:ring-black dark:focus:ring-white rounded outline-none bg-transparent dark:text-white text-sm font-bold"
                          />
                        </div>
                        <div className="w-24">
                          <select
                            value={item.type}
                            onChange={e => updateInvoiceItem(index, 'type', e.target.value as any)}
                            className="w-full px-1 py-1 border-none bg-transparent text-sm outline-none cursor-pointer focus:ring-1 focus:ring-black dark:focus:ring-white rounded dark:text-gray-300"
                          >
                            <option value="fixed">Fixed</option>
                            <option value="hourly">Hourly</option>
                            <option value="item">Per Item</option>
                          </select>
                        </div>
                        <div className="w-24 relative">
                          <span className="absolute left-1 top-1 text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            value={item.rate}
                            onChange={e => updateInvoiceItem(index, 'rate', parseFloat(e.target.value) || 0)}
                            className="w-full pl-3 pr-1 py-1 border-none bg-transparent text-right text-sm outline-none focus:ring-1 focus:ring-black dark:focus:ring-white rounded dark:text-white font-mono"
                          />
                        </div>
                        <div className="w-16">
                          <input
                            type="number"
                            disabled={item.type === 'fixed'}
                            value={item.quantity}
                            onChange={e => updateInvoiceItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className={`w-full px-1 py-1 border-none bg-transparent text-center text-sm outline-none focus:ring-1 focus:ring-black dark:focus:ring-white rounded dark:text-white ${item.type === 'fixed' ? 'opacity-20' : ''}`}
                          />
                        </div>
                        <div className="w-28 text-right font-bold text-sm pt-1 pr-2 dark:text-white">
                          ${item.amount.toFixed(2)}
                        </div>
                        <button onClick={() => removeInvoiceItem(index)} className="w-10 p-1 text-gray-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 print:hidden">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="px-2">
                        <textarea
                          placeholder="Additional details (optional)"
                          value={item.details || ''}
                          onChange={e => updateInvoiceItem(index, 'details', e.target.value)}
                          className="w-full px-2 py-1 text-xs border-none bg-transparent dark:text-gray-400 outline-none focus:ring-1 focus:ring-black dark:focus:ring-white rounded resize-none h-10 italic"
                        />
                      </div>
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client</label>
                <select
                  value={editForm.clientId}
                  onChange={e => setEditForm({...editForm, clientId: e.target.value, clientName: ''})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white mb-2"
                >
                  <option value="">Select a client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {!editForm.clientId && (
                  <input
                    type="text"
                    required={!editForm.clientId}
                    value={editForm.clientName}
                    onChange={e => setEditForm({...editForm, clientName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white outline-none dark:bg-gray-700 dark:text-white"
                    placeholder="Or type new client name"
                  />
                )}
              </div>
              {!editForm.clientId && (
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
              )}
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
