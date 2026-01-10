"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/router";
import { supabase } from "../src/lib/supabaseClient";

type Message = {
  id: string;
  sender_id?: string;
  receiver_id?: string;
  group_id?: string;
  text: string;
  file_url?: string;
  created_at: string;
  is_read: boolean;
};

type ChatUser = {
  id: string;
  email: string;
  avatar_url?: string;
  full_name: string;
  unread_count?: number;
  last_message_at?: string;
};

type Group = { id: string; name: string; description: string };

export default function MessagesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [view, setView] = useState<"chats" | "discover">("chats");
  const [searchQuery, setSearchQuery] = useState("");
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<ChatUser[]>([]);
  const [suggestedGroups, setSuggestedGroups] = useState<Group[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<ChatUser | Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [uploading, setUploading] = useState(false);




  const { user } = router.query;
  // --- SIDEBAR STATE ---
const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // --- NEW FEATURES STATE ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [sidebarMenuOpenId, setSidebarMenuOpenId] = useState<string | null>(null);

  // --- PRESENCE STATE ---
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedTargetRef = useRef<ChatUser | Group | null>(null);
  const [showScrollArrow, setShowScrollArrow] = useState(false);
const messageListRef = useRef<HTMLDivElement>(null); // To track the scrollable container

// Inside MessagesPage component
const [incomingCall, setIncomingCall] = useState<any>(null);

useEffect(() => {
  if (!router.isReady) return;
  if (!user || typeof user !== "string") return;
  if (!currentUser) return;

  const initChatFromUrl = async () => {
    // 1️⃣ Fetch user profile
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .eq("id", user)
      .single();

    if (error || !profile) {
      console.error("Failed to load chat user", error);
      return;
    }

    // 2️⃣ SET THE CHAT TARGET (THIS WAS MISSING)
    setSelectedTarget(profile);

    // 3️⃣ Load messages
    openChatWithUser(profile.id);
  };

  initChatFromUrl();

  // Clean URL
  router.replace("/messages", undefined, { shallow: true });
}, [router.isReady, user, currentUser]);


function setActiveUserId(userId: string) {
  if (selectedTargetRef.current && "id" in selectedTargetRef.current) {
    selectedTargetRef.current.id = userId;
  }
}

const openChatWithUser = async (otherUserId: string) => {
  if (!currentUser?.id || !otherUserId || otherUserId === currentUser.id) return;

  setActiveUserId(otherUserId);

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .in("sender_id", [currentUser.id, otherUserId])
    .in("receiver_id", [currentUser.id, otherUserId])
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  setMessages(data || []);
};






useEffect(() => {
  if (!currentUser) return;

  const personalChannel = supabase.channel(`inbox:${currentUser.id}`)
    .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
      // Show the Accept/Decline UI
      setIncomingCall(payload);
      
      // Optional: Play a ringtone sound here
      const audio = new Audio('/ringtone.mp3');
      audio.play();
    })
    .subscribe();

  return () => { supabase.removeChannel(personalChannel); };
}, [currentUser]);

const handleAcceptCall = () => {
  window.open(
    `/call?type=${incomingCall.type}&targetId=${incomingCall.callerId}&role=receiver`,
    "_blank",
    "width=1000,height=700"
  );
  setIncomingCall(null);
};



const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  const target = e.currentTarget;
  // Calculate how far we are from the bottom
  const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
  
  // Show arrow if we are more than 300px away from the bottom
  setShowScrollArrow(distanceToBottom > 300);
};

