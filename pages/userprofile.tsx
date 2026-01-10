"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../src/lib/supabaseClient";

/* ---------------- TYPES ---------------- */

type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

type Service = {
  id: string;
  title: string;
  description: string;
  created_at: string;
};

type GroupPost = {
  id: string;
  content: string;
   video_url: string | null;
  created_at: string;

};

type VideoPostWithStats = {
  id: string;
  content: string;
  video_url: string | null;
  created_at: string;
  likes_count: number;
  views_count: number;
};



/* ---------------- PAGE ---------------- */

export default function UserProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = searchParams?.get("id") ?? "";

  const [loggedInUserId, setLoggedInUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const [services, setServices] = useState<Service[]>([]);
  

  const [followersCount, setFollowersCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<VideoPostWithStats[]>([]);


  const isMyProfile = loggedInUserId === profileId;





const LikeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </svg>
);

const ViewIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const DeleteIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18" />
    <path d="M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" />
    <path d="M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
  </svg>
);
const Spinnericon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="spin"
  >
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M22 12a10 10 0 0 1-10 10" />
  </svg>
);

const deletePost = async (postId: string) => {
  if (!confirm("Delete this post?")) return;

  const { error } = await supabase
    .from("video_posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", loggedInUserId); // safety

  if (error) {
    alert("Failed to delete post");
    return;
  }

  // optimistic UI
  setPosts(prev => prev.filter(p => p.id !== postId));
};
const deleteService = async (serviceId: string) => {
  if (!confirm("Delete this service?")) return;

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("owner_id", loggedInUserId); // safety

  if (error) {
    alert("Failed to delete service");
    return;
  }

  setServices(prev => prev.filter(s => s.id !== serviceId));
};



  /* ---------------- INIT ---------------- */

  useEffect(() => {
    if (!profileId) return;

    const init = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/auth/login");
        return;
      }

      setLoggedInUserId(data.user.id);

      await Promise.all([
        fetchProfile(),
        fetchFollowers(),
        fetchLikes(),
        fetchServices(),
        fetchPosts(),
        checkFollowing(data.user.id),
      ]);

      setLoading(false);
    };

    init();
  }, [profileId]);

  /* ---------------- FETCHERS ---------------- */

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", profileId)
      .single();


console.log("UPDATE RESULT:", data, profileId);


    if (data) {
      setProfile(data);
      setNameDraft(data.full_name);
    }
  };

const fetchFollowers = async () => {
  const { data, error } = await supabase
    .from("profile_follow_counts")
    .select("followers_count")
    .eq("user_id", profileId)
    .single();

  if (error) {
    console.error("Followers error:", error);
    setFollowersCount(0);
    return;
  }

  setFollowersCount(data?.followers_count ?? 0);
};


  const fetchLikes = async () => {
    const { count } = await supabase
      .from("post_likes")
      .select("id", { count: "exact"})
      .eq("user_id", profileId);

    setLikesCount(count || 0);
  };

  const fetchServices = async () => {
    const { data } = await supabase
      .from("services")
      .select("id, title, description, created_at")
      .eq("owner_id", profileId)
      .order("created_at", { ascending: false });


    setServices(data || []);
  };

