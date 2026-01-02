"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { supabase } from "../src/lib/supabaseClient";

/** --- Types & Interfaces --- **/
interface Message {
  id: string;
  sender_id: string;
  receiver_id?: string | null;
  group_id?: string | null;
  text: string;
  created_at: string;
  is_read: boolean;
}

interface ChatUser { id: string; email: string; full_name: string; category: string; }
interface Group { id: string; name: string; description: string; }

export default function MessagesPage() {
  // Auth & UI State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [view, setView] = useState<"chats" | "discover">("chats");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Data State
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<ChatUser | Group | null>(null);

  // Input & Feedback State
  const [newMessage, setNewMessage] = useState("");
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Refs for UI Control
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** 1. Initialization: Auth + Profiles + Groups **/
  useEffect(() => {
    const initApp = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setCurrentUser(user);

      // Upsert current user profile
      await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split("@")[0],
        category: "Professional",
      });

      // Parallel Fetch for speed
      const [usersRes, groupsRes] = await Promise.all([
        supabase.from("profiles").select("*").neq("id", user.id),
        supabase.from("groups").select("*"),
      ]);

      setUsers(usersRes.data || []);
      setGroups(groupsRes.data || []);
      setLoading(false);
    };
    initApp();
  }, []);

  /** 2. Filter Logic (The "Search Bar" fix) **/
  const filteredList = useMemo(() => {
    if (view === "chats") {
      return users.filter(u => u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return groups.filter(g => g.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [users, groups, view, searchQuery]);

  /** 3. Realtime Chat Logic **/
  useEffect(() => {
    if (!selectedTarget || !currentUser) return;

    const isDirect = "email" in selectedTarget;
    const targetId = selectedTarget.id;

    // Fetch History
    const fetchHistory = async () => {
      let query = supabase.from("messages").select("*").order("created_at", { ascending: true });
      if (isDirect) {
        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUser.id})`);
        // Mark as read
        await supabase.from("messages").update({ is_read: true }).eq("sender_id", targetId).eq("receiver_id", currentUser.id);
      } else {
        query = query.eq("group_id", targetId);
      }
      const { data } = await query;
      setMessages(data || []);
    };
    fetchHistory();

    // Subscribe to Room
    const channel = supabase.channel(`room:${targetId}`, {
      config: { presence: { key: currentUser.id } }
    });

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        const isMatch = m.group_id === targetId || m.sender_id === targetId || m.receiver_id === targetId;
        if (!isMatch) return;

        if (payload.eventType === "INSERT") {
          setMessages(prev => [...prev, m]);
          if (m.sender_id === targetId) {
            supabase.from("messages").update({ is_read: true }).eq("id", m.id);
          }
        }
        if (payload.eventType === "UPDATE") {
          setMessages(prev => prev.map(msg => msg.id === m.id ? m : msg));
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const typing = Object.values(state).flat().some((p: any) => p.isTyping && p.user_id !== currentUser.id);
        setIsOtherTyping(typing);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ user_id: currentUser.id, isTyping: false });
      });

    return () => { supabase.removeChannel(channel); };
  }, [selectedTarget, currentUser]);

  // Auto-scroll
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isOtherTyping]);

  /** 4. Actions **/
  const handleTyping = useCallback(() => {
    if (!selectedTarget) return;
    const channel = supabase.channel(`room:${selectedTarget.id}`);
    channel.track({ user_id: currentUser.id, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      channel.track({ user_id: currentUser.id, isTyping: false });
    }, 2000);
  }, [selectedTarget, currentUser]);

  const onSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTarget) return;

    const isDirect = "email" in selectedTarget;
    const { error } = await supabase.from("messages").insert([{
      text: newMessage,
      sender_id: currentUser.id,
      receiver_id: isDirect ? selectedTarget.id : null,
      group_id: isDirect ? null : selectedTarget.id,
      is_read: false
    }]);

    if (!error) {
      setNewMessage("");
      supabase.channel(`room:${selectedTarget.id}`).track({ user_id: currentUser.id, isTyping: false });
    }
  };

  if (loading) return <div className="loading-state">Syncing secure connection...</div>;

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <header className="sidebar-header">
          <div className="tab-switcher">
            <button className={view === "chats" ? "active" : ""} onClick={() => {setView("chats"); setSearchQuery("");}}>Inbox</button>
            <button className={view === "discover" ? "active" : ""} onClick={() => {setView("discover"); setSearchQuery("");}}>Explore</button>
          </div>
          <div className="search-box">
            <input 
              type="text" 
              placeholder={`Search ${view === "chats" ? "users" : "groups"}...`} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </header>

        <div className="sidebar-list">
          {view === "discover" && (
            <button className="create-group-btn" onClick={() => setShowCreateGroup(true)}>+ New Community</button>
          )}
          
          {filteredList.length > 0 ? filteredList.map((item) => (
            <div 
              key={item.id} 
              className={`list-item ${selectedTarget?.id === item.id ? "active" : ""}`}
              onClick={() => setSelectedTarget(item)}
            >
              <div className={`avatar ${"email" in item ? "" : "group"}`}>
                {"full_name" in item ? item.full_name[0] : "#"}
              </div>
              <div className="item-info">
                <div className="item-name">{"full_name" in item ? item.full_name : item.name}</div>
                <div className="item-meta">{"category" in item ? item.category : "Public Community"}</div>
              </div>
            </div>
          )) : (
            <div className="empty-msg">No matches found</div>
          )}
        </div>
      </aside>

      {/* MAIN CHAT */}
      <main className="chat-main">
        {selectedTarget ? (
          <>
            <div className="chat-header">
              {"full_name" in selectedTarget ? selectedTarget.full_name : selectedTarget.name}
              <span className="status-dot"></span>
            </div>
            
            <div className="message-container">
              {messages.map((m) => (
                <div key={m.id} className={`msg-row ${m.sender_id === currentUser.id ? "own" : "their"}`}>
                  <div className="msg-bubble">
                    <p>{m.text}</p>
                    <span className="msg-time">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {m.sender_id === currentUser.id && (m.is_read ? " • Seen" : " • Sent")}
                    </span>
                  </div>
                </div>
              ))}
              {isOtherTyping && <div className="typing">•••</div>}
              <div ref={scrollRef} />
            </div>

            <form className="chat-input-area" onSubmit={onSendMessage}>
              <input 
                value={newMessage} 
                onChange={(e) => {setNewMessage(e.target.value); handleTyping();}}
                placeholder="Message..." 
              />
              <button type="submit">SEND</button>
            </form>
          </>
        ) : (
          <div className="chat-placeholder">Select a conversation to start</div>
        )}
      </main>

      <style jsx>{`
        .app-layout { display: flex; height: 100vh; background: #020617; color: #f8fafc; font-family: sans-serif; }
        .sidebar { width: 320px; border-right: 1px solid #1e293b; display: flex; flex-direction: column; background: #020617; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid #1e293b; }
        .tab-switcher { display: flex; gap: 5px; margin-bottom: 15px; background: #0f172a; padding: 4px; border-radius: 8px; }
        .tab-switcher button { flex: 1; padding: 8px; border: none; background: none; color: #64748b; cursor: pointer; border-radius: 6px; font-weight: 600; font-size: 13px; }
        .tab-switcher button.active { background: #1e293b; color: #3b82f6; }
        .search-box input { width: 100%; padding: 10px 15px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; outline: none; }
        
        .sidebar-list { flex: 1; overflow-y: auto; padding: 10px; }
        .list-item { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; cursor: pointer; transition: 0.2s; margin-bottom: 2px; }
        .list-item:hover { background: #0f172a; }
        .list-item.active { background: #1e293b; border-left: 3px solid #3b82f6; }
        .avatar { width: 40px; height: 40px; background: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .avatar.group { background: #10b981; border-radius: 10px; }
        .item-name { font-size: 14px; font-weight: 600; }
        .item-meta { font-size: 11px; color: #64748b; }
        
        .chat-main { flex: 1; display: flex; flex-direction: column; background: #0f172a; }
        .chat-header { padding: 18px 25px; background: #020617; border-bottom: 1px solid #1e293b; font-weight: bold; display: flex; align-items: center; gap: 10px; }
        .status-dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; }
        
        .message-container { flex: 1; overflow-y: auto; padding: 25px; display: flex; flex-direction: column; gap: 8px; }
        .msg-row { display: flex; width: 100%; }
        .msg-row.own { justify-content: flex-end; }
        .msg-bubble { max-width: 60%; padding: 10px 16px; border-radius: 15px; position: relative; }
        .own .msg-bubble { background: #2563eb; color: white; border-bottom-right-radius: 2px; }
        .their .msg-bubble { background: #1e293b; border-bottom-left-radius: 2px; border: 1px solid #334155; }
        .msg-time { font-size: 9px; opacity: 0.6; display: block; margin-top: 4px; text-align: right; }
        
        .chat-input-area { padding: 20px; background: #020617; border-top: 1px solid #1e293b; display: flex; gap: 10px; }
        .chat-input-area input { flex: 1; background: #0f172a; border: 1px solid #334155; border-radius: 25px; padding: 12px 20px; color: white; outline: none; }
        .chat-input-area button { background: #3b82f6; border: none; color: white; padding: 0 20px; border-radius: 25px; font-weight: bold; cursor: pointer; }
        
        .loading-state, .chat-placeholder, .empty-msg { flex: 1; display: flex; align-items: center; justify-content: center; color: #475569; }
        .typing { color: #3b82f6; font-size: 20px; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
