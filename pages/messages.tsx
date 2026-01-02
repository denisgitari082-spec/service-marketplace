"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../src/lib/supabaseClient";

type Message = { 
  id: string; 
  sender_id?: string; 
  receiver_id?: string; 
  group_id?: string; 
  text: string; 
  created_at: string; 
  is_read: boolean; 
};

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

  // Group Create States
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper: Format Time
  const formatTime = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // 1. App Initialization
  useEffect(() => {
    const initApp = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      
      setCurrentUser(user);

      // Upsert profile
      await supabase.from("profiles").upsert({ 
        id: user.id, 
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
        category: 'Professional'
      });

      const { data: users } = await supabase.from("profiles").select("*").neq("id", user.id);
      const { data: groups } = await supabase.from("groups").select("*");
      
      setSuggestedUsers(users || []);
      setSuggestedGroups(groups || []);
      setLoading(false);
    };
    initApp();
  }, []);

  // 2. Mark Messages as Read
  const markAsRead = async (targetId: string) => {
    if (!currentUser) return;
    await supabase.from("messages")
      .update({ is_read: true })
      .eq("sender_id", targetId)
      .eq("receiver_id", currentUser.id)
      .eq("is_read", false);
  };

  // 3. Chat Logic & Realtime
  useEffect(() => {
    if (!selectedTarget || !currentUser?.id) return;

    const fetchMessages = async () => {
      let query = supabase.from("messages").select("*").order("created_at", { ascending: true });
      if ("email" in selectedTarget) {
        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedTarget.id}),and(sender_id.eq.${selectedTarget.id},receiver_id.eq.${currentUser.id})`);
        markAsRead(selectedTarget.id);
      } else {
        query = query.eq("group_id", selectedTarget.id);
      }
      const { data } = await query;
      setMessages(data || []);
    };

    fetchMessages();

    // CHANNEL SETUP (Messages + Presence)
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
          if (isMatch) {
            setMessages(prev => [...prev, m]);
            if (m.sender_id === selectedTarget.id) markAsRead(selectedTarget.id);
          }
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
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: currentUser.id, isTyping: false });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [selectedTarget, currentUser?.id]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isOtherTyping]);

  // 4. Actions
  const handleTyping = () => {
    if (!selectedTarget) return;
    const channel = supabase.channel(`chat-${selectedTarget.id}`);
    channel.track({ user_id: currentUser.id, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      channel.track({ user_id: currentUser.id, isTyping: false });
    }, 2000);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || !currentUser?.id) return;
    const { data, error } = await supabase.from("groups").insert([{ name: groupName, description: groupDesc, created_by: currentUser.id }]).select().single();
    if (!error) {
      setSuggestedGroups(prev => [data, ...prev]);
      setShowCreateGroup(false);
      setGroupName("");
      setSelectedTarget(data);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTarget) return;

    const isGroup = !("email" in selectedTarget);
    const { error } = await supabase.from("messages").insert([{
      text: newMessage,
      sender_id: currentUser.id,
      receiver_id: isGroup ? null : selectedTarget.id,
      group_id: isGroup ? selectedTarget.id : null,
      is_read: false
    }]);

    if (!error) {
      setNewMessage("");
      supabase.channel(`chat-${selectedTarget.id}`).track({ user_id: currentUser.id, isTyping: false });
    }
  };

  if (loading) return <div className="loading">Initializing Secure Chat...</div>;

  return (
    <div className="container">
      <div className="sidebar">
        <div className="tabs">
          <button className={view === "chats" ? "active" : ""} onClick={() => setView("chats")}>Inbox</button>
          <button className={view === "discover" ? "active" : ""} onClick={() => setView("discover")}>Explore</button>
        </div>
        <div className="list-content">
          <p className="section-title">{view === "chats" ? "DIRECT MESSAGES" : "PUBLIC GROUPS"}</p>
          {view === "chats" ? (
            suggestedUsers.map(u => (
              <div key={u.id} className={`row ${selectedTarget?.id === u.id ? 'active' : ''}`} onClick={() => setSelectedTarget(u)}>
                <div className="avatar">{u.full_name?.[0]}</div>
                <div className="details">
                  <div className="name">{u.full_name}</div>
                  <div className="meta">{u.category}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="explore">
              <button className="create-btn" onClick={() => setShowCreateGroup(true)}>+ New Community</button>
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
            <div className="header">
              {"email" in selectedTarget ? selectedTarget.full_name : selectedTarget.name}
            </div>
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id} className={`bubble-wrapper ${m.sender_id === currentUser.id ? 'sent-wrapper' : 'received-wrapper'}`}>
                  <div className={`bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}`}>
                    <div className="text">{m.text}</div>
                    <div className="footer">
                      <span className="time">{formatTime(m.created_at)}</span>
                      {m.sender_id === currentUser.id && (
                        <span className="status">{m.is_read ? " • Seen" : " • Delivered"}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isOtherTyping && (
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
            <form className="input-box" onSubmit={sendMessage}>
              <input 
                value={newMessage} 
                onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }} 
                placeholder="Write a message..." 
              />
              <button type="submit">SEND</button>
            </form>
          </>
        ) : (
          <div className="empty">Select a conversation to start messaging</div>
        )}
      </div>

      {showCreateGroup && (
        <div className="modal-bg">
          <form className="modal" onSubmit={handleCreateGroup}>
            <h3>Create Group</h3>
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
        .container { display: flex; height: 100vh; background: #0f172a; color: white; font-family: 'Inter', system-ui, sans-serif; }
        .sidebar { width: 320px; border-right: 1px solid #1e293b; background: #020617; display: flex; flex-direction: column; }
        .tabs { display: flex; border-bottom: 1px solid #1e293b; }
        .tabs button { flex: 1; padding: 18px; background: none; border: none; color: #64748b; cursor: pointer; font-weight: bold; }
        .tabs button.active { color: #3b82f6; border-bottom: 2px solid #3b82f6; background: #0f172a; }
        .list-content { flex: 1; overflow-y: auto; padding: 15px; }
        .section-title { font-size: 11px; color: #475569; margin: 10px 0 15px; letter-spacing: 1px; font-weight: bold; }
        .row { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; cursor: pointer; margin-bottom: 4px; transition: 0.2s; }
        .row:hover { background: #1e293b; }
        .row.active { background: #2563eb; }
        .avatar { width: 42px; height: 42px; background: #334155; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .avatar.group { background: #10b981; }
        .name { font-size: 14px; font-weight: 600; }
        .meta { font-size: 12px; opacity: 0.6; }
        .create-btn { width: 100%; padding: 12px; background: #3b82f6; border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: bold; margin-bottom: 15px; }

        .chat-window { flex: 1; display: flex; flex-direction: column; background: #0f172a; }
        .header { padding: 20px 25px; border-bottom: 1px solid #1e293b; font-weight: bold; background: #020617; font-size: 17px; }
        .messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
        
        .bubble-wrapper { display: flex; width: 100%; }
        .sent-wrapper { justify-content: flex-end; }
        .received-wrapper { justify-content: flex-start; }
        
        .bubble { max-width: 65%; padding: 10px 15px; border-radius: 18px; position: relative; }
        .sent { background: #2563eb; border-bottom-right-radius: 4px; }
        .received { background: #1e293b; border-bottom-left-radius: 4px; border: 1px solid #334155; }
        
        .footer { display: flex; justify-content: flex-end; align-items: center; gap: 4px; margin-top: 4px; font-size: 10px; opacity: 0.7; }
        .status { color: #93c5fd; font-weight: bold; }

        .input-box { padding: 20px; display: flex; gap: 12px; background: #020617; border-top: 1px solid #1e293b; }
        .input-box input { flex: 1; padding: 14px 22px; background: #1e293b; border: 1px solid #334155; color: white; border-radius: 30px; outline: none; }
        .input-box button { background: #3b82f6; border: none; color: white; padding: 0 25px; border-radius: 30px; cursor: pointer; font-weight: bold; }

        /* Typing Dot Animation */
        .typing-indicator { display: flex; gap: 4px; padding: 10px 15px; background: #1e293b; border-radius: 15px; width: fit-content; margin-bottom: 10px; }
        .typing-indicator span { width: 6px; height: 6px; background: #3b82f6; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out; }
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .modal { background: #1e293b; padding: 30px; border-radius: 16px; width: 380px; display: flex; flex-direction: column; gap: 15px; }
        .modal input, .modal textarea { padding: 12px; background: #0f172a; border: 1px solid #334155; color: white; border-radius: 8px; }
        .confirm-btn { background: #3b82f6; border: none; padding: 12px; color: white; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .loading, .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 16px; }
      `}</style>
    </div>
  );
}
