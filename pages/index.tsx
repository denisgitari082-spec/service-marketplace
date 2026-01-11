
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../src/lib/supabaseClient";



// --- Types ---

type Service = { id: string; title: string; description: string; category: string; contact: string; location: string; owner_id: string | null; profiles: { id: string; full_name: string; avatar_url: string | null; } | null; liked_by_me: boolean; like_count: number; };

type GroupPost = {
  id: string; content: string; image_url: string; location_name: string;
  category: string; created_at: string; user_id: string; is_contract: boolean;
};
// Inside Types section
type UserProfile = {
  id: string;
  full_name: string;
  avatar_url: string;
};
type Comment = {
  id: string;
  service_id: string;
  content: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
};


export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [view, setView] = useState<"marketplace" | "pro-circle">("marketplace");
  const [services, setServices] = useState<Service[]>([]);
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  // Inside Home component states
const [profile, setProfile] = useState<UserProfile | null>(null);
const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
const [updatingProfile, setUpdatingProfile] = useState(false);
const [commentsOpen, setCommentsOpen] = useState(false);
const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
const [comments, setComments] = useState<Comment[]>([]);
const [newComment, setNewComment] = useState("");
const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});



  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/auth/login");
        return;
      }
      setUserId(data.user.id);
      const fetchProfile = async (userId: string) => {
const { data, error } = await supabase
  .from('profiles')
  .select('id, full_name, avatar_url')
  .eq('id', userId)
  .single();


  if (!error && data) setProfile(data);
};
if (data.user) {
  await fetchProfile(data.user.id);
}


      
      // Initial fetch for data and existing unread messages
      fetchData();
      fetchInitialUnreadCount(data.user.id);
      subscribeToMessages(data.user.id);
    };
    init();
  }, [view]);

  const toggleDescription = (id: string) => {
  setExpandedDescriptions(prev => ({
    ...prev,
    [id]: !prev[id],
  }));
};


  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setUpdatingProfile(true);

    try {
      // 1. Update the 'profiles' table in Supabase
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
        })
        .eq("id", profile.id);

      if (error) throw error;

      // 2. Close modal on success
      setIsProfileModalOpen(false);
      alert("Profile updated successfully!");
    } catch (error: any) {
      console.error("Error updating profile:", error.message);
      alert("Failed to update profile.");
    } finally {
      setUpdatingProfile(false);
    }
  };

const fetchComments = async (serviceId: string) => {
  const { data, error } = await supabase
    .from("service_comments")
    .select(`
      id,
      service_id,
      content,
      created_at,
      profiles (
        id,
        full_name,
        avatar_url
      )
    `)
    .eq("service_id", serviceId)
    .order("created_at", { ascending: false });

  if (!error && data) {
    const typedComments = data.map((comment: any) => ({
      ...comment,
      profiles: Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles,
    }));
    setComments(typedComments as Comment[]);
  }
};

