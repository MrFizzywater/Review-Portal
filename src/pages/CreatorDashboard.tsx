import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, signOut } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { Plus, Folder, LogOut, ExternalLink, Settings, Copy } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

interface Project {
  id: string;
  title: string;
  clientName: string;
  maxRevisions: number;
  createdAt: any;
}

export default function CreatorDashboard({ user }: { user: User }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProject, setNewProject] = useState({ title: '', clientName: '', password: '', maxRevisions: 3 });

  useEffect(() => {
    const q = query(collection(db, 'projects'), where('creatorId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'projects'), {
        ...newProject,
        creatorId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsCreating(false);
      setNewProject({ title: '', clientName: '', password: '', maxRevisions: 3 });
    } catch (error) {
      console.error("Error creating project", error);
      alert("Failed to create project");
    }
  };

  const copyAccess = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    const url = `${window.location.origin}/p/${project.id}`;
    const text = `Here is the link to review your project:\n\nLink: ${url}\nPassword: ${project.password}`;
    navigator.clipboard.writeText(text);
    alert('Link and password copied to clipboard!');
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
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Your Projects</h1>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {isCreating && (
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Name</label>
                  <input
                    type="text"
                    required
                    value={newProject.clientName}
                    onChange={e => setNewProject({...newProject, clientName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none dark:bg-gray-700 dark:text-white"
                    placeholder="e.g. Acme Corp"
                  />
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
                  onClick={() => setIsCreating(false)}
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
          {projects.length === 0 && !isCreating && (
            <div className="col-span-full text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
              <Folder className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <h3 className="text-gray-900 dark:text-white font-medium mb-1">No projects yet</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Create your first project to start sharing with clients.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}