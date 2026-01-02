"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../src/lib/supabaseClient";

type Message = { id: string; sender_id?: string; receiver_id?: string; group_id?: string; text: string; created_at: string; };
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

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initApp = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }
      
      setCurrentUser(user);

      // Sync profile
      const displayName = user.user_metadata?.full_name || user.email?.split('@')[0];
      await supabase.from("profiles").upsert({ 
        id: user.id, 
        email: user.email,
        full_name: displayName,
        category: 'Professional'
      });

      // Fetch ALL profiles except current user
      const { data: users, error: userErr } = await supabase
        .from("profiles")
        .select("id, email, full_name, category")
        .neq("id", user.id);
      
      if (userErr) console.error("Error fetching users:", userErr);
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
      
      // FIX: Check if the target has a 'full_name' (User) or 'name' (Group)
      const isUser = "full_name" in selectedTarget;

      if (isUser) {
        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedTarget.id}),and(sender_id.eq.${selectedTarget.id},receiver_id.eq.${currentUser.id})`);
      } else {
        query = query.eq("group_id", selectedTarget.id);
      }

      const { data } = await query;
      setMessages(data || []);
    };

    fetchMessages();

    const channel = supabase.channel(`room-${selectedTarget.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as Message;
        const isUser = "full_name" in selectedTarget;

        if (!isUser && newMsg.group_id === selectedTarget.id) {
            setMessages(prev => [...prev, newMsg]);
        } else if (isUser && (
            (newMsg.sender_id === selectedTarget.id && newMsg.receiver_id === currentUser.id) ||
            (newMsg.sender_id === currentUser.id && newMsg.receiver_id === selectedTarget.id)
        )) {
            setMessages(prev => [...prev, newMsg]);
        }
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedTarget, currentUser?.id]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTarget) return;

    const isUser = "full_name" in selectedTarget;
    const { error } = await supabase.from("messages").insert([{
      text: newMessage,
      sender_id: currentUser.id,
      receiver_id: isUser ? selectedTarget.id : null,
      group_id: isUser ? null : selectedTarget.id
    }]);

    if (!error) {
      setNewMessage("");
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="container">
      <div className="sidebar">
        <div className="tabs">
          <button className={view === "chats" ? "active" : ""} onClick={() => setView("chats")}>Inbox</button>
          <button className={view === "discover" ? "active" : ""} onClick={() => setView("discover")}>Explore</button>
        </div>

        <div className="list-content">
          {view === "chats" ? (
            <>
              <p className="section-title">SUGGESTED PROS</p>
              {suggestedUsers.length === 0 && <p className="empty-hint">No pros found.</p>}
              {suggestedUsers.map(u => (
                <div key={u.id} className={`row ${selectedTarget?.id === u.id ? 'active' : ''}`} onClick={() => setSelectedTarget(u)}>
                  <div className="avatar">{u.full_name?.[0] || "?"}</div>
                  <div className="details">
                    <div className="name">{u.full_name || "Unknown"}</div>
                    <div className="meta">{u.category}</div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="explore">
              <button className="create-btn" onClick={() => setShowCreateGroup(true)}>+ New Group</button>
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
              {"full_name" in selectedTarget ? selectedTarget.full_name : selectedTarget.name}
            </div>
            <div className="messages">
              {messages.map((m, i) => (
                <div key={m.id || i} className={`bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}`}>
                  {m.text}
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
            <form className="input-box" onSubmit={sendMessage}>
              <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type a message..." />
              <button type="submit">SEND</button>
            </form>
          </>
        ) : (
          <div className="empty">Select a conversation</div>
        )}
      </div>

      {/* CSS remains the same as your provided style */}
      <style jsx>{`
        .container { display: flex; height: 100vh; background: #0f172a; color: white; font-family: sans-serif; }
        .sidebar { width: 300px; border-right: 1px solid #1e293b; display: flex; flex-direction: column; background: #020617; }
        .tabs { display: flex; border-bottom: 1px solid #1e293b; }
        .tabs button { flex: 1; padding: 15px; background: none; border: none; color: #64748b; cursor: pointer; }
        .tabs button.active { color: #3b82f6; border-bottom: 2px solid #3b82f6; background: #161e2e; }
        .list-content { flex: 1; overflow-y: auto; padding: 15px; }
        .section-title { font-size: 10px; color: #475569; margin: 20px 0 10px; letter-spacing: 1px; }
        .empty-hint { font-size: 12px; color: #475569; text-align: center; }
        .row { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 8px; cursor: pointer; margin-bottom: 5px; }
        .row:hover { background: #1e293b; }
        .row.active { background: #3b82f6; }
        .avatar { width: 36px; height: 36px; background: #334155; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; }
        .avatar.group { background: #10b981; }
        .name { font-size: 14px; font-weight: 500; }
        .chat-window { flex: 1; display: flex; flex-direction: column; }
        .header { padding: 20px; border-bottom: 1px solid #1e293b; font-weight: bold; background: #020617; }
        .messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .bubble { max-width: 70%; padding: 10px 15px; border-radius: 15px; font-size: 14px; }
        .sent { align-self: flex-end; background: #3b82f6; }
        .received { align-self: flex-start; background: #1e293b; }
        .input-box { padding: 20px; display: flex; gap: 10px; border-top: 1px solid #1e293b; background: #020617; }
        .input-box input { flex: 1; padding: 12px; background: #1e293b; border: none; color: white; border-radius: 8px; }
        .input-box button { background: #3b82f6; border: none; color: white; padding: 0 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #475569; }
        .loading { height: 100vh; display: flex; align-items: center; justify-content: center; color: white; }
      `}</style>
    </div>
  );
}
