"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../src/lib/supabaseClient";

// 1. Update Type
type Group = {
  id: string;
  name: string;
  category: string;
  avatar_url?: string; // Add this
  created_by: string;
  created_at: string;
  member_count?: number;
  is_member?: boolean;
};

// 2. Add these inside GroupsPage component

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
const [uploading, setUploading] = useState(false);
const [editingGroup, setEditingGroup] = useState<Group | null>(null);
const [showEditModal, setShowEditModal] = useState(false);
const [searchQuery, setSearchQuery] = useState("");
  
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("General");



  const filteredGroups = groups.filter((group) => {
  const query = searchQuery.toLowerCase();
  return (
    group.name.toLowerCase().includes(query) ||
    group.category.toLowerCase().includes(query)
  );
});

  useEffect(() => {
    checkUserAndFetch();
  }, []);

  const checkUserAndFetch = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      fetchGroups(user.id);
    } else {
      fetchGroups(null);
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!editingGroup || uploading) return;
  setUploading(true);

  try {
    let publicUrl = editingGroup.avatar_url;

    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${editingGroup.id}-${Math.random()}.${fileExt}`;
      const filePath = `group-icons/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('group-media')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('group-media').getPublicUrl(filePath);
      publicUrl = data.publicUrl;
    }

    const { error } = await supabase
      .from("groups")
      .update({ 
        name: newName, 
        category: newCat, 
        avatar_url: publicUrl 
      })
      .eq("id", editingGroup.id);

    if (error) throw error;

    setShowEditModal(false);
    setEditingGroup(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    checkUserAndFetch();
  } catch (err) {
    alert("Error updating group");
  } finally {
    setUploading(false);
  }
};
const handleDeleteGroup = async () => {
  if (!editingGroup) return;
  const confirmDelete = confirm(`Are you sure you want to delete "${editingGroup.name}"? This cannot be undone.`);
  
  if (confirmDelete) {
    setUploading(true);
    try {
      // Delete the group (Supabase will handle members if you have ON DELETE CASCADE, 
      // otherwise delete members first)
      const { error } = await supabase
        .from("groups")
        .delete()
        .eq("id", editingGroup.id);

      if (error) throw error;

      setShowEditModal(false);
      setEditingGroup(null);
      checkUserAndFetch();
    } catch (err) {
      alert("Error deleting group");
    } finally {
      setUploading(false);
    }
  }
};

  const fetchGroups = async (currentUserId: string | null) => {
    setLoading(true);
    
    // 1. Fetch all groups
    const { data: groupsData, error: groupsError } = await supabase
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false });

    if (groupsError) {
      setLoading(false);
      return;
    }

    // 2. Fetch member counts and membership status
    const groupsWithStatus = await Promise.all(
      (groupsData || []).map(async (group) => {
        // Count members
        const { count } = await supabase
          .from("group_members")
          .select("*", { count: 'exact', head: true })
          .eq("group_id", group.id);
        
        // Check if current user is a member
        let isMember = false;
        if (currentUserId) {
          const { data: membership } = await supabase
            .from("group_members")
            .select("id")
            .eq("group_id", group.id)
            .eq("user_id", currentUserId)
            .single();
          isMember = !!membership;
        }
        
        return { ...group, member_count: count || 0, is_member: isMember };
      })
    );

    setGroups(groupsWithStatus);
    setLoading(false);
  };

  const joinGroup = async (groupId: string) => {
    if (!userId) {
      alert("Please login to join groups");
      return;
    }

    const { error } = await supabase
      .from("group_members")
      .insert([{ group_id: groupId, user_id: userId }]);

    if (error) {
      alert("Error joining group");
    } else {
      // Refresh list to show "Open Chat"
      checkUserAndFetch();
    }
  };