const handleDeclineCall = async () => {
  if (!incomingCall || !currentUser) return;

  const text = `📞 Missed ${incomingCall.type} call`;

  await supabase.from("messages").insert([{
    sender_id: incomingCall.callerId,
    receiver_id: currentUser.id,
    text: text,
    is_read: false
  }]);

  setIncomingCall(null);
  
  // Refresh UI
  fetchChatHistory(currentUser.id);
  
  // If we are currently in that chat, add it to the message list locally
  if (selectedTarget?.id === incomingCall.callerId) {
     // This adds it to the screen instantly
     const tempMsg: Message = {
        id: `missed-${Date.now()}`,
        text: text,
        sender_id: incomingCall.callerId,
        created_at: new Date().toISOString(),
        is_read: false,
        receiver_id: currentUser.id
     };
     setMessages(prev => [...prev, tempMsg]);
  }

};
const startCall = async (type: "video" | "voice") => {
  if (!selectedTarget || !currentUser) return;

  // 1. Notify the target user that you are calling them
  const callChannel = supabase.channel(`inbox:${selectedTarget.id}`);
  await callChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await callChannel.send({
        type: 'broadcast',
        event: 'incoming-call',
        payload: {
          callerId: currentUser.id,
          callerName: currentUser.user_metadata?.full_name || currentUser.email,
          type: type
        }
      });
    }
  });

  // 2. Open your own call window as the 'caller'
  window.open(
    `/call?type=${type}&targetId=${selectedTarget.id}&role=caller`,
    "_blank",
    "width=1000,height=700"
  );
};

const scrollToBottom = () => {
  scrollRef.current?.scrollIntoView({ behavior: "smooth" });
};

  useEffect(() => {
    selectedTargetRef.current = selectedTarget;
  }, [selectedTarget]);

