"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../src/lib/supabaseClient";

export default function GroupAdminPage() {
  const router = useRouter();
  const { id } = router.query; // Get ID from query string
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [content, setContent] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // router.isReady is CRITICAL in the pages directory
    if (router.isReady && id) {
      init();
      
      const channel = supabase
        .channel(`group-${id}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'group_posts', 
          filter: `group_id=eq.${id}` 
        }, () => fetchPosts())
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'group_members',
          filter: `group_id=eq.${id}`
        }, () => fetchMembers())
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [id, router.isReady]);

  // UI UPGRADE: Auto-expand textarea height based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "42px";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  const init = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        router.push('/login'); // Redirect if not logged in
        return;
    }
    setUserId(user.id);

    // 1. Get Group Data
    const { data: groupData } = await supabase.from("groups").select("*").eq("id", id).single();
    if (groupData) {
      setGroup(groupData);
      setIsAdmin(groupData.created_by === user.id);
    }

    // 2. Check Membership & Fetch Members
    await fetchMembers(user.id);
    
    // 3. Fetch Posts
    await fetchPosts();
    
    setLoading(false);
  };

  const fetchMembers = async (currentUid?: string) => {
    const { data: memData } = await supabase.from("group_members").select("user_id").eq("group_id", id);
    const memberList = memData || [];
    setMembers(memberList);
    
    const uid = currentUid || userId;
    setIsMember(memberList.some(m => m.user_id === uid));
  };

  const fetchPosts = async () => {
    const { data: postData } = await supabase
        .from("group_posts")
        .select("*")
        .eq("group_id", id)
        .order("created_at", { ascending: false });
    setPosts(postData || []);
  };

  const handleTextPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !userId || !isMember) return;

    const { error } = await supabase.from("group_posts").insert([{
      group_id: id,
      user_id: userId,
      content: content,
      is_contract: false
    }]);

    if (!error) {
      setContent("");
      fetchPosts();
    }
  };

  const removeMember = async (memId: string) => {
    if (!isAdmin || memId === userId) return;
    if (!window.confirm("Are you sure you want to kick this member?")) return;
    
    await supabase.from("group_members").delete().eq("group_id", id).eq("user_id", memId);
    fetchMembers();
  };

  if (loading) return <div className="state-screen">Loading Chat...</div>;
  if (!isMember) return <div className="state-screen">You are not a member of this group.</div>;

  return (
    <div className="chat-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h3>Members ({members.length})</h3>
        </div>
        <div className="member-list">
          {members.map((m) => (
            <div key={m.user_id} className="member-item">
              <span className="user-name">User {m.user_id.slice(0, 5)}</span>
              {m.user_id === group?.created_by ? (
                <span className="admin-badge">Owner</span>
              ) : isAdmin ? (
                <button onClick={() => removeMember(m.user_id)} className="kick-btn">Kick</button>
              ) : null}
            </div>
          ))}
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <div className="header-left">
            <button onClick={() => router.push("/groups")} className="back-btn">←</button>
            <div className="header-text">
              <h2>{group?.name}</h2>
              <p className="status-sub">Active Community</p>
            </div>
          </div>
          <button className="exit-btn" onClick={() => router.push("/groups")}>Exit Group</button>
        </header>

        <div className="feed">
          {posts.map((post) => (
            <div key={post.id} className={`post-row ${post.user_id === userId ? 'own-post' : 'other-post'}`}>
              <div className="post-bubble">
                <p className="content-text">{post.content}</p>
                <div className="post-info">
                  <span className="time-stamp">{new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <footer className="input-footer">
          <form onSubmit={handleTextPost} className="input-wrapper">
            <textarea 
              ref={textareaRef}
              rows={1}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a message..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleTextPost(e);
                }
              }}
            />
            <button type="submit" className="send-btn" disabled={!content.trim()}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </footer>
      </main>

      <style jsx>{`
        .chat-container { display: flex; height: 100vh; background: #0f172a; color: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        
        /* Sidebar Styles */
        .sidebar { width: 280px; background: #1e293b; display: flex; flex-direction: column; border-right: 1px solid #334155; }
        .sidebar-header { padding: 24px 20px; border-bottom: 1px solid #334155; }
        .sidebar-header h3 { margin: 0; font-size: 1.1rem; color: #f8fafc; }
        .member-list { flex: 1; overflow-y: auto; padding: 15px; }
        .member-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-radius: 8px; margin-bottom: 8px; background: #33415544; transition: background 0.2s; }
        .user-name { font-size: 0.9rem; color: #e2e8f0; }
        .admin-badge { color: #f59e0b; font-size: 0.7rem; font-weight: bold; border: 1px solid #f59e0b44; padding: 2px 6px; border-radius: 4px; }
        .kick-btn { color: #f87171; background: none; border: none; cursor: pointer; font-size: 0.75rem; transition: opacity 0.2s; }
        .kick-btn:hover { opacity: 0.7; }

        /* Main Chat Area */
        .chat-area { flex: 1; display: flex; flex-direction: column; position: relative; background: #0f172a; }
        .chat-header { padding: 0 24px; background: #1e293b; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; min-height: 70px; }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .back-btn { background: none; border: none; color: #94a3b8; font-size: 1.6rem; cursor: pointer; padding: 4px; }
        .header-text h2 { margin: 0; font-size: 1.2rem; }
        .status-sub { margin: 0; font-size: 0.75rem; color: #10b981; }
        .exit-btn { background: #334155; border: 1px solid #475569; color: #f1f5f9; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }

        /* Feed / Messages */
        .feed { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column-reverse; gap: 16px; scroll-behavior: smooth; }
        .post-row { display: flex; width: 100%; }
        .post-row.own-post { justify-content: flex-end; }
        
        .post-bubble { max-width: 70%; padding: 12px 16px; border-radius: 16px; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .own-post .post-bubble { background: #3b82f6; color: white; border-bottom-right-radius: 2px; }
        .other-post .post-bubble { background: #1e293b; color: #f1f5f9; border-bottom-left-radius: 2px; border: 1px solid #334155; }
        
        .content-text { margin: 0; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
        .post-info { display: flex; justify-content: flex-end; margin-top: 4px; opacity: 0.7; }
        .time-stamp { font-size: 0.65rem; }

        /* Footer Input */
        .input-footer { padding: 20px 24px; background: #0f172a; border-top: 1px solid #334155; }
        .input-wrapper { background: #1e293b; border: 1px solid #334155; border-radius: 24px; display: flex; align-items: flex-end; padding: 6px 12px; transition: border-color 0.2s; }
        .input-wrapper:focus-within { border-color: #3b82f6; }
        .input-wrapper textarea { flex: 1; background: none; border: none; color: white; padding: 10px; font-size: 0.95rem; line-height: 1.4; outline: none; resize: none; max-height: 180px; }
        .send-btn { background: #3b82f6; color: white; border: none; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; margin-bottom: 2px; }
        .send-btn:disabled { background: #334155; color: #64748b; cursor: default; }
        .send-btn:hover:not(:disabled) { background: #2563eb; transform: scale(1.05); }

        .state-screen { height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: white; font-size: 1.1rem; }
      `}</style>
    </div>
  );
}