const handleCreateGroup = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!userId || uploading) return;
  setUploading(true);

  try {
    let publicUrl = null;

    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `group-icons/${fileName}`;

      // UPDATED: Changed bucket name to group-media
      const { error: uploadError } = await supabase.storage
        .from('group-media') 
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // UPDATED: Changed bucket name to group-media
      const { data } = supabase.storage.from('group-media').getPublicUrl(filePath);
      publicUrl = data.publicUrl;
    }

    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .insert([{ 
        name: newName, 
        category: newCat, 
        created_by: userId,
        avatar_url: publicUrl 
      }])
      .select().single();

    if (!groupError) {
      await supabase.from("group_members").insert([{ group_id: groupData.id, user_id: userId }]);
      setShowCreateModal(false);
      setNewName("");
      setSelectedFile(null);
      setPreviewUrl(null);
      checkUserAndFetch();
    }
  } catch (err) {
    alert("Error creating group");
  } finally {
    setUploading(true); // Should be false, but check your local state flow
    setUploading(false);
  }
};
  return (
    <div className="container">

{/* Mobile App Bar */}
<div className="app-bar">
  <button className="appbar-btn" onClick={() => router.push("/")}>
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  </button>

  <div className="appbar-title">Community Hub</div>

  <button className="appbar-btn primary" onClick={() => setShowCreateModal(true)}>
    +
  </button>
</div>


      <header className="header">
        <div className="header-left">
<button onClick={() => router.push("/")} className="back-btn">
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
</button>
          <h1>Community Hub</h1>
        </div>
        <button className="create-btn" onClick={() => setShowCreateModal(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Create Group</span>
        </button>
      </header>

<div className="search-bar">
  <input 
    type="text" 
    placeholder="Search by name or category..." 
    className="search-input" 
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
  />
</div>

      {loading ? (
        <div className="loader">
           <div className="spinner"></div>
           <p>Syncing groups...</p>
        </div>
      ) : (
 <div className="groups-grid">
  {filteredGroups.length > 0 ? (
    filteredGroups.map((group) => (
      <div key={group.id} className="group-card">
        
        {/* TOP SECTION: Avatar and Text side-by-side */}
        <div className="group-info">
          <div 
            className={`group-avatar ${group.created_by === userId ? 'admin-editable' : ''}`}
            onClick={() => {
              if (group.created_by === userId) {
                setEditingGroup(group);
                setNewName(group.name);
                setNewCat(group.category);
                setPreviewUrl(group.avatar_url || null);
                setShowEditModal(true);
              }
            }}
          >
            {group.avatar_url ? (
              <img 
                src={group.avatar_url} 
                alt={group.name} 
                style={{ width: '100%', height: '100%', borderRadius: '10px', objectFit: 'cover' }} 
              />
            ) : (
              <span>{group.name[0]}</span>
            )}

            {group.created_by === userId && (
              <div className="edit-overlay">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
              </div>
            )}
          </div>

          <div className="group-text">
            <h3 className="group-name-title">{group.name}</h3>
            <p className="group-stats">{group.member_count} members</p>
          </div>
        </div>

        {/* BOTTOM SECTION: Category and Action Button */}
        <div className="group-footer">
          <span className="cat-badge">{group.category}</span>
          {group.is_member ? (
            <button 
              onClick={() => router.push(`/admin?id=${group.id}`)}
              className="view-btn chat-mode"
            >
              Open Chat
            </button>
          ) : (
            <button 
              onClick={() => joinGroup(group.id)} 
              className="view-btn join-mode"
            >
              Join Group
            </button>
          )}
        </div>
        
      </div>
    ))
  ) : (
    <div className="no-results">
      <p>No communities found matching "{searchQuery}"</p>
    </div>
  )}
</div>
      )}

{showEditModal && (
  <div className="modal-overlay">
    <div className="modal">
      <div className="modal-header">
        <h2>Edit {editingGroup?.name}</h2>
        <button className="delete-icon-btn" onClick={handleDeleteGroup} title="Delete Group">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ef4444" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
      
      <form onSubmit={handleUpdateGroup}>
        <div className="avatar-upload">
          <div className="preview-circle" onClick={() => fileInputRef.current?.click()}>
            {previewUrl ? <img src={previewUrl} alt="Preview" /> : <span>+</span>}
          </div>
          <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setSelectedFile(file);
              setPreviewUrl(URL.createObjectURL(file));
            }
          }} />
          <label>Change Icon</label>
        </div>
        
        <div className="field">
          <label>Name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </div>
        
        <div className="field">
          <label>Category</label>
          <select value={newCat} onChange={(e) => setNewCat(e.target.value)}>
            <option value="General">General</option>
            <option value="Construction">Construction</option>
            <option value="Engineering">Engineering</option>
            <option value="Design">Design</option>
          </select>
        </div>
        
        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={() => setShowEditModal(false)}>Cancel</button>
          <button type="submit" className="confirm-btn">{uploading ? "Saving..." : "Save Changes"}</button>
        </div>
      </form>
    </div>
  </div>
)}

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Start a Community</h2>
            <form onSubmit={handleCreateGroup}>
              <div className="field">
                <label>Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Group Name" required />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                  <option value="General">General</option>
                  <option value="Construction">Construction</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Design">Design</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="confirm-btn">Create</button>
              </div>

              {/* Insert this inside the <form> before the Name field */}
