"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../src/lib/supabaseClient";

// --- Types ---
type Service = {
  id: string; title: string; description: string; category: string;
  provider: string; contact: string; location: string; owner_id: string;
};

type GroupPost = {
  id: string; content: string; image_url: string; location_name: string;
  category: string; created_at: string; user_id: string; is_contract: boolean;
};

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<"marketplace" | "pro-circle">("marketplace");
  const [services, setServices] = useState<Service[]>([]);
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/auth/login");
        return;
      }
      
      // Initial fetch for data and existing unread messages
      fetchData();
      fetchInitialUnreadCount(data.user.id);
      subscribeToMessages(data.user.id);
    };
    init();
  }, [view]);

  const fetchInitialUnreadCount = async (userId: string) => {
    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: 'exact', head: true })
      .eq("receiver_id", userId)
      .eq("read", false); // Ensure your DB has a 'read' boolean column
    
    if (!error && count !== null) setUnreadCount(count);
  };

  const fetchData = async () => {
    setLoading(true);
    if (view === "marketplace") {
      const { data } = await supabase.from("services").select("*");
      setServices(data || []);
    } else {
      const { data } = await supabase.from("group_posts").select("*").order("created_at", { ascending: false });
      setPosts(data || []);
    }
    setLoading(false);
  };

  const subscribeToMessages = (userId: string) => {
    return supabase
      .channel("inbox")
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `receiver_id=eq.${userId}` 
      }, () => setUnreadCount(prev => prev + 1))
      .subscribe();
  };

  return (
    <div className="container">
      {/* --- Header & Navigation --- */}
      <header className="nav-header">
        <h1 className="logo">ProConnect</h1>
        
        <div className="view-toggle">
          <button className={view === "marketplace" ? "active" : ""} onClick={() => setView("marketplace")}>Marketplace</button>
          <button className={view === "pro-circle" ? "active" : ""} onClick={() => setView("pro-circle")}>Pro Circle</button>
        </div>

        <div className="header-actions">
          <Link href="/group" className="header-btn" title="Groups">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </Link>

          <Link href="/messages" className="msg-icon-container">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </Link>
        </div>
      </header>

      {/* --- Search & Action Bar --- */}
      <div className="action-bar">
        <div className="search-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            className="search-box" 
            placeholder={view === "marketplace" ? "Search services..." : "Search ideas..."} 
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <Link href={view === "marketplace" ? "/create-service" : "/create-post"} className="add-btn">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Post {view === "marketplace" ? "Service" : "Idea"}</span>
        </Link>
      </div>

      {loading ? (
        <div className="loader-container">
          <div className="spinner"></div>
          <p>Loading {view}...</p>
        </div>
      ) : (
        <div className="content-grid">
          {view === "marketplace" ? (
            services.map(service => (
              <div key={service.id} className="card service-card">
                <div className="card-header">
                  <h3>{service.title}</h3>
                  <span className="tag">{service.category}</span>
                </div>
                <p className="card-desc">{service.description}</p>
                <div className="card-footer">
                  <a href={`https://wa.me/${service.contact}`} className="btn-wa">WhatsApp</a>
                  <button onClick={() => router.push(`/chat/${service.owner_id}`)} className="btn-msg">Message</button>
                </div>
              </div>
            ))
          ) : (
            posts.map(post => (
              <div key={post.id} className="card post-card">
                <div className="post-header">
                  <span className="pro-badge">PRO</span>
                  {post.is_contract && <span className="contract-tag">CONTRACT</span>}
                </div>
                {post.image_url && <img src={post.image_url} alt="Site" className="site-img" />}
                <p className="post-content">{post.content}</p>
                <div className="location-row">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  <span>{post.location_name}</span>
                </div>
                <div className="card-footer">
                  <button className="btn-collab">Exchange Ideas</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <style jsx>{`
        .container { background: #0f172a; min-height: 100vh; color: white; padding: 20px; font-family: sans-serif; }
        
        .nav-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; gap: 10px; flex-wrap: wrap; }
        .logo { font-size: 1.4rem; font-weight: 800; background: linear-gradient(90deg, #3b82f6, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; }
        
        .view-toggle { background: #1e293b; padding: 4px; border-radius: 12px; display: flex; }
        .view-toggle button { background: none; border: none; color: #94a3b8; padding: 8px 14px; cursor: pointer; border-radius: 8px; font-weight: 600; font-size: 0.9rem; }
        .view-toggle button.active { background: #3b82f6; color: white; }
        
        .header-actions { display: flex; gap: 10px; align-items: center; }
        .header-btn, .msg-icon-container { position: relative; color: #94a3b8; padding: 10px; background: #1e293b; border-radius: 12px; display: flex; transition: 0.2s; }
        .header-btn:hover, .msg-icon-container:hover { color: #3b82f6; background: #334155; }
        
        .badge { position: absolute; top: -2px; right: -2px; background: #ef4444; color: white; font-size: 10px; font-weight: bold; min-width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #0f172a; }

        .action-bar { display: flex; gap: 12px; max-width: 900px; margin: 0 auto 30px auto; width: 100%; }
        .search-wrapper { position: relative; flex: 2; min-width: 0; }
        .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #64748b; }
        .search-box { width: 100%; padding: 12px 12px 12px 40px; border-radius: 12px; border: 1px solid #334155; background: #1e293b; color: white; outline: none; }
        
        .add-btn { background: #3b82f6; display: flex; align-items: center; gap: 8px; padding: 0 16px; border-radius: 12px; text-decoration: none; color: white; font-weight: 600; white-space: nowrap; flex: 0 0 auto; }

        .content-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .card { background: #1e293b; border-radius: 20px; padding: 20px; border: 1px solid #334155; display: flex; flex-direction: column; }
        .card-desc { color: #cbd5e1; line-height: 1.5; margin-bottom: 20px; }
        .tag { background: rgba(59, 130, 246, 0.1); color: #60a5fa; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
        
        .site-img { width: 100%; height: 180px; object-fit: cover; border-radius: 14px; margin: 15px 0; }
        .location-row { display: flex; align-items: center; gap: 6px; color: #94a3b8; font-size: 13px; margin: 10px 0; }
        .card-footer { display: flex; gap: 10px; margin-top: auto; }
        .btn-wa { background: #22c55e; flex: 1; text-align: center; padding: 10px; border-radius: 10px; text-decoration: none; color: white; font-weight: 600; }
        .btn-msg { background: #3b82f6; flex: 1; border: none; color: white; border-radius: 10px; cursor: pointer; font-weight: 600; }
        .btn-collab { width: 100%; background: #6366f1; border: none; color: white; padding: 12px; border-radius: 10px; cursor: pointer; font-weight: 600; }

        .loader-container { text-align: center; padding: 50px; }
        .spinner { width: 30px; height: 30px; border: 3px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 15px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 600px) {
          .nav-header { flex-direction: column; gap: 15px; }
          .logo { align-self: flex-start; }
          .header-actions { position: absolute; top: 20px; right: 20px; }
          .action-bar { flex-direction: column; }
          .add-btn { height: 48px; justify-content: center; width: 100%; }
        }
      `}</style>
    </div>
  );
}