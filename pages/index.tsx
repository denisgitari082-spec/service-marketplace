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
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/auth/login");
        return;
      }
      setCurrentUser(data.user.id);
      fetchData();
      subscribeToMessages(data.user.id);
    };
    init();
  }, [view]);

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

  // --- Real-time Message Listener ---
  const subscribeToMessages = (userId: string) => {
    supabase
      .channel("inbox")
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` }, 
      () => setUnreadCount(prev => prev + 1))
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
        <Link href="/messages" className="msg-icon">
          📩 {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </Link>
      </header>

      {/* --- Search & Action Bar --- */}
      <div className="action-bar">
        <input 
          className="search-box" 
          placeholder={view === "marketplace" ? "Search services..." : "Search ideas & contracts..."} 
          onChange={(e) => setSearch(e.target.value)}
        />
        <Link href={view === "marketplace" ? "/create-service" : "/create-post"} className="add-btn">
          {view === "marketplace" ? "+ Post Service" : "🤝 Share Idea/Contract"}
        </Link>
      </div>

      {loading ? (
        <p className="status">Loading...</p>
      ) : (
        <div className="content-grid">
          {view === "marketplace" ? (
            // --- Marketplace View ---
            services.map(service => (
              <div key={service.id} className="card service-card">
                <h3>{service.title}</h3>
                <span className="tag">{service.category}</span>
                <p>{service.description}</p>
                <div className="card-footer">
                  <a href={`https://wa.me/${service.contact}`} className="btn-wa">WhatsApp</a>
                  <button onClick={() => router.push(`/chat/${service.owner_id}`)} className="btn-msg">Message</button>
                </div>
              </div>
            ))
          ) : (
            // --- Pro-Circle View (Groups) ---
            posts.map(post => (
              <div key={post.id} className="card post-card">
                <div className="post-header">
                  <span className="pro-badge">PRO</span>
                  {post.is_contract && <span className="contract-tag">CONTRACT</span>}
                </div>
                {post.image_url && <img src={post.image_url} alt="Site" className="site-img" />}
                <p className="post-content">{post.content}</p>
                <p className="location-tag">📍 {post.location_name}</p>
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
        .nav-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .view-toggle { background: #1e293b; padding: 5px; border-radius: 12px; }
        .view-toggle button { background: none; border: none; color: #94a3b8; padding: 8px 16px; cursor: pointer; border-radius: 8px; font-weight: bold; }
        .view-toggle button.active { background: #3b82f6; color: white; }
        
        .action-bar { display: flex; gap: 15px; max-width: 800px; margin: 0 auto 30px auto; }
        .search-box { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: white; }
        .add-btn { background: #3b82f6; padding: 12px 20px; border-radius: 8px; text-decoration: none; color: white; font-weight: bold; white-space: nowrap; }

        .content-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .card { background: #1e293b; border-radius: 16px; padding: 20px; border: 1px solid #334155; }
        .tag { background: #334155; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        
        /* Pro Circle Specific Styles */
        .site-img { width: 100%; height: 200px; object-fit: cover; border-radius: 12px; margin: 10px 0; }
        .contract-tag { background: #f59e0b; color: black; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 800; }
        .location-tag { color: #94a3b8; font-size: 14px; margin-top: 10px; }
        
        .msg-icon { position: relative; font-size: 24px; text-decoration: none; }
        .badge { position: absolute; top: -5px; right: -5px; background: #ef4444; font-size: 10px; padding: 2px 6px; border-radius: 50%; }
        
        .card-footer { display: flex; gap: 10px; margin-top: 15px; }
        .btn-wa { background: #22c55e; flex: 1; text-align: center; padding: 8px; border-radius: 6px; text-decoration: none; color: white; }
        .btn-msg { background: #3b82f6; flex: 1; border: none; color: white; border-radius: 6px; cursor: pointer; }
        .btn-collab { width: 100%; background: #6366f1; border: none; color: white; padding: 10px; border-radius: 6px; cursor: pointer; }
      `}</style>
    </div>
  );
}


