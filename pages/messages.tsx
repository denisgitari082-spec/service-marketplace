"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../src/lib/supabaseClient";

// --- Types ---
type Message = {
  id: string;
  sender_id?: string;
  receiver_id?: string;
  group_id?: string;
  text: string;
  created_at: string;
};

type ChatUser = { id: string; email: string };
type Group = { id: string; name: string; description: string };

export default function MessagesPage() {
  // State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [view, setView] = useState<"chats" | "discover">("chats");
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<ChatUser[]>([]);
  const [suggestedGroups, setSuggestedGroups] = useState<Group[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<ChatUser | Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load: Auth & Discovery Data
  useEffect(() => {
    const setup = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setCurrentUser(data.user);
        fetchChatList(data.user.id);
        fetchDiscovery(data.user.id);
      }
    };
    setup();
  }, []);

  // 2. Fetch Active Chat List
  const fetchChatList = async (userId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("sender_id, receiver_id")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    if (data) {
      const chatIds = Array.from(new Set(data.flatMap(m => [m.sender_id, m.receiver_id])))
        .filter(id => id !== userId);
      const { data: users } = await supabase.from("profiles").select("id, email").in("id", chatIds);
      setChats(users || []);
    }
  };

  // 3. Fetch Suggestions (Users you haven't messaged & Public Groups)
  const fetchDiscovery = async (userId: string) => {
    const { data: users } = await supabase.from("profiles").select("id, email").neq("id", userId).limit(5);
    const { data: groups } = await supabase.from("groups").select("*").eq("is_public", true).limit(5);
    setSuggestedUsers(users || []);
    setSuggestedGroups(groups || []);
  };

  // 4. Load Messages for selected User or Group
  useEffect(() => {
    if (!selectedTarget || !currentUser) return;

    const fetchMessages = async () => {
      let query = supabase.from("messages").select("*").order("created_at", { ascending: true });
      
      if ("email" in selectedTarget) {
        // Direct Message
        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedTarget.id}),and(sender_id.eq.${selectedTarget.id},receiver_id.eq.${currentUser.id})`);
      } else {
        // Group Message
        query = query.eq("group_id", selectedTarget.id);
      }

      const { data } = await query;
      setMessages(data || []);
    };

    fetchMessages();

    // Real-time listener
    const channel = supabase.channel(`room-${selectedTarget.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => [...prev, msg]);
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedTarget, currentUser]);

  // 5. Send Message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTarget || !currentUser) return;

    const isGroup = !("email" in selectedTarget);
    const payload: any = { 
        sender_id: currentUser.id, 
        text: newMessage,
        group_id: isGroup ? selectedTarget.id : null,
        receiver_id: isGroup ? null : selectedTarget.id 
    };

    const { error } = await supabase.from("messages").insert([payload]);
    if (!error) setNewMessage("");
  };

  // 6. Join Group Logic
  const handleJoinGroup = async (group: Group) => {
    const { error } = await supabase.from("group_members").insert([{ group_id: group.id, user_id: currentUser.id }]);
    if (!error) {
        setSelectedTarget(group);
        setView("chats");
    } else {
        alert("Already a member or error joining.");
    }
  };

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="messenger-container">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-tabs">
          <button className={view === "chats" ? "active" : ""} onClick={() => setView("chats")}>Chats</button>
          <button className={view === "discover" ? "active" : ""} onClick={() => setView("discover")}>Discover</button>
        </div>

        <div className="sidebar-content">
          {view === "chats" ? (
            chats.length > 0 ? chats.map(u => (
              <div key={u.id} className={`item ${selectedTarget?.id === u.id ? 'active' : ''}`} onClick={() => setSelectedTarget(u)}>
                <div className="avatar">{u.email[0].toUpperCase()}</div>
                <span>{u.email.split('@')[0]}</span>
              </div>
            )) : <p className="empty-txt">No active chats</p>
          ) : (
            <div className="discover-list">
              <section>
                <h4>Suggested People</h4>
                {suggestedUsers.map(u => (
                  <div key={u.id} className="suggested-item">
                    <span>{u.email.split('@')[0]}</span>
                    <button onClick={() => { setSelectedTarget(u); setView("chats"); }}>Chat</button>
                  </div>
                ))}
              </section>
              <section style={{marginTop: '24px'}}>
                <h4>Public Groups</h4>
                {suggestedGroups.map(g => (
                  <div key={g.id} className="suggested-item">
                    <span>{g.name}</span>
                    <button className="join-btn" onClick={() => handleJoinGroup(g)}>Join</button>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      </div>

      {/* CHAT WINDOW */}
      <div className="chat-window">
        {selectedTarget ? (
          <>
            <div className="chat-header">
              {"email" in selectedTarget ? selectedTarget.email : `Group: ${selectedTarget.name}`}
            </div>
            <div className="message-list">
              {messages.map((m) => (
                <div key={m.id} className={`msg-bubble ${m.sender_id === currentUser?.id ? 'sent' : 'received'}`}>
                  {m.text}
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
            <form className="input-area" onSubmit={sendMessage}>
              <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="empty-state">
            <h2>Welcome to Marketplace Social</h2>
            <p>Select a contact or go to Discover to find new people and groups.</p>
          </div>
        )}
      </div>

      <style jsx>{`
        .messenger-container { display: flex; height: 100vh; background: #0f172a; color: white; font-family: -apple-system, sans-serif; }
        .sidebar { width: 300px; border-right: 1px solid #1e293b; display: flex; flex-direction: column; background: #111827; }
        .sidebar-tabs { display: flex; border-bottom: 1px solid #1e293b; }
        .sidebar-tabs button { flex: 1; padding: 15px; background: none; border: none; color: #64748b; cursor: pointer; transition: 0.3s; }
        .sidebar-tabs button.active { color: #3b82f6; border-bottom: 2px solid #3b82f6; background: #1e293b; }
        .sidebar-content { flex: 1; overflow-y: auto; padding: 15px; }
        .item { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; cursor: pointer; margin-bottom: 8px; transition: 0.2s; }
        .item:hover { background: #1e293b; }
        .item.active { background: #3b82f6; }
        .avatar { width: 35px; height: 35px; background: #334155; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .suggested-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1e293b; border-radius: 8px; margin-bottom: 8px; }
        .suggested-item button { background: #3b82f6; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
        .join-btn { background: #10b981 !important; }
        .chat-window { flex: 1; display: flex; flex-direction: column; background: #0f172a; }
        .chat-header { padding: 20px; font-weight: bold; background: #111827; border-bottom: 1px solid #1e293b; }
        .message-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .msg-bubble { max-width: 70%; padding: 12px 16px; border-radius: 15px; font-size: 14px; }
        .sent { align-self: flex-end; background: #3b82f6; color: white; border-bottom-right-radius: 2px; }
        .received { align-self: flex-start; background: #1e293b; color: white; border-bottom-left-radius: 2px; }
        .input-area { padding: 20px; display: flex; gap: 10px; border-top: 1px solid #1e293b; }
        .input-area input { flex: 1; padding: 12px; border-radius: 8px; border: none; background: #1e293b; color: white; }
        .input-area button { background: #3b82f6; border: none; color: white; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #64748b; }
        h4 { font-size: 11px; text-transform: uppercase; color: #4b5563; margin-bottom: 10px; }
      `}</style>
    </div>
  );
}
