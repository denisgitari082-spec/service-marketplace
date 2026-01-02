"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "../src/lib/supabaseClient";

type Message = { id: string; sender_id?: string; receiver_id?: string; group_id?: string; text: string; created_at: string; is_read: boolean; };
type ChatUser = { id: string; email: string; full_name: string; category: string };
type Group = { id: string; name: string; description: string };

export default function MessagesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [view, setView] = useState<"chats" | "discover">("chats");
  const [searchQuery, setSearchQuery] = useState(""); // Search state
  const [suggestedUsers, setSuggestedUsers] = useState<ChatUser[]>([]);
  const [suggestedGroups, setSuggestedGroups] = useState<Group[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<ChatUser | Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isOtherTyping, setIsOtherTyping] = useState(false);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Search Logic ---
  const filteredUsers = useMemo(() => {
    return suggestedUsers.filter(u => 
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [suggestedUsers, searchQuery]);

  const filteredGroups = useMemo(() => {
    return suggestedGroups.filter(g => 
      g.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [suggestedGroups, searchQuery]);

  const formatTime = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    const initApp = async () => {
      setLoading(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setLoading(false);
        return;
      }
      
      setCurrentUser(user);

      const myName = user.user_metadata?.full_name || user.email?.split('@')[0] || "User";
      await supabase.from("profiles").upsert({ 
        id: user.id, 
        email: user.email,
        full_name: myName,
        category: 'Professional'
      });

      const { data: users } = await supabase
        .from("profiles")
        .select("id, email, full_name, category")
        .neq("id", user.id); 

      setSuggestedUsers(users || []);
      const { data: groups } = await supabase.from("groups").select("*");
      setSuggestedGroups(groups || []);

      setLoading(false);
    };
    initApp();
  }, []);

  useEffect(() => {
    if (!selectedTarget || !currentUser?.id) return;

    const fetchMessages = async () => {
      let query = supabase.from("messages").select("*").order("created_at", { ascending: true });
      // Robust check: Is this a user?
      if ("full_name" in selectedTarget) {
        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedTarget.id}),and(sender_id.eq.${selectedTarget.id},receiver_id.eq.${currentUser.id})`);
      } else {
        query = query.eq("group_id", selectedTarget.id);
      }
      const { data } = await query;
      setMessages(data || []);
      
      if ("full_name" in selectedTarget) {
         await supabase.from("messages").update({ is_read: true })
          .eq("sender_id", selectedTarget.id).eq("receiver_id", currentUser.id).eq("is_read", false);
      }
    };

    fetchMessages();

    const channel = supabase.channel(`chat-${selectedTarget.id}`, {
      config: { presence: { key: currentUser.id } }
    });

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const m = payload.new as Message;
          const isMatch = m.group_id === selectedTarget.id || 
                         (m.sender_id === selectedTarget.id && m.receiver_id === currentUser.id) || 
                         (m.sender_id === currentUser.id && m.receiver_id === selectedTarget.id);
          if (isMatch) setMessages(prev => [...prev, m]);
        } 
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedTarget, currentUser?.id]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTarget) return;

    const isUser = "full_name" in selectedTarget;
    await supabase.from("messages").insert([{
      text: newMessage,
      sender_id: currentUser.id,
      receiver_id: isUser ? selectedTarget.id : null,
      group_id: isUser ? null : selectedTarget.id,
      is_read: false
    }]);

    setNewMessage("");
  };

  if (loading) return <div className="loading">Checking users...</div>;

  return (
    <div className="container">
      <div className="sidebar">
        <div className="tabs">
          <button className={view === "chats" ? "active" : ""} onClick={() => {setView("chats"); setSearchQuery("");}}>Inbox</button>
          <button className={view === "discover" ? "active" : ""} onClick={() => {setView("discover"); setSearchQuery("");}}>Explore</button>
        </div>

        {/* --- SEARCH BAR --- */}
        <div className="search-container">
          <input 
            type="text" 
            placeholder={`Search ${view === "chats" ? "pros" : "groups"} by name...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="list-content">
          <p className="section-title">{view === "chats" ? "DIRECT MESSAGES" : "COMMUNITIES"}</p>
          
          {view === "chats" ? (
            filteredUsers.length > 0 ? (
              filteredUsers.map(u => (
                <div key={u.id} className={`row ${selectedTarget?.id === u.id ? 'active' : ''}`} onClick={() => setSelectedTarget(u)}>
                  <div className="avatar">{u.full_name?.[0]?.toUpperCase() || "?"}</div>
                  <div className="details">
                    <div className="name">{u.full_name || "Anonymous User"}</div>
                    <div className="meta">{u.category}</div>
                  </div>
                </div>
              ))
            ) : <div className="empty-notice">No pros found matching "{searchQuery}"</div>
          ) : (
            <div className="explore">
              <button className="create-btn" onClick={() => setShowCreateGroup(true)}>+ Create Group</button>
              {filteredGroups.map(g => (
                <div key={g.id} className={`row ${selectedTarget?.id === g.id ? 'active' : ''}`} onClick={() => setSelectedTarget(g)}>
                   <div className="avatar group">#</div>
                   <div className="name">{g.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="chat-window">
        {selectedTarget ? (
          <>
            <div className="header">
              {"full_name" in selectedTarget ? selectedTarget.full_name : selectedTarget.name}
            </div>
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id} className={`bubble-wrapper ${m.sender_id === currentUser.id ? 'sent-wrapper' : 'received-wrapper'}`}>
                  <div className={`bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}`}>
                    <div className="text">{m.text}</div>
                    <div className="footer">
                      <span className="time">{formatTime(m.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
            <form className="input-box" onSubmit={sendMessage}>
              <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type here..." />
              <button type="submit">SEND</button>
            </form>
          </>
        ) : <div className="empty">Select a conversation to start chatting</div>}
      </div>

      <style jsx>{`
        .container { display: flex; height: 100vh; background: #0f172a; color: white; font-family: sans-serif; }
        .sidebar { width: 320px; border-right: 1px solid #1e293b; background: #020617; display: flex; flex-direction: column; }
        .tabs { display: flex; border-bottom: 1px solid #1e293b; }
        .tabs button { flex: 1; padding: 15px; background: none; border: none; color: #64748b; cursor: pointer; font-weight: bold; }
        .tabs button.active { color: #3b82f6; border-bottom: 2px solid #3b82f6; }
        
        /* Search Styling */
        .search-container { padding: 15px; border-bottom: 1px solid #1e293b; }
        .search-input { width: 100%; padding: 10px 15px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: white; outline: none; font-size: 13px; }
        .search-input:focus { border-color: #3b82f6; }

        .list-content { flex: 1; overflow-y: auto; padding: 15px; }
        .section-title { font-size: 11px; color: #475569; margin-bottom: 15px; font-weight: bold; text-transform: uppercase; }
        .empty-notice { padding: 20px; text-align: center; color: #475569; font-size: 13px; }
        .row { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 10px; cursor: pointer; margin-bottom: 5px; transition: 0.2s; }
        .row:hover { background: #1e293b; }
        .row.active { background: #2563eb; }
        .avatar { width: 38px; height: 38px; background: #334155; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .avatar.group { background: #10b981; }
        .name { font-size: 14px; font-weight: 600; }
        .meta { font-size: 11px; opacity: 0.6; }
        .chat-window { flex: 1; display: flex; flex-direction: column; background: #0f172a; }
        .header { padding: 18px; border-bottom: 1px solid #1e293b; font-weight: bold; background: #020617; font-size: 16px; }
        .messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
        .bubble-wrapper { display: flex; width: 100%; }
        .sent-wrapper { justify-content: flex-end; }
        .received-wrapper { justify-content: flex-start; }
        .bubble { max-width: 65%; padding: 10px 14px; border-radius: 15px; }
        .sent { background: #2563eb; }
        .received { background: #1e293b; border: 1px solid #334155; }
        .footer { font-size: 10px; opacity: 0.6; margin-top: 4px; text-align: right; }
        .input-box { padding: 20px; display: flex; gap: 10px; background: #020617; border-top: 1px solid #1e293b; }
        .input-box input { flex: 1; padding: 12px 18px; background: #1e293b; border: none; color: white; border-radius: 20px; outline: none; }
        .input-box button { background: #3b82f6; border: none; color: white; padding: 0 25px; border-radius: 20px; cursor: pointer; font-weight: bold; }
        .create-btn { width: 100%; padding: 10px; background: #1e293b; border: 1px dashed #334155; color: #3b82f6; border-radius: 8px; cursor: pointer; margin-bottom: 15px; font-weight: bold; }
        .loading, .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #64748b; }
      `}</style>
    </div>
  );
}