const fetchPosts = async () => {
  const { data, error } = await supabase
    .from("video_posts_with_stats")
    .select("id, content, video_url, created_at, likes_count, views_count")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchPosts error:", error);
    setPosts([]);
    return;
  }

  setPosts(data || []);
};









  const checkFollowing = async (userId: string) => {
    if (userId === profileId) return;

    const { data } = await supabase
      .from("user_follows")
      .select("id")
      .eq("follower_id", userId)
      .eq("following_id", profileId)
      .single();




    setIsFollowing(!!data);
  };

  /* ---------------- ACTIONS ---------------- */

  const toggleFollow = async () => {
    if (!loggedInUserId || isMyProfile) return;

    const next = !isFollowing;
    setIsFollowing(next);
    setFollowersCount(c => (next ? c + 1 : c - 1));

    if (next) {
      await supabase.from("user_follows").insert({
        follower_id: loggedInUserId,
        following_id: profileId,
      });
    } else {
      await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", loggedInUserId)
        .eq("following_id", profileId);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!profile || !isMyProfile) return;

    try {
      setSaving(true);

      const ext = file.name.split(".").pop();
      const filePath = `avatars/${profile.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(filePath);

      await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", profile.id);

      setProfile(p => (p ? { ...p, avatar_url: data.publicUrl } : p));
    } catch (err) {
      alert("Avatar upload failed");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!profile || !isMyProfile) return;

    const trimmed = nameDraft.trim();
    if (!trimmed) return alert("Name cannot be empty");

    setSaving(true);

    await supabase
      .from("profiles")
      .update({ full_name: trimmed })
      .eq("id", profile.id);

    setProfile(p => (p ? { ...p, full_name: trimmed } : p));
    setEditing(false);
    setSaving(false);
  };

  /* ---------------- UI ---------------- */

  if (loading) {
    return (
      <div className="loader-container">
        <div className="Spinnericon" />
        <p>fetching data....</p>
      </div>
    );
  }

  if (!profile) return <p>User not found</p>;

  return (
    <div className="profile-page">
      {/* HEADER */}
      <div className="profile-header">

<button
  className="back-btn"
  onClick={() => router.push("/")}
  aria-label="Go back"
>
  ←
</button>



        <div className="avatar-section">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} className="profile-avatar" />
          ) : (
            <div className="profile-avatar placeholder">
              {profile.full_name?.[0] ?? "?"}
            </div>
          )}

          {isMyProfile && (
            <label className="avatar-upload">
              {saving ? "Saving..." : "Change"}
              <input
                type="file"
                hidden
                accept="image/*"
                onChange={e =>
                  e.target.files && handleAvatarUpload(e.target.files[0])
                }
              />
            </label>
          )}
        </div>

        <div className="profile-info">
          {editing ? (
            <input
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              maxLength={50}
            />
          ) : (
            <h2>{profile.full_name}</h2>
          )}

          <div className="profile-stats">
            <span><strong>{followersCount}</strong> Followers</span>
            <span><strong>{likesCount}</strong> Likes</span>
            <span><strong>{services.length + posts.length}</strong> Posts</span>
          </div>

          {isMyProfile ? (
            editing ? (
              <button
                onClick={saveProfile}
                className="primary-btn"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            ) : (
              <button onClick={() => setEditing(true)}>Edit Profile</button>
            )
          ) : (
            <button onClick={toggleFollow} className="primary-btn">
              {isFollowing ? "Unfollow" : "Follow"}
            </button>
          )}
        </div>
      </div>

      {/* CONTENT */}
      <div className="profile-content">
        <h3>Services</h3>
        {services.length === 0 && <p>No services yet</p>}
{services.map(s => (
  <div key={s.id} className="mini-card card-with-actions">
    <div className="card-header">
      <strong>{s.title}</strong>

      {isMyProfile && (
        <button
          className="icon-btn danger"
          onClick={() => deleteService(s.id)}
          aria-label="Delete service"
        >
          <DeleteIcon />
        </button>
      )}
    </div>

    <p>{s.description}</p>
  </div>
))}


        <h3>Reels|Memes</h3>
{posts.length === 0 && <p>No reels|memes yet</p>}

{posts.map(p => (
  <div key={p.id} className="mini-card card-with-actions">
    <div className="card-header">
      <span />

      {isMyProfile && (
        <button
          className="icon-btn danger"
          onClick={() => deletePost(p.id)}
          aria-label="Delete post"
        >
          <DeleteIcon />
        </button>
      )}
    </div>

    {p.content && <p className="post-content">{p.content}</p>}

    {p.video_url && (
      <video
        src={p.video_url}
        controls
        preload="metadata"
        className="post-video"
      />
    )}

    <div className="post-stats">
      <span className="stat">
        <LikeIcon /> {p.likes_count ?? 0}
      </span>
      <span className="stat">
        <ViewIcon /> {p.views_count ?? 0}
      </span>
    </div>
  </div>
))}


      </div>





<style>{`

/* Fullscreen loader wrapper */
.loader-container {
  position: fixed;
  inset: 0;
  background: #000; /* match your page background */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

/* Spinner icon */
.spin {
  animation: spin 0.8s linear infinite;
}


/* Loading text */
.loader-container p {
  font-size: 14px;
  color: #e5e7eb;
  letter-spacing: 0.3px;
}

/* Spin animation */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}


.card-with-actions {
  position: relative;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.icon-btn {
  background: transparent;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: #9ca3af;
  border-radius: 8px;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.icon-btn.danger:hover {
  color: #ef4444;
}


.post-stats {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 13px;
  color: #cfcfcf;
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.stat svg {
  opacity: 0.85;
}



.post-video {
  width: 100%;
  max-height: 420px;
  border-radius: 12px;
  margin-top: 10px;
  background: black;
}

.post-stats {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 13px;
  color: #bbb;
}

.post-content {
  font-size: 14px;
  margin-bottom: 6px;
}


.profile-header {
  display: flex;
  gap: 16px;
  align-items: center;
}


/* ========== BACK BUTTON ========== */
.back-btn {
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 26px;
  font-weight: 700;
  cursor: pointer;
  padding: 6px 10px;
  margin-right: 6px;
  border-radius: 8px;
  transition: background 0.2s ease, transform 0.1s ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.back-btn:active {
  transform: scale(0.95);
}


/* ========== PAGE WRAPPER ========== */
.profile-page {
  width: 100%;
  min-height: 100vh;
  padding: 16px 20px 64px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: #f0ebebff;
  background: black;
}
.profile-header {
  width: 100%;
   padding: 16px 0 24px;
}






@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ========== HEADER ========== */
.profile-header {
  display: flex;
  gap: 24px;
  align-items: center;
  padding-bottom: 24px;
  border-bottom: 1px solid #e5e7eb;
}

/* ========== AVATAR ========== */
.avatar-section {
  position: relative;
}

.profile-avatar {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  object-fit: cover;
  background: #f3f4f6;
}

.profile-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 42px;
  font-weight: 600;
  color: #f3ededff;
}

.avatar-upload {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  cursor: pointer;
}

/* ========== PROFILE INFO ========== */
.profile-info {
  flex: 1;
}

.profile-info h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.profile-info input {
  font-size: 20px;
  font-weight: 600;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  width: 100%;
  max-width: 280px;
}

/* ========== STATS ========== */
.profile-stats {
  display: flex;
  gap: 18px;
  margin: 12px 0 16px;
  font-size: 14px;
  color: #fefbfbff;
}

.profile-stats strong {
  font-weight: 700;
  color: #f7f0f0ff;
}

/* ========== BUTTONS ========== */
button {
  border: none;
  cursor: pointer;
  color: white;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  background: #151515ff;
  transition: background 0.2s ease, transform 0.1s ease;
}

button:hover {
  background: #0f0f0fff;
}

button:active {
  transform: scale(0.97);
}

.primary-btn {
  background: #050505ff;
  color: #fefafaff;
}

.primary-btn:hover {
  background: #000;
}

/* ========== CONTENT ========== */
.profile-content {
  margin-top: 32px;
}

.profile-content h3 {
  margin: 28px 0 12px;
  font-size: 18px;
  font-weight: 700;
}

/* ========== MINI CARDS ========== */
.mini-card {
  background: #0f0f0fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
  overflow: hidden;
}

.mini-card strong {
  display: block;
  font-size: 15px;
  margin-bottom: 4px;
}

.mini-card p {
  margin: 0;
  font-size: 14px;
  color: #f8f4f4ff;
}

.mini-card img {
  width: 100%;
  border-radius: 12px;
  margin-top: 10px;
  object-fit: cover;
}

/* ========== EMPTY STATES ========== */
.profile-content p {
  font-size: 14px;
  color: #f3eeeeff;
}

/* ========== RESPONSIVE ========== */
@media (max-width: 640px) {
  .profile-header {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }

  .profile-stats {
    flex-wrap: wrap;
    gap: 12px;
  }

  .profile-avatar {
    width: 90px;
    height: 90px;
  }
}


`}</style>

    </div>
  );
}
