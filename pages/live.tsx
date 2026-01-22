import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { supabase } from "../src/lib/supabaseClient";
import { profile } from 'console';

// --- 1. TYPES (Fixes VS Code "any" errors) ---
interface Profile {
  full_name: string | null;
  avatar_url?: string | null;
}

interface LiveSession {
  id: string;
  streamer_id: string;
  title: string;
  is_live: boolean;
  viewer_count: number;
  profiles?: Profile;
}

interface LiveChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profiles?: Profile;
}

const LivePage = () => {
  // Fixes "never[]" or "any" errors by defining types in useState
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [currentSession, setCurrentSession] = useState<LiveSession | null>(null);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Fetch Lobby Data
  const fetchActiveSessions = async () => {
    const { data, error } = await supabase
      .from('live_sessions')
      .select(`*, profiles (full_name, avatar_url)`)
      .eq('is_live', true)
      .order('started_at', { ascending: false });

    if (!error && data) {
      setSessions(data as unknown as LiveSession[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      await fetchActiveSessions();
    };
    init();

    const lobbyChannel = supabase.channel('lobby-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, () => {
        fetchActiveSessions();
      })
      .subscribe();

    return () => { supabase.removeChannel(lobbyChannel); };
  }, []);



  // Join Room Logic
const joinSession = async (session: LiveSession) => {
  setCurrentSession(session);
  const { data, error } = await supabase
    .from('live_chat')
    .select(`
      *,
      profiles!user_id (
        full_name
      )
    `)
    .eq('session_id', session.id)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error("Chat fetch error:", error.message);
    return;
  }
  
  if (data) setMessages(data as unknown as LiveChatMessage[]);
};

  // Chat Realtime Listener
  useEffect(() => {
    if (!currentSession) return;

    const chatChannel = supabase.channel(`chat-${currentSession.id}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'live_chat', filter: `session_id=eq.${currentSession.id}` }, 
        async (payload) => {
          // Fetch profile for the new message because payload only has IDs
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', payload.new.user_id)
            .single();
          
          const newMessage: LiveChatMessage = { 
            ...(payload.new as LiveChatMessage), 
            profiles: profile as Profile 
          };
          setMessages((prev) => [...prev, newMessage]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(chatChannel); };
  }, [currentSession]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !user || !currentSession) return;

    const { error } = await supabase.from('live_chat').insert({
      session_id: currentSession.id,
      user_id: user.id,
      message: comment.trim()
    });

    if (!error) setComment("");
  };

// 1. Start the Live Stream (Camera + Database)
const startMyLive = async () => {
  if (!user) return alert("Please log in first!");

  try {
    // 1. Fetch the actual profile name from the database
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const displayName = profileData?.full_name || 'User';

    // 2. Request Camera & Mic
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    
    // 3. Create the record in Supabase using the name
    const { data, error } = await supabase.from('live_sessions').insert({
      streamer_id: user.id,
      title: `${displayName}'s Live Feed`, // Using name here
      is_live: true
    }).select().single();

    if (error) throw error;

    // ... rest of your code (setLocalStream, joinSession, etc.)

    // Set state and local video stream
    setLocalStream(stream);
    joinSession(data as LiveSession);
    
    // Delay slightly to ensure video element is rendered
    setTimeout(() => {
      if (videoRef.current) videoRef.current.srcObject = stream;
    }, 500);

} catch (err: any) {
  console.error("Camera Error Details:", err.name, err.message);
  
  if (err.name === 'NotAllowedError') {
    alert("Permission denied. Please check if both Camera AND Microphone are allowed in your browser address bar.");
  } else if (err.name === 'NotFoundError') {
    alert("No camera/mic found on this device.");
  } else {
    alert(`Error: ${err.message}`);
  }
}
};

// 2. Stop the Stream (Cleanup)
  const stopStream = async () => {
  // 1. If I am the streamer, kill the camera and update the DB
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    setLocalStream(null);
  }
  
  // 2. ONLY update the database if I am the host
  if (currentSession && user?.id === currentSession.streamer_id) {
    const { error } = await supabase.from('live_sessions')
      .update({ is_live: false }) // This makes it disappear from the Lobby
      .eq('id', currentSession.id);
      
    if (error) console.error("Error ending session:", error);
  }
  
  // 3. Clear the screen to go back to Lobby
  setCurrentSession(null);
  fetchActiveSessions(); // Refresh lobby immediately
};

  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [messages]);