const addComment = async () => {
  if (!newComment.trim() || !activeServiceId || !userId) return;

  try {
    const { error } = await supabase
      .from("service_comments")
      .insert({
        service_id: activeServiceId,
        user_id: userId,
        content: newComment,
      });

    if (error) throw error;

    setNewComment("");
    await fetchComments(activeServiceId);
  } catch (error) {
    console.error("Failed to add comment:", error);
    alert("Failed to post comment");
  }
};
useEffect(() => {
  if (!activeServiceId) return;

  fetchComments(activeServiceId);

  const channel = supabase
    .channel(`service-comments-${activeServiceId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "service_comments",
        filter: `service_id=eq.${activeServiceId}`,
      },
      () => {
        // 🔥 refetch with profiles included
        fetchComments(activeServiceId);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [activeServiceId]);





 const handleAvatarUpload = async (
  e: React.ChangeEvent<HTMLInputElement>
) => {
  if (!e.target.files || !profile) return;

  const file = e.target.files[0];
  const fileExt = file.name.split(".").pop();
  const filePath = `${profile.id}/avatar.${fileExt}`;

  try {
    // 1. Upload avatar (overwrite if exists)
    const { error: uploadError } = await supabase.storage
      .from("chat-attachments")
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    // 2. Get public URL
    const { data } = supabase.storage
      .from("chat-attachments")
      .getPublicUrl(filePath);

    if (!data?.publicUrl) throw new Error("Failed to get public URL");

    // 3. Save avatar URL to database immediately
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: data.publicUrl })
      .eq("id", profile.id);

    if (updateError) throw updateError;

    // 4. Update local state
    setProfile(prev =>
      prev ? { ...prev, avatar_url: data.publicUrl } : prev
    );

  } catch (error) {
    console.error("Avatar upload failed:", error);
    alert("Failed to upload image");
  }
};

const fetchInitialUnreadCount = async (userId: string) => {
  const { data, error } = await supabase
    .from("messages")
    .select("id", { count: "exact" })
    .eq("receiver_id", userId)
    .eq("read", false);

  if (!error && data) {
    setUnreadCount(data.length);
  }
};



const fetchData = async () => {
  setLoading(true);

    if (view === "marketplace") {
      const { data, error } = await supabase
        .from("services")
        .select(`
          id,
          title,
          description,
          category,
          contact,
          location,
          owner_id,
    profiles (
      id,
      full_name,
      avatar_url
    ),
    likes:service_likes(count),
    my_likes:service_likes(user_id)
  `)
  .order("created_at", { ascending: false });
 

console.log("SERVICE FROM SUPABASE:", data?.[0]);

      if (!error && data) {
        const typedServices = data.map((service: any) => ({
          id: service.id,
          title: service.title,
          description: service.description,
          category: service.category,
          contact: service.contact,
          location: service.location,
          owner_id: service.owner_id,
          profiles: Array.isArray(service.profiles) ? service.profiles[0] || null : service.profiles,
          liked_by_me: service.my_likes?.some(
  (l: any) => l.user_id === userId
),
like_count: service.likes?.[0]?.count ?? 0

        }));
        setServices(typedServices);
      }
    } else {
    const { data } = await supabase
      .from("group_posts")
      .select("*")
      .order("created_at", { ascending: false });

    setPosts(data || []);
  }

  setLoading(false);
};


const toggleLike = async (serviceId: string, currentlyLiked: boolean) => {
  if (!userId) return;

  // 1️⃣ Optimistically update UI first
  setServices(prev =>
    prev.map(service =>
      service.id === serviceId
        ? {
            ...service,
            liked_by_me: !currentlyLiked,
            like_count: service.like_count + (currentlyLiked ? -1 : 1),
          }
        : service
    )
  );

  // 2️⃣ Update database in background
  const { error } = currentlyLiked
    ? await supabase
        .from("service_likes")
        .delete()
        .eq("service_id", serviceId)
        .eq("user_id", userId)
    : await supabase
        .from("service_likes")
        .insert({ service_id: serviceId, user_id: userId });

  // 3️⃣ Roll back if DB fails
  if (error) {
    console.error("Like update failed:", error);

    setServices(prev =>
      prev.map(service =>
        service.id === serviceId
          ? {
              ...service,
              liked_by_me: currentlyLiked,
              like_count: service.like_count + (currentlyLiked ? 1 : -1),
            }
          : service
      )
    );
  }
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
    {/* --- Profile Edit Modal --- */}
    {isProfileModalOpen && profile && (
      <div className="modal-overlay" onClick={() => setIsProfileModalOpen(false)}>
        <div className="modal-content profile-edit" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Edit Profile</h3>
            <button className="close-btn" onClick={() => setIsProfileModalOpen(false)}>✕</button>
          </div>
          
          <form onSubmit={handleUpdateProfile}>
            <div className="input-group">
              <label>Profile Image URL</label>
<input
  type="file"
  accept="image/*"
  onChange={(e) => handleAvatarUpload(e)}
/>

            </div>

            <div className="input-group">
              <label>Full Name</label>
              <input 
                type="text" 
                placeholder="Your Name"
                value={profile.full_name || "unknown"}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              />
            </div>

            <button type="submit" className="save-btn" disabled={updatingProfile}>
              {updatingProfile ? "Updating..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>
    )}

    {/* --- Header & Navigation --- */}
    <header className="nav-header">
      <h1 className="logo">ProConnect</h1>
      
      <div className="view-toggle">
        <button className={view === "marketplace" ? "active" : ""} onClick={() => setView("marketplace")}>Marketplace</button>
        <button 
    onClick={() => router.push("/videos")}
  >
    Reels|Memes
  </button>

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

        {/* User Profile Avatar */}
<div
  className="user-profile-trigger"
  onClick={() => router.push(`/userprofile?id=${profile?.id}`)}
>
  {profile?.avatar_url ? (
    <img src={profile.avatar_url} className="profile-img" />
  ) : (
    <div className="profile-placeholder">
      {profile?.full_name?.[0]?.toUpperCase() || "🧑"}
    </div>
  )}
</div>


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
        <span>add{view === "marketplace" ? "Service" : "Idea"}</span>
      </Link>
    </div>

 {loading ? (
  <div className="loader-container">
    <div className="spinner"></div>
    <p>Loading Marketplace...</p>
  </div>
) : (
  <div className="content-grid">
    {/* We only render services here now */}
    {services.map((service) => {
      const owner = service.profiles;

      return (
        <div key={service.id} className="service-wrapper">
          {/* USER HEADER */}
          <div className="author-row">
            {owner?.avatar_url ? (
              <img src={owner.avatar_url} alt={owner.full_name} className="author-avatar" />
            ) : (
              <div className="author-avatar placeholder">
               {owner?.full_name?.[0]?.toUpperCase() || "🧑"}
              </div>
            )}
            <div className="author-meta">
              <span className="author-name">{owner?.full_name || "Unknown User"}</span>
              <span className="author-category">{service.category}</span>
            </div>
          </div>

          {/* SERVICE CARD */}
          <div className="card service-card">
            <h3 className="service-title">{service.title}</h3>
            <p className={`card-desc ${expandedDescriptions[service.id] ? "expanded" : "clamped"}`}>
              {service.description}
            </p>
            {service.description.length > 120 && (
              <button className="see-more-btn" onClick={() => toggleDescription(service.id)}>
                {expandedDescriptions[service.id] ? "See less" : "See more"}
              </button>
            )}
            {service.location && (
              <div className="service-location">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-6-5.33-6-10a6 6 0 0 1 12 0c0 4.67-6 10-6 10z" /><circle cx="12" cy="11" r="2" /></svg>
                <span>{service.location}</span>
              </div>
            )}
          </div>

          {/* ACTION BAR */}
          <div className="service-actions">
            <button className={`action-btn ${service.liked_by_me ? "liked" : ""}`} onClick={() => toggleLike(service.id, service.liked_by_me)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={service.liked_by_me ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M7 10v12" /><path d="M15 3l-4 7v12h5.5a2 2 0 0 0 2-1.5l1.5-7a2 2 0 0 0-2-2.5h-6" /></svg>
              <span className="like-count">{service.like_count}</span>
            </button>

            <button className="action-btn" onClick={() => { setActiveServiceId(service.id); setCommentsOpen(true); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              <span>Comment</span>
            </button>

            <button className="action-btn primary" onClick={() => service.owner_id && router.push(`/messages?user=${service.owner_id}`)}>
              Message
            </button>
          </div>
        </div>
      );
    })}
  </div>
)}
{commentsOpen && (
  <div className="modal-overlay" onClick={() => setCommentsOpen(false)}>
    <div
      className="modal-content comments-modal"
      onClick={e => e.stopPropagation()}
    >
      {/* HEADER */}
      <div className="comments-header">
        <h3>Comments</h3>

        <button
          className="close-btn"
          onClick={() => setCommentsOpen(false)}
          aria-label="Close"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* COMMENTS */}
      <div className="comments-list">
        {comments.map(c => (
          <div key={c.id} className="comment-row">
            {c.profiles.avatar_url ? (
              <img
                src={c.profiles.avatar_url}
                className="comment-avatar"
              />
            ) : (
              <div className="comment-avatar placeholder">
                {c.profiles.full_name[0]}
              </div>
            )}

            <div className="comment-body">
              <strong>{c.profiles.full_name}</strong>
              <p>{c.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* INPUT */}
      <div className="comment-input">
        <input
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Write a comment..."
        />

        <button className="send-btn" onClick={addComment} aria-label="Send">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  </div>
)}


      <style jsx>{`
      /* ===== COMMENTS MODAL ===== */
.comments-modal {
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
  /* CLAMPED (2 lines) */
.card-desc.clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal; /* 👈 ensure wrap */
}

/* EXPANDED (FULL TEXT) */
.card-desc.expanded {
  display: block;
  white-space: normal;       /* 👈 THIS FIXES IT */
  word-break: break-word;    /* 👈 prevents overflow */
  overflow-wrap: anywhere;   /* 👈 mobile-safe */
}

  /* DESCRIPTION CLAMP */
.card-desc.clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-desc.expanded {
  display: block;
}
  .card {
  min-width: 0;
}
  .card-desc {
  max-width: 100%;
}



/* SEE MORE BUTTON */
.see-more-btn {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0;
  margin-top: 4px;
  cursor: pointer;
  align-self: flex-start;
  overflow: hidden;
}

.see-more-btn:hover {
  text-decoration: underline;
}

  .action-btn.liked {
  color: #2563eb; /* blue */
}
  .service-location {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 0.9rem;
  color: #6b7280; /* subtle gray */
}

.service-location svg {
  flex-shrink: 0;
}


  .action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
  @media (max-width: 420px) {
  .action-btn span {
    display: none;
  }
}
    .action-btn primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}





/* HEADER */
.comments-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid #334155;
}

.comments-header h3 {
  margin: 0;
}

/* CLOSE BUTTON */
.close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
}

