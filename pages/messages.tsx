"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../src/lib/supabaseClient";

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
};

type ChatUser = {
  id: string;
  email: string; // Ideally, join with a 'profiles' table for names
};

export default function MessagesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setCurrentUser(data.user);
        fetchChatList(data.user.id);
      }
    };
    getUser();
  }, []);

  // 1. Fetch the list of people you've exchanged messages with
  const fetchChatList = async (userId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("sender_id, receiver_id")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    if (data) {
      // Get unique IDs of people you are chatting with
      const chatIds = Array.from(new Set(data.flatMap(m => [m.sender_id, m.receiver_id])))
        .filter(id => id !== userId);
      
      // For this example, we fetch emails. In a real app, fetch from 'profiles' table.
      const { data: users } = await supabase.from("profiles").select("id, email").in("id", chatIds);
      setChats(users || []);
    }
  };

  // 2. Fetch conversation history
  useEffect(() => {
    if (selectedUser && currentUser) {
      const fetchMessages = async () => {
        const { data } = await supabase
          .from("messages")
          .select("*")
          .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`)
          .order("created_at", { ascending: true });
        setMessages(data || []);
      };
      fetchMessages();

      // 3. Real-time Subscription for new messages
      const channel = supabase
        .channel(`chat-${selectedUser.id}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages' 
        }, (payload) => {
          const msg = payload.new as Message;
          if (msg.sender_id === selectedUser.id || msg.receiver_id === selectedUser.id) {
            setMessages(prev => [...prev, msg]);
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedUser, currentUser]);

  // Scroll to bottom when new messages arrive
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;

    const { error } = await supabase.from("messages").insert([
      { sender_id: currentUser.id, receiver_id: selectedUser.id, text: newMessage }
    ]);

    if (!error) setNewMessage("");
  };

  return (
    <div className="messenger-container">
      {/* Sidebar: Chat List */}
      <div className="sidebar">
        <h3>My Chats</h3>
        {chats.map(user => (
          <div 
            key={user.id} 
            className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
            onClick={() => setSelectedUser(user)}
          >
            {user.email.split('@')[0]}
          </div>
        ))}
      </div>

      {/* Chat Window */}
      <div className="chat-window">
        {selectedUser ? (
          <>
            <div className="chat-header">Chatting with {selectedUser.email}</div>
            <div className="message-list">
              {messages.map((m) => (
                <div key={m.id} className={`msg-bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}`}>
                  {m.text}
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
            <form className="input-area" onSubmit={sendMessage}>
              <input 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
                placeholder="Type a message..." 
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="empty-state">Select a contact to start messaging</div>
        )}
      </div>

      <style jsx>{`
        .messenger-container { display: flex; height: 100vh; background: #0f172a; color: white; }
        .sidebar { width: 250px; border-right: 1px solid #1e293b; padding: 20px; }
        .user-item { padding: 12px; cursor: pointer; border-radius: 8px; margin-bottom: 5px; background: #1e293b; }
        .user-item.active { background: #3b82f6; }
        
        .chat-window { flex: 1; display: flex; flex-direction: column; }
        .chat-header { padding: 20px; border-bottom: 1px solid #1e293b; font-weight: bold; }
        .message-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        
        .msg-bubble { max-width: 70%; padding: 10px 15px; border-radius: 12px; font-size: 14px; }
        .sent { align-self: flex-end; background: #3b82f6; color: white; border-bottom-right-radius: 2px; }
        .received { align-self: flex-start; background: #334155; color: white; border-bottom-left-radius: 2px; }
        
        .input-area { padding: 20px; display: flex; gap: 10px; border-top: 1px solid #1e293b; }
        .input-area input { flex: 1; padding: 12px; border-radius: 8px; border: none; background: #1e293b; color: white; }
        .input-area button { background: #3b82f6; border: none; color: white; padding: 10px 20px; border-radius: 8px; cursor: pointer; }
        .empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: #64748b; }
      `}</style>
    </div>
  );
}
