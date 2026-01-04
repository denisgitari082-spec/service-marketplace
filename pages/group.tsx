"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../src/lib/supabaseClient";

// --- Types ---
type Group = {
  id: string;
  name: string;
  category: string;
  created_by: string;
  created_at: string;
  member_count?: number;
  is_member?: boolean; // Track if current user is inside
};

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("General");

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
    if (!userId) return;

    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .insert([{ name: newName, category: newCat, created_by: userId }])
      .select()
      .single();

    if (!groupError) {
      // Creator must be added to group_members automatically
      await supabase.from("group_members").insert([
        { group_id: groupData.id, user_id: userId }
      ]);

      setShowCreateModal(false);
      setNewName("");
      checkUserAndFetch();
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div className="header-left">
          <button onClick={() => router.back()} className="back-btn">
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
        <input type="text" placeholder="Search by name or category..." className="search-input" />
      </div>

      {loading ? (
        <div className="loader">
           <div className="spinner"></div>
           <p>Syncing groups...</p>
        </div>
      ) : (
        <div className="groups-grid">
          {groups.map((group) => (
            <div key={group.id} className="group-card">
              <div className="group-info">
                <div className="group-avatar">{group.name[0]}</div>
                <div className="group-details">
                  <h3>{group.name}</h3>
                  <span className="member-tag">{group.member_count} Members</span>
                </div>
              </div>
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
          ))}
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
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .container { background: #0f172a; min-height: 100vh; color: white; padding: 20px; font-family: sans-serif; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .back-btn { background: #1e293b; border: none; color: #94a3b8; padding: 8px; border-radius: 8px; cursor: pointer; }
        .create-btn { background: #3b82f6; border: none; color: white; padding: 10px 16px; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .search-input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #334155; background: #1e293b; color: white; margin-bottom: 20px; }

        .groups-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .group-card { background: #1e293b; border-radius: 16px; padding: 20px; border: 1px solid #334155; }
        .group-info { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
        .group-avatar { width: 44px; height: 44px; background: #334155; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #3b82f6; }
        
        .group-footer { display: flex; justify-content: space-between; align-items: center; }
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
      `}</style>
    </div>
  );
}