.close-btn:hover {
  color: #ef4444;
}

/* LIST */
.comments-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}

/* COMMENT ROW */
.comment-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  align-items: flex-start;
}

.comment-body {
  max-width: calc(100% - 46px); /* prevents overflow */
  word-wrap: break-word;
}

.comment-body p {
  margin: 4px 0 0;
  color: #cbd5e1;
}

/* INPUT AREA */
.comment-input {
  display: flex;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid #334155;
}

.comment-input input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #0f172a;
  border: 1px solid #334155;
  color: white;
}

/* SEND BUTTON */
.send-btn {
  width: 42px;
  height: 42px;
  background: #3b82f6;
  border: none;
  border-radius: 10px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.send-btn:hover {
  background: #2563eb;
}



.comments-modal {
  max-width: 500px;
  width: 95%;
}

.comments-list {
  max-height: 300px;
  overflow-y: auto;
  margin: 15px 0;
}

.comment-row {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.comment-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  background: #334155;
}

.comment-input {
  display: flex;
  gap: 8px;
}

.comment-input input {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  background: #0f172a;
  border: 1px solid #334155;
  color: white;
}

      .action-btn.liked {
  background: #1d4ed8;
  color: white;
  border-color: #2563eb;
}

.like-count {
  margin-left: 6px;
  font-weight: 700;
}


.service-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
  .service-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
  .service-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid #334155; /* 👈 separator line */
}





