"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../src/lib/supabaseClient";

type Message = { id: string; sender_id?: string; receiver_id?: string; group_id?: string; text: string; created_at: string; is_read: boolean; };
type ChatUser = { id: string; email: string; full_name: string; category: string };
type Group = { id: string; name: string; description: string };

export default function MessagesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [view, setView] = useState<"chats" | "discover">("chats");
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

  const formatTime = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    const initApp = async () => {
      setLoading(true);
      console.log("Checking session...");
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error("Auth Error:", authError);
        setLoading(false);
        return;
      }
      
      setCurrentUser(user);

      // 1. Sync YOUR profile first
      const myName = user.user_metadata?.full_name || user.email?.split('@')[0] || "User";
      const { error: upsertError } = await supabase.from("profiles").upsert({ 
        id: user.id, 
        email: user.email,
        full_name: myName,
        category: 'Professional'
      });

      if (upsertError) console.error("Profile sync failed:", upsertError);

      // 2. Fetch OTHERS (Explicitly selecting full_name)
      const { data: users, error: userError } = await supabase
        .from("profiles")
        .select("id, email, full_name, category")
        .neq("id", user.id); 

      if (userError) {
        console.error("Critical User Fetch Error:", userError.message);
      } else {
        console.log("Profiles loaded:", users); // Watch this in F12
        setSuggestedUsers(users || []);
      }

      const { data: groups } = await supabase.from("groups").select("*");
      setSuggestedGroups(groups || []);

      setLoading(false);
    };
    initApp();
  }, []);

  // Real-time & Chat Logic
  useEffect(() => {
    if (!selectedTarget || !currentUser?.id) return;

    const fetchMessages = async () => {
      let query = supabase.from("messages").select("*").order("created_at", { ascending: true });
      if ("email" in selectedTarget) {
        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedTarget.id}),and(sender_id.eq.${selectedTarget.id},receiver_id.eq.${currentUser.id})`);
      } else {
        query = query.eq("group_id", selectedTarget.id);
      }
      const { data } = await query;
      setMessages(data || []);
      
      if ("email" in selectedTarget) {
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
        if (payload.eventType === 'UPDATE') {
          const updatedMsg = payload.new as Message;
          setMessages(prev => prev.map(msg => msg.id === updatedMsg.id ? updatedMsg : msg));
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typingUsers = Object.values(state).flat().filter((p: any) => p.isTyping && p.user_id !== currentUser.id);
        setIsOtherTyping(typingUsers.length > 0);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ user_id: currentUser.id, isTyping: false });
      });

    return () => { supabase.removeChannel(channel); };
  }, [selectedTarget, currentUser?.id]);

  const handleTyping = () => {
    if (!selectedTarget) return;
    const channel = supabase.channel(`chat-${selectedTarget.id}`);
    channel.track({ user_id: currentUser.id, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      channel.track({ user_id: currentUser.id, isTyping: false });
    }, 2000);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTarget) return;

    const isGroup = !("email" in selectedTarget);
    await supabase.from("messages").insert([{
      text: newMessage,
      sender_id: currentUser.id,
      receiver_id: isGroup ? null : selectedTarget.id,
      group_id: isGroup ? selectedTarget.id : null,
      is_read: false
    }]);

    setNewMessage("");
    supabase.channel(`chat-${selectedTarget.id}`).track({ user_id: currentUser.id, isTyping: false });
  };

  if (loading) return <div className="loading">Checking users...</div>;

  return (
    <div className="container">
      <div className="sidebar">
        <div className="tabs">
          <button className={view === "chats" ? "active" : ""} onClick={() => setView("chats")}>Inbox</button>
          <button className={view === "discover" ? "active" : ""} onClick={() => setView("discover")}>Explore</button>
        </div>
        <div className="list-content">
          <p className="section-title">{view === "chats" ? "ACTIVE PROS" : "GROUPS"}</p>
          
          {view === "chats" && suggestedUsers.length === 0 && (
            <div className="empty-notice">No other users have joined yet.</div>
          )}

          {view === "chats" ? (
            suggestedUsers.map(u => (
              <div key={u.id} className={`row ${selectedTarget?.id === u.id ? 'active' : ''}`} onClick={() => setSelectedTarget(u)}>
                <div className="avatar">{u.full_name?.[0] || u.email?.[0] || "?"}</div>
                <div className="details">
                  <div className="name">{u.full_name}</div>
                  <div className="meta">{u.category}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="explore">
              <button className="create-btn" onClick={() => setShowCreateGroup(true)}>+ Create Group</button>
              {suggestedGroups.map(g => (
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
            <div className="header">{"full_name" in selectedTarget ? selectedTarget.full_name : selectedTarget.name}</div>
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id} className={`bubble-wrapper ${m.sender_id === currentUser.id ? 'sent-wrapper' : 'received-wrapper'}`}>
                  <div className={`bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}`}>
                    <div className="text">{m.text}</div>
                    <div className="footer">
                      <span className="time">{formatTime(m.created_at)}</span>
                      {m.sender_id === currentUser.id && <span className="status">{m.is_read ? " • Seen" : " • Delivered"}</span>}
                    </div>
                  </div>
                </div>
              ))}
              {isOtherTyping && <div className="typing-indicator"><span></span><span></span><span></span></div>}
              <div ref={scrollRef} />
            </div>
            <form className="input-box" onSubmit={sendMessage}>
              <input value={newMessage} onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }} placeholder="Type here..." />
              <button type="submit">SEND</button>
            </form>
          </>
        ) : <div className="empty">Select someone to chat</div>}
      </div>

      {showCreateGroup && (
        <div className="modal-bg">
          <form className="modal" onSubmit={async (e) => {
              e.preventDefault();
              const { data, error } = await supabase.from("groups").insert([{ name: groupName, description: groupDesc, created_by: currentUser.id }]).select().single();
              if (!error) { setSuggestedGroups([data, ...suggestedGroups]); setShowCreateGroup(false); setGroupName(""); }
            }}>
            <h3>New Group</h3>
            <input placeholder="Name" value={groupName} onChange={e => setGroupName(e.target.value)} required />
            <textarea placeholder="Description" value={groupDesc} onChange={e => setGroupDesc(e.target.value)} />
            <div className="modal-btns">
              <button type="button" onClick={() => setShowCreateGroup(false)}>Cancel</button>
              <button type="submit" className="confirm-btn">Create</button>
            </div>
          </form>
        </div>
      )}

      <style jsx>{`
        .container { display: flex; height: 100vh; background: #0f172a; color: white; font-family: sans-serif; }
        .sidebar { width: 300px; border-right: 1px solid #1e293b; background: #020617; display: flex; flex-direction: column; }
        .tabs { display: flex; border-bottom: 1px solid #1e293b; }
        .tabs button { flex: 1; padding: 15px; background: none; border: none; color: #64748b; cursor: pointer; font-weight: bold; }
        .tabs button.active { color: #3b82f6; border-bottom: 2px solid #3b82f6; }
        .list-content { flex: 1; overflow-y: auto; padding: 15px; }
        .section-title { font-size: 11px; color: #475569; margin-bottom: 15px; font-weight: bold; }
        .empty-notice { padding: 20px; text-align: center; color: #475569; font-size: 13px; border: 1px dashed #1e293b; border-radius: 8px; }
        .row { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 10px; cursor: pointer; margin-bottom: 5px; }
        .row.active { background: #2563eb; }
        .avatar { width: 38px; height: 38px; background: #334155; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .avatar.group { background: #10b981; }
        .name { font-size: 14px; font-weight: 600; }
        .meta { font-size: 11px; opacity: 0.6; }
        .chat-window { flex: 1; display: flex; flex-direction: column; }
        .header { padding: 18px; border-bottom: 1px solid #1e293b; font-weight: bold; background: #020617; }
        .messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
        .bubble-wrapper { display: flex; width: 100%; }
        .sent-wrapper { justify-content: flex-end; }
        .received-wrapper { justify-content: flex-start; }
        .bubble { max-width: 65%; padding: 10px 14px; border-radius: 15px; }
        .sent { background: #2563eb; }
        .received { background: #1e293b; border: 1px solid #334155; }
        .footer { display: flex; justify-content: flex-end; font-size: 10px; opacity: 0.7; margin-top: 4px; }
        .status { color: #93c5fd; }
        .input-box { padding: 20px; display: flex; gap: 10px; background: #020617; border-top: 1px solid #1e293b; }
        .input-box input { flex: 1; padding: 12px 18px; background: #1e293b; border: none; color: white; border-radius: 20px; outline: none; }
        .input-box button { background: #3b82f6; border: none; color: white; padding: 0 20px; border-radius: 20px; cursor: pointer; font-weight: bold; }
        .typing-indicator { display: flex; gap: 3px; padding: 8px 12px; background: #1e293b; border-radius: 12px; width: fit-content; margin-bottom: 10px; }
        .typing-indicator span { width: 5px; height: 5px; background: #3b82f6; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out; }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .modal { background: #1e293b; padding: 25px; border-radius: 15px; width: 350px; display: flex; flex-direction: column; gap: 12px; }
        .modal input, .modal textarea { padding: 10px; background: #0f172a; border: 1px solid #334155; color: white; border-radius: 8px; }
        .confirm-btn { background: #3b82f6; border: none; padding: 10px; color: white; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .loading, .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #64748b; }
      `}</style>
    </div>
  );
}
