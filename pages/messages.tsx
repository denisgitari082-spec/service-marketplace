"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../src/lib/supabaseClient";

// 1. DEFINE TYPES FIRST (This fixes the "Cannot find name ChatUser" error)
type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
};

type ChatUser = {
  id: string;
  email: string;
};

export default function MessagesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  
  const [showSearch, setShowSearch] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResult, setSearchResult] = useState<ChatUser | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setCurrentUser(data.user);
        fetchChatList(data.user.id);
      }
    };
    getUser();
  }, []);

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

  const handleSearchUser = async () => {
    if (!searchEmail) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", searchEmail)
      .single();

    if (data) {
      setSearchResult(data);
    } else {
      alert("User not found");
    }
  };

  const startNewChat = (user: ChatUser) => {
    if (!chats.find(c => c.id === user.id)) {
      setChats([user, ...chats]);
    }
    setSelectedUser(user);
    setShowSearch(false);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !currentUser) return;

    const { error } = await supabase.from("messages").insert([
      { sender_id: currentUser.id, receiver_id: selectedUser.id, text: newMessage }
    ]);

    if (!error) setNewMessage("");
  };

  return (
    <div className="messenger-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>My Chats</h3>
          <button className="add-btn" onClick={() => setShowSearch(true)}>+</button>
        </div>

        {showSearch && (
          <div className="search-box">
            <input 
              placeholder="Enter email..." 
              value={searchEmail} 
              onChange={(e) => setSearchEmail(e.target.value)} 
            />
            <button onClick={handleSearchUser}>Search</button>
            {searchResult && (
              <div className="result-item" onClick={() => startNewChat(searchResult)}>
                Start chat with {searchResult.email}
              </div>
            )}
            <button className="close-link" onClick={() => setShowSearch(false)}>Cancel</button>
          </div>
        )}

        {chats.map(user => (
          <div key={user.id} className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`} onClick={() => setSelectedUser(user)}>
            {user.email.split('@')[0]}
          </div>
        ))}
      </div>

      <div className="chat-window">
        {selectedUser ? (
          <>
            <div className="chat-header">Chatting with {selectedUser.email}</div>
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
          <div className="empty-state">Select a contact or click + to start a chat</div>
        )}
      </div>

      <style jsx>{`
        .messenger-container { display: flex; height: 100vh; background: #0f172a; color: white; }
        .sidebar { width: 280px; border-right: 1px solid #1e293b; padding: 20px; overflow-y: auto; }
        .sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .add-btn { background: #3b82f6; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 20px; }
        .search-box { background: #1e293b; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px; }
        .search-box input { padding: 8px; border-radius: 4px; border: none; background: #0f172a; color: white; }
        .result-item { background: #3b82f6; padding: 10px; border-radius: 4px; cursor: pointer; text-align: center; font-size: 13px; }
        .close-link { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; }
        .user-item { padding: 12px; cursor: pointer; border-radius: 8px; margin-bottom: 8px; background: #1e293b; transition: 0.2s; }
        .user-item:hover { background: #334155; }
        .user-item.active { background: #3b82f6; }
        .chat-window { flex: 1; display: flex; flex-direction: column; }
        .chat-header { padding: 20px; border-bottom: 1px solid #1e293b; font-weight: bold; background: #1e293b; }
        .message-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg-bubble { max-width: 70%; padding: 10px 15px; border-radius: 12px; font-size: 14px; line-height: 1.4; }
        .sent { align-self: flex-end; background: #3b82f6; border-bottom-right-radius: 2px; }
        .received { align-self: flex-start; background: #334155; border-bottom-left-radius: 2px; }
        .input-area { padding: 20px; display: flex; gap: 10px; background: #0f172a; border-top: 1px solid #1e293b; }
        .input-area input { flex: 1; padding: 12px; border-radius: 8px; border: none; background: #1e293b; color: white; outline: none; }
        .input-area button { background: #3b82f6; border: none; color: white; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: #64748b; font-style: italic; }
      `}</style>
    </div>
  );
}