<div className="avatar-upload">
  <div className="preview-circle" onClick={() => fileInputRef.current?.click()}>
    {previewUrl ? <img src={previewUrl} alt="Preview" /> : <span>+</span>}
  </div>
  <input 
    type="file" 
    ref={fileInputRef} 
    hidden 
    accept="image/*" 
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
      }
    }} 
  />
  <label>Upload Icon</label>
</div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`

      * {
  box-sizing: border-box;
  min-width: 0;
}

html, body {
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}
.app-bar {
  display: none;
  position: sticky;
  top: 0;
  z-index: 50;

  height: calc(56px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 12px 0;

  background: #0f172a;
  border-bottom: 1px solid #1e293b;

  align-items: center;
  justify-content: space-between;
}

.appbar-title {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.appbar-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #1e293b;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
}

.appbar-btn.primary {
  background: #3b82f6;
}


      .avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding: 10px;
  border: 1px dashed #334155;
  border-radius: 12px;
}
  .admin-editable {
  position: relative;
  cursor: pointer;
  transition: transform 0.2s;
}
.admin-editable:hover {
  transform: scale(1.05);
}
.edit-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  border-radius: 10px;
}
.admin-editable:hover .edit-overlay {
  opacity: 1;
}
  .modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.delete-icon-btn {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.delete-icon-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

.group-text {
  display: flex;
  flex-direction: column;
}

.group-name-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: white;
}

.group-stats {
  margin: 2px 0 0 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

.preview-circle {
  width: 64px;
  height: 64px;
  background: #0f172a;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  font-size: 24px;
  color: #3b82f6;
}

.preview-circle img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-upload label {
  font-size: 12px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
        .container { background: #0f172a; min-height: 100vh; color: white; padding: 20px; font-family: sans-serif; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .back-btn { background: #1e293b; border: none; color: #94a3b8; padding: 8px; border-radius: 8px; cursor: pointer; }
        .create-btn { background: #3b82f6; border: none; color: white; padding: 10px 16px; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .search-input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #334155; background: #1e293b; color: white; margin-bottom: 20px; overflow: hidden; text-overflow: ellipsis; }

        .groups-grid { 
  display: grid; 
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); 
  gap: 16px; 
  align-items: start; /* This prevents cards from stretching to match the tallest card */
}
        .group-card { 
  background: #1e293b; 
  border-radius: 16px; 
  padding: 16px; /* Slightly reduced padding for a tighter look */
  border: 1px solid #334155; 
  height: fit-content; /* Force card to only be as tall as its content */
  display: flex;
  flex-direction: column;
  gap: 12px;
}
        .group-info { 
  display: flex; 
  align-items: center; 
  gap: 12px; 
  /* Remove margin-bottom since the card has a gap now */
}
        .group-avatar { width: 44px; height: 44px; background: #334155; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #3b82f6; }
        
        .group-footer { 
  display: flex; 
  justify-content: space-between; 
  align-items: center;
  margin-top: 4px; /* Small push from the info section */
}
        .cat-badge { background: rgba(59, 130, 246, 0.1); color: #60a5fa; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; }
        
        .view-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
        .join-mode { background: #3b82f6; color: white; }
        .chat-mode { background: #10b981; color: white; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .modal { background: #1e293b; width: 90%; max-width: 400px; padding: 25px; border-radius: 16px; border: 1px solid #334155; }
        .field { margin-bottom: 15px; }
        input, select { width: 100%; padding: 10px; border-radius: 8px; background: #0f172a; border: 1px solid #334155; color: white; }
        .modal-actions { display: flex; gap: 10px; margin-top: 20px; }
        .confirm-btn { flex: 2; background: #3b82f6; color: white; border: none; padding: 10px; border-radius: 8px; }
        .cancel-btn { flex: 1; background: transparent; color: white; border: 1px solid #334155; padding: 10px; border-radius: 8px; }

        .loader { text-align: center; padding: 50px; }
        .spinner { border: 3px solid #334155; border-top: 3px solid #3b82f6; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 10px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        @media (max-width: 768px) {

  /* Show app bar */
  .app-bar {
    display: flex;
  }

  /* Hide desktop header */
  .header {
    display: none;
  }

  /* Push content BELOW app bar */
  .container {
    padding-top: calc(56px + env(safe-area-inset-top) + 12px);
    padding-left: 12px;
    padding-right: 12px;
    padding-bottom: 12px;
  }

  /* Inputs must never exceed screen */
  .search-input {
    width: 100%;
  }

  /* Grid safe sizing */
  .groups-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }

  .group-card {
    width: 100%;
  }
}

      `}</style>
    </div>
  );
}