.service-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #334155;
}

.service-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e293b;
  color: #3b82f6;
  font-weight: 700;
}

.service-user-info {
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
}

.service-user-info strong {
  color: white;
}

.service-category {
  color: #94a3b8;
  font-size: 12px;
}

.service-title {
  margin: 6px 0 8px;
  font-size: 1.05rem;
}


.author-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.author-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
  background: #334155;
}

.author-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #3b82f6;
}

.author-meta {
  display: flex;
  flex-direction: column;
}

.author-name {
  font-weight: 700;
  font-size: 0.95rem;
}

.author-category {
  font-size: 0.75rem;
  color: #94a3b8;
}

.service-title {
  font-size: 1.1rem;
  margin: 6px 0;
}

.service-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.action-btn {
  flex: 1;
  background: #0f172a;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 8px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}

.action-btn.primary {
  background: #3b82f6;
  border: none;
  color: white;
}
  :root {
  --safe-top: env(safe-area-inset-top);
  --safe-bottom: env(safe-area-inset-bottom);
}



        .container {
  background: #0f172a;
  min-height: 100vh;
  color: white;

  padding-left: 12px;
  padding-right: 12px;
  padding-bottom: calc(12px + var(--safe-bottom));
  padding-top: calc(12px + var(--safe-top));

  font-family: sans-serif;
}

        
.nav-header {
  position: sticky;
  top: var(--safe-top);
  z-index: 1000;

  background: #0f172a;
  padding: 12px 4px;

  display: flex;
  justify-content: space-between;
  align-items: center;

  gap: 10px;
  flex-wrap: nowrap;

  border-bottom: 1px solid #334155;
}

        .logo { font-size: 1.4rem; font-weight: 800; background: linear-gradient(90deg, #3b82f6, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; }
        
        .view-toggle { background: #1e293b; padding: 4px; border-radius: 12px; display: flex; }
        .view-toggle button { background: none; border: none; color: #94a3b8; padding: 8px 14px; cursor: pointer; border-radius: 8px; font-weight: 600; font-size: 0.9rem; }
        .view-toggle button.active { background: #3b82f6; color: white; }
        
        .header-actions { display: flex; gap: 10px; align-items: center; }
        .header-btn, .msg-icon-container { position: relative; color: #94a3b8; padding: 10px; background: #1e293b; border-radius: 12px; display: flex; transition: 0.2s; }
        .header-btn:hover, .msg-icon-container:hover { color: #3b82f6; background: #334155; }
        
        .badge { position: absolute; top: -2px; right: -2px; background: #ef4444; color: white; font-size: 10px; font-weight: bold; min-width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #0f172a; }
.action-bar {
  display: flex;
  align-items: center;
  gap: 12px;

  width: 100%;
  margin: 0 0 16px 0; /* ❌ no auto margins */

  padding: 0 4px;
}
  .content-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}


        .search-wrapper {
  position: relative;
  flex: 1 1 auto;      /* grow only as needed */
  min-width: 0;        /* allow shrinking */
}
        .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #64748b; }
        .search-box { width: 70%; padding: 12px 12px 12px 40px; border-radius: 12px; border: 1px solid #334155; background: #1e293b; color: white; outline: none; }
       
:global(a.add-btn) {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  height: 42px;
  padding: 0 16px;

  background: #2a4f3fff;
  color: white;

  border-radius: 12px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}


  .add-btn:hover {
  background: #25eb43ff;
}

.add-btn:active {
  transform: translateY(1px);
}

@media (min-width: 768px) {
  .content-grid {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }

  .action-bar {
    max-width: 900px;
    margin: 0 auto 30px auto;
  }
}



      
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

        }


          /* Avatar Trigger */
.user-profile-trigger {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid #334155;
  transition: all 0.2s ease;
  background: #1e293b;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-profile-trigger:hover {
  border-color: #3b82f6;
  transform: scale(1.05);
}

.profile-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-placeholder {
  font-weight: 700;
  color: #3b82f6;
  font-size: 1.1rem;
}

/* Modal Styling */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.profile-edit {
  background: #1e293b;
  padding: 24px;
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  border: 1px solid #334155;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  font-size: 0.85rem;
  color: #94a3b8;
  margin-bottom: 6px;
}

.input-group input {
  width: 100%;
  padding: 10px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  color: white;
  outline: none;
}

.save-btn {
  width: 100%;
  padding: 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 10px;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
      `}</style>
    </div>
  );
}
