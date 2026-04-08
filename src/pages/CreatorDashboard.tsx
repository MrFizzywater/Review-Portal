import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, signOut } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { Plus, Folder, LogOut, ExternalLink, Settings } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Folder className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">Review Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/settings" className="text-sm font-medium text-gray-600 hover:text-black flex items-center gap-1">
              <Settings className="w-4 h-4" />
              Settings
            </Link>
            <div className="w-px h-4 bg-gray-300"></div>
            <span className="text-sm text-gray-600">{user.email}</span>
            <button onClick={() => signOut(auth)} className="text-gray-500 hover:text-gray-900">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Your Projects</h1>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-black text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {isCreating && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Create New Project</h2>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project Title</label>
                  <input
                    type="text"
                    required
                    value={newProject.title}
                    onChange={e => setNewProject({...newProject, title: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                    placeholder="e.g. Summer Campaign Video"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                  <input
                    type="text"
                    required
                    value={newProject.clientName}
                    onChange={e => setNewProject({...newProject, clientName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                    placeholder="e.g. Acme Corp"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Password</label>
                  <input
                    type="text"
                    required
                    value={newProject.password}
                    onChange={e => setNewProject({...newProject, password: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                    placeholder="Shared with client"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Revisions Allowed</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newProject.maxRevisions}
                    onChange={e => setNewProject({...newProject, maxRevisions: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
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
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all group block"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 group-hover:bg-black group-hover:text-white transition-colors">
                  <Folder className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  {project.maxRevisions} revs
                </span>
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-1">{project.title}</h3>
              <p className="text-gray-500 text-sm mb-4">{project.clientName}</p>
              
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>Manage versions</span>
                <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
          {projects.length === 0 && !isCreating && (
            <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <Folder className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-gray-900 font-medium mb-1">No projects yet</h3>
              <p className="text-gray-500 text-sm">Create your first project to start sharing with clients.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}