useEffect(() => {
  if (!currentUser) return;

  const personalChannel = supabase.channel(`inbox:${currentUser.id}`)
    .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
      setIncomingCall(payload);
      new Audio('/ringtone.mp3').play().catch(() => {});
    })
    .on('broadcast', { event: 'call-cancelled' }, async ({ payload }) => {
       setIncomingCall(null);
       
       // 1. Insert the missed call record
       const missedCallMsg = {
          sender_id: payload.callerId === "system" ? currentUser.id : payload.callerId, 
          receiver_id: currentUser.id,
          text: `📞 Missed ${payload.type} call`,
          is_read: false
       };

       await supabase.from("messages").insert([missedCallMsg]);

       // 2. Refresh Sidebar so the badge/last message updates
       fetchChatHistory(currentUser.id);

       // 3. Refresh Messages IF the user is currently looking at the caller's chat
       if (selectedTargetRef.current && selectedTargetRef.current.id === payload.callerId) {
          // Trigger a re-fetch of messages for the active window
          const { data } = await supabase.from("messages")
            .select("*")
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${payload.callerId}),and(sender_id.eq.${payload.callerId},receiver_id.eq.${currentUser.id})`)
            .order("created_at", { ascending: true });
          
          if (data) setMessages(data);
       }
    })
    .subscribe();

  return () => { supabase.removeChannel(personalChannel); };
}, [currentUser]);
  // 1. Initial Load + Presence Tracking
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
        const { data: uData } = await supabase.from("profiles").select("id, email, full_name, avatar_url").neq("id", user.id);
        const { data: gData } = await supabase.from("groups").select("*");
        setSuggestedUsers(uData || []);
        setSuggestedGroups(gData || []);
        fetchChatHistory(user.id);

        const presenceChannel = supabase.channel('online-presence', {
          config: { presence: { key: user.id } }
        });

        presenceChannel
          .on('presence', { event: 'sync' }, () => {
            const newState = presenceChannel.presenceState();
            setOnlineUsers(Object.keys(newState));
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await presenceChannel.track({ online_at: new Date().toISOString() });
            }
          });
      }
    };
    init();
  }, []);

// 2. FETCH INBOX (Optimized via RPC)
const fetchChatHistory = async (userId: string) => {
  try {
    // Call the SQL function we created in the Supabase Editor
    const { data, error } = await supabase.rpc('get_my_chats', { user_id: userId });

    if (error) throw error;

    if (data) {
      // Map the data to match your ChatUser type and handle local active state
      const enrichedChats: ChatUser[] = data.map((chat: any) => {
        const isCurrentlyOpen = selectedTargetRef.current?.id === chat.id;

        return {
          id: chat.id,
          full_name: chat.full_name,
          email: chat.email,
           avatar_url: chat.avatar_url,
          // If the chat is currently open, show 0 unread to the user immediately
          unread_count: isCurrentlyOpen ? 0 : Number(chat.unread_count),
          last_message_at: chat.last_message_at
        };
      });

      // We don't need to sort here because the SQL function 
      // already handles "order by unread_count desc, last_message_at desc"
      setChats(enrichedChats);
    }
  } catch (err) {
    console.error("Error fetching chat history:", err);
  }
};
  // 3. GLOBAL INBOX LISTENER
  useEffect(() => {
    if (!currentUser) return;

    const globalChannel = supabase.channel('global-inbox-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.sender_id === currentUser.id) return;

        if (newMsg.receiver_id === currentUser.id) {
          const isActive = selectedTargetRef.current && newMsg.sender_id === selectedTargetRef.current.id;
          if (isActive) {
            supabase.from("messages").update({ is_read: true }).eq("id", newMsg.id);
            fetchChatHistory(currentUser.id);
          } else {
            fetchChatHistory(currentUser.id);
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(globalChannel); };
  }, [currentUser]);

  // 4. CHAT WINDOW LISTENER
  useEffect(() => {
    if (!selectedTarget || !currentUser) return;

const loadMsgs = async () => {
    if (!selectedTarget || !currentUser) return;

    // 1. Instant UI Feedback: Clear the badge locally so it feels fast
    setChats(prev => prev.map(chat =>
      chat.id === selectedTarget.id ? { ...chat, unread_count: 0 } : chat
    ));

    try {
      let query = supabase.from("messages").select("*").order("created_at", { ascending: true });

      if ("email" in selectedTarget) {
        // 2. IMPORTANT: Await the update so the DB is actually updated 
        // before we try to fetch the new history counts.
        await supabase
          .from("messages")
          .update({ is_read: true })
          .match({
            sender_id: selectedTarget.id,
            receiver_id: currentUser.id,
            is_read: false
          });

        // 3. Update the sidebar history NOW that the DB is confirmed read
        fetchChatHistory(currentUser.id);

        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedTarget.id}),and(sender_id.eq.${selectedTarget.id},receiver_id.eq.${currentUser.id})`);
      } else {
        query = query.eq("group_id", selectedTarget.id);
      }

      // 4. Load the messages for the chat window
      const { data, error } = await query;
      if (!error) {
        setMessages(data || []);
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  };
    
    loadMsgs();

    const chatChannel = supabase.channel(`chat-${selectedTarget.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const m = payload.new as Message;
          const isTargetMsg = m.group_id === selectedTarget.id || m.receiver_id === currentUser.id || m.sender_id === currentUser.id;

          if (isTargetMsg) {
            setMessages(prev => {
              if (prev.some(msg => msg.id === m.id)) return prev;
              const optimisticIdx = prev.findIndex(msg =>
                msg.id.toString().startsWith('temp-') &&
                msg.text === m.text &&
                msg.sender_id === m.sender_id
              );
              if (optimisticIdx !== -1) {
                const updatedList = [...prev];
                updatedList[optimisticIdx] = m;
                return updatedList;
              }
              return [...prev, m];
            });
          }
        }
        if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Message;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        }
        if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(chatChannel); };
  }, [selectedTarget, currentUser]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const source = view === "chats" ? chats : suggestedUsers;
    return source.filter(u => (u.full_name || u.email).toLowerCase().includes(query));
  }, [searchQuery, view, chats, suggestedUsers]);

  // --- HANDLERS ---
  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) alert("Error deleting message");
    setMenuOpenId(null);
  };

  const handleMarkAsRead = async (targetId: string) => {
    if (!currentUser) return;
    setChats(prev => prev.map(chat =>
      chat.id === targetId ? { ...chat, unread_count: 0 } : chat
    ));

    const { error } = await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("sender_id", targetId)
      .eq("receiver_id", currentUser.id)
      .eq("is_read", false);

    if (!error) {
      fetchChatHistory(currentUser.id);
      if (selectedTarget?.id === targetId) {
        setMessages(prev => prev.map(m =>
          (m.sender_id === targetId) ? { ...m, is_read: true } : m
        ));
      }
    } else {
      fetchChatHistory(currentUser.id);
    }
    setSidebarMenuOpenId(null);
  };

  const handleDeleteConversation = async (targetId: string) => {
    if (!currentUser) return;
    const confirm = window.confirm("Are you sure? This will delete all messages in this chat.");
    if (!confirm) return;

    const { error } = await supabase
      .from("messages")
      .delete()
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUser.id})`);

    if (error) {
      alert("Error deleting conversation");
    } else {
      fetchChatHistory(currentUser.id);
      if (selectedTarget?.id === targetId) setSelectedTarget(null);
    }
    setSidebarMenuOpenId(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editText.trim() || !editingId) return;
    const { error } = await supabase.from("messages").update({ text: editText }).eq("id", editingId);
    if (error) alert("Error updating message");
    setEditingId(null);
    setEditText("");
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTarget || !currentUser) return;

    const isGroup = "name" in selectedTarget && !("email" in selectedTarget);
    const tempId = `temp-${Math.random().toString()}`;

    const optimisticMsg: Message = {
      id: tempId,
      text: newMessage,
      sender_id: currentUser.id,
      created_at: new Date().toISOString(),
      is_read: false,
      receiver_id: isGroup ? undefined : selectedTarget.id,
      group_id: isGroup ? selectedTarget.id : undefined
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage("");

    const { error } = await supabase.from("messages").insert([{
      text: optimisticMsg.text,
      sender_id: currentUser.id,
      receiver_id: optimisticMsg.receiver_id || null,
      group_id: optimisticMsg.group_id || null,
    }]);

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      alert("Error sending message");
    }else {
    // ADD THIS LINE:
    // This ensures the sidebar updates immediately after the first message is sent
    fetchChatHistory(currentUser.id);
  }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || !selectedTarget) return;

    const isGroup = "name" in selectedTarget && !("email" in selectedTarget);
    const tempId = `temp-${Math.random().toString()}`;
    const localPreview = URL.createObjectURL(file);

    const optimisticMsg: Message = {
      id: tempId,
      text: `Sent a file: ${file.name}`,
      file_url: localPreview,
      sender_id: currentUser.id,
      created_at: new Date().toISOString(),
      is_read: false,
      receiver_id: isGroup ? undefined : selectedTarget.id,
      group_id: isGroup ? selectedTarget.id : undefined
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setUploading(true);

    try {
      const filePath = `${currentUser.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);

      await supabase.from("messages").insert([{
        text: `Sent a file: ${file.name}`,
        file_url: publicUrl,
        sender_id: currentUser.id,
        receiver_id: optimisticMsg.receiver_id || null,
        group_id: optimisticMsg.group_id || null
      }]);
    } catch (err: any) {
      alert(err.message || "Error uploading file");
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setUploading(false);
    }
  };

return (
  <div className="messenger-container" onClick={() => { setMenuOpenId(null); setSidebarMenuOpenId(null); }}>
    {/* Sidebar Section */}
    <div className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
      
      {/* Home Navigator Button */}
      <div className="nav-container">
        <button 
          className="nav-home-btn" 
          onClick={() => window.location.href = '/'} 
          title="Go to Homepage"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
          {!isSidebarCollapsed && <span className="nav-text">Home</span>}
        </button>
      </div>

      {/* Sidebar Collapse Toggle */}
      <button 
        className="collapse-toggle" 
        onClick={(e) => {
          e.stopPropagation();
          setIsSidebarCollapsed(!isSidebarCollapsed);
        }}
        title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isSidebarCollapsed ? "→" : "←"}
      </button>

      <div className="sidebar-header">
        <div className="tabs">
          <button className={view === "chats" ? "active" : ""} onClick={() => setView("chats")}>
            {isSidebarCollapsed ? "💬" : "Inbox"}
          </button>
          {!isSidebarCollapsed && (
            <button className={view === "discover" ? "active" : ""} onClick={() => setView("discover")}>
              Explore
            </button>
          )}
        </div>
        {!isSidebarCollapsed && (
          <div className="search-box">
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        )}
      </div>

      <div className="sidebar-content">
        {!isSidebarCollapsed && <p className="section-label">{view === "chats" ? "Recent" : "All Users"}</p>}
        
        {filteredItems.map(u => {
          const isOnline = onlineUsers.includes(u.id);
          return (
            <div key={u.id} className={`item ${selectedTarget?.id === u.id ? 'active' : ''}`} onClick={() => setSelectedTarget(u)}>
<div className="avatar-wrapper">

<div className="avatar">
  {u.avatar_url ? (
    <img
      src={u.avatar_url}
      alt={u.full_name}
      className="avatar-img"
    />
  ) : (
    <span className="avatar-fallback">
      {u.full_name?.[0]?.toUpperCase() || "U"}
    </span>
  )}
</div>


  {isOnline && <div className="online-dot" />}

  {(u.unread_count ?? 0) > 0 && (
    <div
      className={`unread-badge ${
        isSidebarCollapsed ? "collapsed-badge" : ""
      }`}
    >
      {isSidebarCollapsed && (u.unread_count ?? 0) > 9
        ? "9+"
        : (u.unread_count ?? 0)}
    </div>
  )}
</div>


              {!isSidebarCollapsed && (
                <>
                  <div className="info">
                    <span className="name">{u.full_name || u.email.split('@')[0]}</span>
                    {isOnline ? <span className="active-now">Active now</span> : <span className="status">Offline</span>}
                  </div>



                    {view === "chats" && (
                      <div className="sidebar-item-actions">
                        <button className="sidebar-dots" onClick={(e) => {
                          e.stopPropagation();
                          setSidebarMenuOpenId(u.id === sidebarMenuOpenId ? null : u.id);
                        }}>︙</button>
                        {sidebarMenuOpenId === u.id && (
                          <div className="sidebar-menu">
                            <button onClick={(e) => { e.stopPropagation(); handleMarkAsRead(u.id); }}>
                              Mark as Read
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteConversation(u.id); }} className="delete-btn">
                              Delete Chat
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                   
                </>
              )}
            </div>
          );
        })}
        
        {view === "discover" && suggestedGroups.map(g => (
          <div key={g.id} className={`item ${selectedTarget?.id === g.id ? 'active' : ''}`} onClick={() => setSelectedTarget(g)}>
            <div className="avatar grp">#</div>
            {!isSidebarCollapsed && (
              <div className="info"><span className="name">{g.name}</span></div>
            )}
          </div>
        ))}
      </div>
    </div>
    {/* ... rest of the chat window ... */}
    {/* Chat Window Section */}
    <div className="chat-window">
      {selectedTarget ? (
        <>
          <div className="chat-header">
            <div className="header-left">
              <strong>
                {"full_name" in selectedTarget 
                  ? (selectedTarget.full_name || selectedTarget.email) 
                  : (selectedTarget as Group).name}
              </strong>
              {"email" in selectedTarget && onlineUsers.includes(selectedTarget.id) && (
                <span className="header-online">● Online</span>
              )}

              <div className="header-avatar">
  {("avatar_url" in selectedTarget && selectedTarget.avatar_url) ? (
    <img
      src={selectedTarget.avatar_url}
      alt={selectedTarget.full_name}
      className="avatar-img"
    />
  ) : (
    <div className="avatar-fallback">
      {("full_name" in selectedTarget
        ? selectedTarget.full_name?.[0]
        : "#")}
    </div>
  )}
</div>

            </div>

            {incomingCall && (
              <div className="call-modal">
                <div className="modal-content">
                  <h3>Incoming {incomingCall.type} Call</h3>
                  <p>{incomingCall.callerName} is calling you...</p>
                  <div className="modal-actions">
                    <button className="accept" onClick={handleAcceptCall}>Accept</button>
                    <button className="decline" onClick={handleDeclineCall}>Decline</button>
                  </div>
                </div>
              </div>
            )}

            {"email" in selectedTarget && (
              <div className="header-right">
                <button className="call-icon-btn" title="Voice Call" onClick={() => startCall("voice")}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                  </svg>
                </button>
                <button className="call-icon-btn" title="Video Call" onClick={() => startCall("video")}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          {/* ... Rest of message-list and input-area code ... */}

            <div className="message-list">
              {messages.map(m => (
                <div key={m.id} className={`msg-wrapper ${m.sender_id === currentUser?.id ? 'sent-wrap' : 'recv-wrap'}`}>
                  <div className={`msg-bubble ${m.sender_id === currentUser?.id ? 'sent' : 'received'}`}>
                    {m.sender_id === currentUser?.id && !m.id.toString().startsWith('temp-') && (
                      <div className="msg-actions">
                        <button className="dots-v" onClick={(e) => { e.stopPropagation(); setMenuOpenId(m.id === menuOpenId ? null : m.id); }}>⋮</button>
                        {menuOpenId === m.id && (
                          <div className="msg-menu">
                            {/* FLOATING ARROW BUTTON */}
  {showScrollArrow && (
    <button className="scroll-bottom-btn" onClick={scrollToBottom}>
      ↓
    </button>
  )}
                            <button onClick={() => { setEditingId(m.id); setEditText(m.text); setMenuOpenId(null); }}>Edit</button>
                            <button onClick={() => handleDelete(m.id)} className="delete-btn">Delete</button>
                          </div>
                        )}
                      </div>
                    )}

{m.file_url && (
  <div className="media-content">
    {m.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
      <img src={m.file_url} alt="Shared" className="chat-img" />
    ) : m.file_url.match(/\.(mp4|webm|ogg)$/i) ? (
      <video src={m.file_url} controls className="chat-video" />
    ) : m.file_url.match(/\.(mp3|wav|m4a)$/i) ? (
      <audio src={m.file_url} controls className="chat-audio" />
    ) : (
      <a href={m.file_url} target="_blank" rel="noreferrer" className="file-link">📎 Download File</a>
    )}
  </div>
)}


                    {editingId === m.id ? (
                      <form onSubmit={handleEdit} className="edit-form">
                        <input value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                        <div className="edit-buttons">
                          <button type="submit">Save</button>
                          <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className={`text ${m.text.includes("Missed") ? "missed-call-text" : ""}`}>
  {m.text}
</div>
                    )}

                    <div className="msg-footer">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {m.sender_id === currentUser.id && <span className="read-status">{m.is_read ? " ✓✓" : " ✓"}</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>

            <form className="input-area" onSubmit={sendMessage}>
              <label className="attach-btn">
                <input type="file" onChange={handleFileUpload} hidden disabled={uploading} />
                {uploading ? "..." : "📎"}
              </label>
              <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." autoFocus />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="empty"><h2>Select a chat</h2></div>
        )}
      </div>

      <style jsx>{`
        .messenger-container { display: flex; height: 100vh; background: #0f172a; color: white; }
        .sidebar { width: 350px; border-right: 1px solid #1e293b; display: flex; flex-direction: column; background: #020617; }
        .sidebar-header { background: #0f172a; border-bottom: 1px solid #1e293b; }
        .tabs { display: flex; }
        .sidebar { 
  width: 350px; 
  border-right: 1px solid #1e293b; 
  display: flex; 
  flex-direction: column; 
  background: #020617; 
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.sidebar.collapsed { 
  width: 80px; 
}
  .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
  .header-avatar {
  width: 40px;
  height: 40px;
  margin-right: 12px;
  border-radius: 50%;
  overflow: hidden;
  background: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
}


.avatar-fallback {
  font-weight: bold;
  font-size: 16px;
}


.nav-container {
  padding: 12px;
  border-bottom: 1px solid #1e293b;
}

.nav-home-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
  justify-content: flex-start;
}
  .avatar-wrapper {
  position: relative;
}

/* Expanded */
.unread-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ef4444;
  color: white;
  font-size: 11px;
  font-weight: bold;
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  z-index: 20;
}

/* Collapsed */
.sidebar.collapsed .unread-badge.collapsed-badge {
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  font-size: 10px;
  padding: 0;
}


.nav-home-btn:hover {
  background: #334155;
  color: white;
}

.nav-text {
  font-weight: 600;
  font-size: 14px;
}

/* Adjusted for Collapsed state */
.sidebar.collapsed .nav-home-btn {
  justify-content: center;
  padding: 10px 0;
}

.sidebar.collapsed .nav-container {
  padding: 12px 8px;
}

.collapse-toggle {
  /* ... previous styles ... */
  top: 65px; /* Adjusting height so it doesn't overlap the home button */
}

.collapse-toggle {
  position: absolute;
  right: -12px;
  top: 75px;
  width: 24px;
  height: 24px;
  background: #3b82f6;
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
}

.sidebar.collapsed .item {
  justify-content: center;
}
        .tabs button { flex: 1; padding: 18px; border: none; background: none; color: #64748b; cursor: pointer; font-weight: 600; }
        .tabs button.active { color: #3b82f6; border-bottom: 2px solid #3b82f6; }
        .section-label { padding: 10px 20px; font-size: 12px; color: #94a3b8; text-transform: uppercase; }
        .search-box input { width: 90%; padding: 10px; background: #1e293b; border: 1px solid #334155; border-radius: 20px; color: white; outline: none; }
        .sidebar-content { flex: 1; overflow-y: auto; padding: 8px; }
        .item { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 12px; cursor: pointer; position: relative; transition: background 0.2s; }
        .item:hover { background: #1e293b; }
        .item.active { background: #2563eb; }
        .avatar-wrapper { position: relative; width: 48px; height: 48px; flex-shrink: 0; }
        .avatar { width: 100%; height: 100%; background: #334155; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .avatar.grp { background: #10b981; }
        .online-dot { position: absolute; bottom: 2px; right: 2px; width: 13px; height: 13px; background: #22c55e; border-radius: 50%; border: 2px solid #020617; z-index: 10; }
        .info { display: flex; flex-direction: column; justify-content: center; flex: 1; }
        .name { font-weight: 500; font-size: 15px; }
        .active-now { font-size: 12px; color: #22c55e; font-weight: bold; }
        .status { font-size: 12px; color: #64748b; }
        .sidebar-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; margin-left: auto; position: relative; min-width: 30px; }
        .unread-badge { background: #ef4444; color: white; font-size: 11px; font-weight: bold; min-width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 0 5px; }
        .sidebar-item-actions { opacity: 0; transition: opacity 0.2s ease-in-out; }
        .item:hover .sidebar-item-actions { opacity: 1; }
        .sidebar-dots { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 20px; padding: 4px; border-radius: 6px; }
        .sidebar-menu { position: absolute; right: 0; top: 100%; margin-top: 5px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; z-index: 1000; min-width: 140px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); }
        .sidebar-menu button { width: 100%; padding: 12px 16px; background: none; border: none; color: #f1f5f9; text-align: left; cursor: pointer; font-size: 13px; }
        .sidebar-menu button:hover { background: #334155; }
        .sidebar-menu .delete-btn { color: #f87171 !important; }
        .chat-window { flex: 1; display: flex; flex-direction: column; background: #0b141a; }
        .chat-header { padding: 14px 25px; background: #1e293b; display: flex; align-items: center; }
        .header-online { font-size: 12px; color: #22c55e; margin-left: 10px; font-weight: bold; }
        .message-list { flex: 1; padding: 20px 40px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); background-opacity: 0.05; }
        .msg-wrapper { display: flex; width: 100%; }
        .sent-wrap { justify-content: flex-end; }
        .recv-wrap { justify-content: flex-start; }
        .msg-bubble { max-width: 75%; min-width: 120px; padding: 8px 12px; border-radius: 12px; font-size: 14px; position: relative; }
        .sent { background: #005c4b; color: white; border-top-right-radius: 0; }
        .received { background: #202c33; color: white; border-top-left-radius: 0; }
        .input-area { padding: 10px 20px; display: flex; gap: 12px; background: #202c33; align-items: center; }
        .input-area input { flex: 1; padding: 12px; background: #2a3942; border: none; color: white; border-radius: 8px; outline: none; }
        .input-area button { background: #3b82f6; border: none; color: white; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #64748b; }
        .media-content { margin-bottom: 8px; border-radius: 8px; overflow: hidden; display: flex; justify-content: center; }
        .chat-img { max-width: 300px; max-height: 400px; width: auto; height: auto; object-fit: contain; border-radius: 8px; display: block; }
        .chat-video { max-width: 300px; border-radius: 8px; }
        .chat-audio { max-width: 100%; height: 40px; }
        .msg-actions { position: absolute; top: 4px; right: 4px; opacity: 0; transition: opacity 0.2s; }
        .msg-bubble:hover .msg-actions { opacity: 1; }
        .dots-v { background: none; border: none; color: #fff; cursor: pointer; font-size: 16px; padding: 0 4px; }
        .msg-menu { position: absolute; right: 0; top: 20px; background: #1e293b; border: 1px solid #334155; border-radius: 4px; z-index: 100; min-width: 80px; }
        .msg-menu button { display: block; width: 100%; padding: 8px; background: none; border: none; color: white; text-align: left; cursor: pointer; font-size: 12px; }
        .msg-menu button:hover { background: #334155; }
        .edit-form input { width: 100%; padding: 4px; background: #020617; border: 1px solid #3b82f6; color: white; border-radius: 4px; margin-bottom: 4px; outline: none; }
        .edit-buttons { display: flex; gap: 4px; }
        .edit-buttons button { font-size: 10px; padding: 2px 6px; border-radius: 4px; cursor: pointer; border: none; }
        .edit-buttons button[type="submit"] { background: #3b82f6; color: white; }
        .message-list {
  position: relative; /* Essential for absolute positioning of the button */
}

.scroll-bottom-btn {
  position: sticky; /* Sticky keeps it floating over the content inside the list */
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #3b82f6;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  z-index: 100;
  transition: opacity 0.3s, transform 0.2s;
}

.scroll-bottom-btn:hover {
  background: #2563eb;
  transform: translateX(-50%) scale(1.1);
}

.scroll-bottom-btn:active {
  transform: translateX(-50%) scale(0.9);
}
  .chat-header {
  padding: 14px 25px;
  background: #1e293b;
  display: flex;
  align-items: center;
  justify-content: space-between; /* Ensures left stays left, right stays right */
}

.header-right {
  display: flex;
  gap: 20px;
  align-items: center;
}

.call-icon-btn {
  background: none;
  border: none;
  color: #94a3b8; /* Muted gray */
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.call-icon-btn:hover {
  background: #334155;
  color: #3b82f6; /* Blue on hover */
  transform: scale(1.1);
}
  .missed-call-text {
  color: #f87171 !important; /* Red color for visibility */
  font-style: italic;
  font-weight: 500;
  display: flex;
  align-items: center;
}

.missed-call-text::before {
  content: "⚠️ ";
  margin-right: 5px;
}

.call-icon-btn svg {
  display: block;
}
        .call-modal { position: fixed; top: 20px; right: 20px; background: #1e293b; padding: 20px; border-radius: 12px; border: 2px solid #3b82f6; z-index: 9999; box-shadow: 0 10px 15px rgba(0,0,0,0.5); }
      .modal-actions { display: flex; gap: 10px; margin-top: 15px; }
      .accept { background: #22c55e; border: none; padding: 10px 20px; border-radius: 8px; color: white; cursor: pointer; }
      .decline { background: #ef4444; border: none; padding: 10px 20px; border-radius: 8px; color: white; cursor: pointer; }
      `}</style>
    </div>
  );

}