// --- RENDER VIEWS ---
if (!currentSession) {
  return (
    <div className="lobby-container">
      <Head>
        <title>Live Lobby</title>
      </Head>

      {/* NEW APP BAR */}
      <nav className="app-bar">
        <div className="nav-left">
          <button onClick={() => window.location.href = '/videos'} className="icon-btn">
            ← 
          </button>
        </div>
        <div className="nav-center">
          <h1 className="app-title">Crawl live</h1>
        </div>
        <div className="nav-right">
          <button className="start-btn" onClick={startMyLive}>+ Go Live</button>
        </div>
      </nav>

      <div className="content-padding">
        {loading ? (
          <div className="loader">Loading active streams...</div>
        ) : (
          <div className="grid">
            {sessions.map(s => (
              <div key={s.id} className="card">
                <div className="card-thumb">
                  <span className="live-tag">LIVE</span>
                  <div className="play-overlay">▶</div>
                </div>
                <div className="card-info">
                  <h3>{s.title}</h3>
                  <p>{s.profiles?.full_name || 'Anonymous'}</p>
                  <button className="join-btn" onClick={() => joinSession(s)}>Watch</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .lobby-container { 
          background: #f4f7f6; 
          min-height: 100vh; 
          color: #1a1a1a; 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
        }

        /* STICKY APP BAR */
        .app-bar {
          position: sticky;
          top: 0;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          background: white;
          padding: 0 20px;
          height: 64px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          z-index: 100;
        }

        .nav-center .app-title { font-size: 1.2rem; font-weight: 700; margin: 0; }
        .nav-right { text-align: right; }

        .icon-btn { background: none; border: none; font-size: 1rem; cursor: pointer; color: #666; }
        .start-btn { 
          background: #0070f3; 
          color: white; 
          border: none; 
          padding: 10px 20px; 
          border-radius: 20px; 
          font-weight: 600; 
          cursor: pointer;
          transition: transform 0.2s;
        }
        .start-btn:hover { transform: scale(1.05); background: #005bc1; }

        .content-padding { padding: 30px 20px; max-width: 1200px; margin: 0 auto; }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 24px; }
        
        /* STREAM CARDS */
        .card { 
          background: white; 
          border-radius: 12px; 
          overflow: hidden; 
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
          transition: y 0.2s;
        }
        .card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.1); }
        
        .card-thumb { 
          height: 150px; 
          background: #222; 
          position: relative; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
        }
        .live-tag { position: absolute; top: 10px; left: 10px; background: #ff0000; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .play-overlay { font-size: 40px; color: rgba(255,255,255,0.3); }

        .card-info { padding: 15px; }
        .card-info h3 { margin: 0 0 5px 0; font-size: 1rem; }
        .card-info p { color: #666; font-size: 0.9rem; margin-bottom: 15px; }
        
        .join-btn { 
          width: 100%; 
          padding: 8px; 
          border: 1px solid #0070f3; 
          background: transparent; 
          color: #0070f3; 
          border-radius: 6px; 
          font-weight: 600; 
          cursor: pointer; 
        }
        .join-btn:hover { background: #0070f310; }
      `}</style>
    </div>
  );
}

return (
    <div className="live-container">
      <Head>
        <title>{currentSession.title}</title>
      </Head>

      {/* FIXED APP BAR - Positioned relative to avoid covering video content */}
      <nav className="app-bar">
        <div className="nav-left">
          <button onClick={stopStream} className="exit-btn">✕ Exit</button>
        </div>
        <div className="nav-center">
           <h1 className="stream-title">{currentSession.title}</h1>
        </div>
        <div className="nav-right">
          <span className="live-badge">LIVE</span>
        </div>
      </nav>

      <main className="viewport">
        <div className="video-fullscreen-wrapper">
          {currentSession.streamer_id === user?.id ? (
            <video ref={videoRef} autoPlay playsInline muted className="full-video" />
          ) : (
            <div className="placeholder-bg">
               <div className="loading-state">Connecting to {currentSession.profiles?.full_name}...</div>
            </div>
          )}

          {/* CHAT OVERLAY - Positioned Middle-Left */}
          <div className="overlay-container">
            <div className="chat-display">
              {/* SLICE(-10) limits view to the last 10 messages */}
              {messages.slice(-10).map((m) => (
                <div key={m.id} className="chat-bubble">
                  <span className="chat-user">{m.profiles?.full_name || 'User'}</span>
                  <span className="chat-text">{m.message}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input remains at the very bottom */}
            <form onSubmit={sendMessage} className="floating-input-area">
              <input 
                value={comment} 
                onChange={(e) => setComment(e.target.value)} 
                placeholder="Say something..." 
              />
              <button type="submit">🚀</button>
            </form>
          </div>
        </div>
      </main>

      <style jsx>{`
      
        .live-container { height: 100vh; display: flex; flex-direction: column; background: white; overflow: hidden; }
        
        /* Fixed header height so it doesn't float over the video content unexpectedly */
        .app-bar {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          background: white;
          height: 60px;
          padding: 0 15px;
          gap: 2px;
          z-index: 10;
        }

        .viewport { flex: 1; position: relative; }

        .video-fullscreen-wrapper {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
        }

        .full-video { width: 100%; height: 100%; object-fit: cover; }

        .overlay-container {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          padding: 20px;
          display: flex;
          flex-direction: column;
          pointer-events: none;
        }

        /* MIDDLE LEFT POSITIONING */
        .chat-display {
          flex: 1; 
          display: flex;
          flex-direction: column;
          justify-content: center; /* Vertical center */
          align-items: flex-start; /* Left align */
          gap: 8px;
          max-width: 300px; /* Width constraint */
          mask-image: linear-gradient(transparent, black 15%, black 85%, transparent);
        }

        .chat-bubble {
          background: rgba(0, 0, 0, 0.4); /* Darker for better visibility over video */
          backdrop-filter: blur(4px);
          padding: 8px 14px;
          border-radius: 12px;
          pointer-events: auto;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .chat-user { color: #3b82f6; font-weight: bold; font-size: 0.85rem; display: block; }
        .chat-text { color: white; font-size: 0.95rem; }

        .floating-input-area {
          display: flex;
          gap: 10px;
          pointer-events: auto;
          margin-top: auto; /* Push to bottom */
          padding-bottom: 10px;
        }

        .floating-input-area input {
          flex: 1;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 30px;
          padding: 12px 20px;
          color: white;
          outline: none;
        }

        .floating-input-area button {
          background: #3b82f6;
          border: none;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          cursor: pointer;
        }

        .live-badge { background: #ef4444; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .exit-btn { background: #333; border: none; color: white; padding: 6px 16px; border-radius: 20px; cursor: pointer; }
      `}</style>
    </div>
  )};

export default LivePage;