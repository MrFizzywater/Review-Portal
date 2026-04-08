import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, signOut } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { Plus, Folder, LogOut, ExternalLink, Settings, Copy, Users, Edit2, Trash2, CopyPlus } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';

interface Project {
  id: string;
  title: string;
  clientName: string;
  clientId?: string;
  maxRevisions: number;
  password?: string;
  createdAt: any;
}

interface Client {
  id: string;
  name: string;
  company?: string;
  contactPerson?: string;
  email: string;
  phone: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  url?: string;
  logoUrl: string;
  creatorId: string;
  createdAt: any;
}

export default function CreatorDashboard({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<'projects' | 'clients'>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProject, setNewProject] = useState({ title: '', clientId: '', clientName: '', password: '', maxRevisions: 3 });

  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({ 
    name: '', company: '', contactPerson: '', email: '', phone: '', 
    address: '', street: '', city: '', state: '', zip: '', country: '', url: '', logoUrl: '' 
  });

  useEffect(() => {
    const qProjects = query(collection(db, 'projects'), where('creatorId', '==', user.uid));
    const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
      const projData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
    });

    const qClients = query(collection(db, 'clients'), where('creatorId', '==', user.uid));
    const unsubscribeClients = onSnapshot(qClients, (snapshot) => {
      const clientData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(clientData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
    });

    return () => {
      unsubscribeProjects();
      unsubscribeClients();
    };
  }, [user.uid]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedClient = clients.find(c => c.id === newProject.clientId);
      const clientName = selectedClient ? selectedClient.name : newProject.clientName;
      const clientEmail = selectedClient ? selectedClient.email : '';

      await addDoc(collection(db, 'projects'), {
        ...newProject,
        clientName,
        clientEmail,
        creatorId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsCreatingProject(false);
      setNewProject({ title: '', clientId: '', clientName: '', password: '', maxRevisions: 3 });
    } catch (error) {
      console.error("Error creating project", error);
      alert("Failed to create project");
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), clientForm);
      } else {
        await addDoc(collection(db, 'clients'), {
          ...clientForm,
          creatorId: user.uid,
          createdAt: serverTimestamp()
        });
      }
      setIsCreatingClient(false);
      setEditingClient(null);
      setClientForm({ 
        name: '', company: '', contactPerson: '', email: '', phone: '', 
        address: '', street: '', city: '', state: '', zip: '', country: '', url: '', logoUrl: '' 
      });
    } catch (error) {
      console.error("Error saving client", error);
      alert("Failed to save client");
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (confirm('Are you sure you want to delete this client?')) {
      try {
        await deleteDoc(doc(db, 'clients', id));
      } catch (error) {
        console.error("Error deleting client", error);
        alert("Failed to delete client");
      }
    }
  };

  const copyAccess = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    const url = `${window.location.origin}/p/${project.id}`;
    const text = `Here is the link to review your project:\n\nLink: ${url}\nPassword: ${project.password}`;
    navigator.clipboard.writeText(text);
    alert('Link and password copied to clipboard!');
  };

  const handleDuplicateProject = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    setNewProject({
      title: `${project.title} (Copy)`,
      clientId: project.clientId || '',
      clientName: project.clientName || '',
      password: project.password || '',
      maxRevisions: project.maxRevisions || 3
    });
    setIsCreatingProject(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center">
              <Folder className="w-4 h-4 text-white dark:text-black" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white">Review Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link to="/settings" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white flex items-center gap-1">
              <Settings className="w-4 h-4" />
              Settings
            </Link>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400 hidden sm:inline">{user.email}</span>
            <button onClick={() => signOut(auth)} className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 flex gap-6 border-t border-gray-100 dark:border-gray-700">
          <button 
            onClick={() => setActiveTab('projects')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'projects' ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Folder className="w-4 h-4" /> Projects
          </button>
          <button 
            onClick={() => setActiveTab('clients')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'clients' ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Users className="w-4 h-4" /> Clients
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {activeTab === 'projects' && (
          <>
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Your Projects</h1>
              <button
                onClick={() => setIsCreatingProject(true)}
                className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Project
              </button>
            </div>

            {isCreatingProject && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8 transition-colors">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Create New Project</h2>
                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Title</label>
                      <input
                        type="text"
                        required
                        value={newProject.title}
                        onChange={e => setNewProject({...newProject, title: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                        placeholder="e.g. Summer Campaign Video"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client</label>
                      {clients.length > 0 ? (
                        <select
                          value={newProject.clientId}
                          onChange={e => setNewProject({...newProject, clientId: e.target.value, clientName: ''})}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                        >
                          <option value="">Select a client or type below...</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : null}
                      {!newProject.clientId && (
                        <input
                          type="text"
                          required={!newProject.clientId}
                          value={newProject.clientName}
                          onChange={e => setNewProject({...newProject, clientName: e.target.value})}
                          className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white ${clients.length > 0 ? 'mt-2' : ''}`}
                          placeholder="e.g. Acme Corp"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Password</label>
                      <input
                        type="text"
                        required
                        value={newProject.password}
                        onChange={e => setNewProject({...newProject, password: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                        placeholder="Shared with client"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Revisions Allowed</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={newProject.maxRevisions}
                        onChange={e => setNewProject({...newProject, maxRevisions: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsCreatingProject(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                    >
                      Create Project
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map(project => (
                <Link
                  key={project.id}
                  to={`/project/${project.id}`}
                  className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group block"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:bg-black dark:group-hover:bg-white group-hover:text-white dark:group-hover:text-black transition-colors">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => handleDuplicateProject(e, project)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                        title="Duplicate Project"
                      >
                        <CopyPlus className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => copyAccess(e, project)}
                        className="p-1.5 text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                        title="Copy Link & Password"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">
                        {project.maxRevisions} revs
                      </span>
                    </div>
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1">{project.title}</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{project.clientName}</p>
                  
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Manage versions</span>
                    <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
              {projects.length === 0 && !isCreatingProject && (
                <div className="col-span-full text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                  <Folder className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <h3 className="text-gray-900 dark:text-white font-medium mb-1">No projects yet</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Create your first project to start sharing with clients.</p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'clients' && (
          <>
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Your Clients</h1>
              <button
                onClick={() => {
                  setEditingClient(null);
                  setClientForm({ name: '', email: '', phone: '', address: '', logoUrl: '' });
                  setIsCreatingClient(true);
                }}
                className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Client
              </button>
            </div>

            {isCreatingClient && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8 transition-colors">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{editingClient ? 'Edit Client' : 'Add New Client'}</h2>
                <form onSubmit={handleSaveClient} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Name</label>
                      <input
                        type="text"
                        required
                        value={clientForm.name}
                        onChange={e => setClientForm({...clientForm, name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name</label>
                      <input
                        type="text"
                        value={clientForm.company}
                        onChange={e => setClientForm({...clientForm, company: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Person</label>
                      <input
                        type="text"
                        value={clientForm.contactPerson}
                        onChange={e => setClientForm({...clientForm, contactPerson: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                      <input
                        type="email"
                        value={clientForm.email}
                        onChange={e => setClientForm({...clientForm, email: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                      <input
                        type="text"
                        value={clientForm.phone}
                        onChange={e => setClientForm({...clientForm, phone: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website URL</label>
                      <input
                        type="url"
                        value={clientForm.url}
                        onChange={e => setClientForm({...clientForm, url: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                        placeholder="https://..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={clientForm.street}
                        onChange={e => setClientForm({...clientForm, street: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                      <input
                        type="text"
                        value={clientForm.city}
                        onChange={e => setClientForm({...clientForm, city: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">State / Province</label>
                      <input
                        type="text"
                        value={clientForm.state}
                        onChange={e => setClientForm({...clientForm, state: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ZIP / Postal Code</label>
                      <input
                        type="text"
                        value={clientForm.zip}
                        onChange={e => setClientForm({...clientForm, zip: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                      <input
                        type="text"
                        value={clientForm.country}
                        onChange={e => setClientForm({...clientForm, country: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Logo URL (Optional)</label>
                      <input
                        type="url"
                        value={clientForm.logoUrl}
                        onChange={e => setClientForm({...clientForm, logoUrl: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingClient(false);
                        setEditingClient(null);
                      }}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                    >
                      {editingClient ? 'Save Changes' : 'Add Client'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map(client => (
                <div
                  key={client.id}
                  className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                      {client.logoUrl ? (
                        <img src={client.logoUrl} alt={client.name} className="w-full h-full object-cover" />
                      ) : (
                        <Users className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingClient(client);
                          setClientForm({
                            name: client.name,
                            company: client.company || '',
                            contactPerson: client.contactPerson || '',
                            email: client.email || '',
                            phone: client.phone || '',
                            address: client.address || '',
                            street: client.street || '',
                            city: client.city || '',
                            state: client.state || '',
                            zip: client.zip || '',
                            country: client.country || '',
                            url: client.url || '',
                            logoUrl: client.logoUrl || ''
                          });
                          setIsCreatingClient(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClient(client.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-2">{client.name}</h3>
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    {client.company && <p className="font-medium text-gray-800 dark:text-gray-300">{client.company}</p>}
                    {client.contactPerson && <p>Contact: {client.contactPerson}</p>}
                    {client.email && <p>{client.email}</p>}
                    {client.phone && <p>{client.phone}</p>}
                    {client.url && <p><a href={client.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{client.url}</a></p>}
                    {(client.street || client.city || client.state || client.zip || client.country) ? (
                      <div className="mt-2 text-gray-500 dark:text-gray-500">
                        {client.street && <p>{client.street}</p>}
                        <p>
                          {[client.city, client.state, client.zip].filter(Boolean).join(', ')}
                        </p>
                        {client.country && <p>{client.country}</p>}
                      </div>
                    ) : client.address && <p>{client.address}</p>}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <button
                      onClick={() => {
                        setNewProject({ ...newProject, clientId: client.id, clientName: client.name });
                        setActiveTab('projects');
                        setIsCreatingProject(true);
                      }}
                      className="text-sm font-medium text-black dark:text-white hover:underline"
                    >
                      + New Project for Client
                    </button>
                  </div>
                </div>
              ))}
              {clients.length === 0 && !isCreatingClient && (
                <div className="col-span-full text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                  <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <h3 className="text-gray-900 dark:text-white font-medium mb-1">No clients yet</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Add your first client to manage their details and projects.</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}