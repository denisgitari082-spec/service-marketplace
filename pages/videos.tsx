"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../src/lib/supabaseClient";

type VideoPost = {
  id: string;
  content: string;
  video_url: string | null;
  created_at: string;
   user_id: string;
  likes_count?: number;
   views_count?: number;
    followers_count: number;
  comments_count: number;
  post_type: 'reel' | 'meme';
  profiles?: {
    full_name: string;
    avatar_url: string | null;
  };

};

type Profile = {
  full_name: string;
  avatar_url: string | null;
};

export default function VideosPage() {
  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [activeTab, setActiveTab] = useState<'none' | 'reel' | 'meme'>('none');
  
  // Form State
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [userLikedPosts, setUserLikedPosts] = useState<string[]>([]);

  // --- NEW STATE FOR COMMENTS ---
const [showComments, setShowComments] = useState<string | null>(null); // Post ID
const [comments, setComments] = useState<any[]>([]);
const [newComment, setNewComment] = useState("");
const [replyingTo, setReplyingTo] = useState<any | null>(null);
const [openReplies, setOpenReplies] = useState<string | null>(null);
const [downloadingPostId, setDownloadingPostId] = useState<string | null>(null);
const [showViewers, setShowViewers] = useState<string | null>(null);
const [viewers, setViewers] = useState<any[]>([]);
const [followingIds, setFollowingIds] = useState<string[]>([]);
const [searchOpen, setSearchOpen] = useState(false);
const [searchQuery, setSearchQuery] = useState("");
const [menuPostId, setMenuPostId] = useState<string | null>(null);
const [currentUserId, setCurrentUserId] = useState<string | null>(null);






// --- FETCH COMMENTS ---
const fetchComments = async (postId: string) => {
  // 1. Clear previous comments & show loading if needed
  // setComments([]); 

  try {
    const { data, error } = await supabase
      .from("post_comments")
      .select(`
        id,
        content,
        created_at,
        parent_id,
        post_id,
        user_id,
        profiles (
          full_name,
          avatar_url
        )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: false });



    if (error) throw error;

    // 2. Update state with fresh data
    setComments(data || []);
    
  } catch (err) {
    console.error("Error fetching comments:", err);
  }
};

const trackView = async (postId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("post_views")
    .upsert(
      { post_id: postId, user_id: user.id },
      {
        onConflict: "post_id,user_id",
        ignoreDuplicates: true
      }
    );
};



// --- SUBMIT COMMENT/REPLY ---
const handleSendComment = async () => {
  // 1. Validation
  if (!newComment.trim() || !showComments) return;
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("Please log in to join the conversation");

  // 2. Optimistic Update (Update count in feed instantly)
  setPosts(prev => prev.map(p => 
    p.id === showComments 
      ? { ...p, comments_count: (p.comments_count || 0) + 1 } 
      : p
  ));

  // 3. Database Insert
  const { error } = await supabase.from("post_comments").insert({
    post_id: showComments,
    user_id: user.id,
    content: newComment.trim(),
    parent_id: replyingTo?.id || null // Handles nested replies
  });

  if (error) {
    // Rollback count if DB fails
    setPosts(prev => prev.map(p => 
      p.id === showComments ? { ...p, comments_count: p.comments_count - 1 } : p
    ));
    return alert("Failed to post comment. Try again.");
  }

  // 4. Success Cleanup
  setNewComment("");
  setReplyingTo(null);
  
  // Refresh the list inside the bottom sheet
  fetchComments(showComments);
};

const handleDownload = async (post: VideoPost) => {
  if (!post.video_url) {
    alert("Nothing to download for this post");
    return;
  }

  try {
    setDownloadingPostId(post.id); // 🔄 start spinner

    const response = await fetch(post.video_url);
    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;

    const extension = post.video_url.includes(".mp4")
      ? "mp4"
      : post.video_url.includes(".png")
      ? "png"
      : post.video_url.includes(".jpg") || post.video_url.includes(".jpeg")
      ? "jpg"
      : "file";

    link.download = `post-${post.id}.${extension}`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Download failed:", err);
    alert("Failed to download file");
  } finally {
    setDownloadingPostId(null); // ✅ stop spinner
  }
};

const openViewers = async (postId: string) => {
  setShowViewers(postId);

  const { data, error } = await supabase
    .from("post_views")
    .select(`
      created_at,
      user_id,
      profiles!post_views_user_id_fkey (
        full_name,
        avatar_url
      )
    `)
    .eq("post_id", postId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Fetch viewers error:", error);
  }

  setViewers(data || []);
};


const handleShare = async (post: VideoPost) => {
  const shareUrl =
    post.video_url ||
    `${window.location.origin}/post/${post.id}`;

  const shareData = {
    title: "Check this out",
    text: post.content || "Interesting post",
    url: shareUrl,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      // Fallback: copy link
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard");
    }
  } catch (err) {
    console.error("Share cancelled or failed:", err);
  }
};




const LikeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </svg>
);
const CommentIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const ShareIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const SaveIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide-icon">
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
  </svg>
);
const HomeArrowIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);
const SpinnerIcon = () => (
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
const ViewIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const FollowIcon = ({ following }: { following: boolean }) => (
  following ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <line x1="20" y1="8" x2="20" y2="14"/>
      <line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  )
);
const SearchIcon = () => (
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
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);


const filteredPosts = useMemo(() => {
  if (!searchQuery.trim()) return posts;

  const q = searchQuery.toLowerCase();

  return posts.filter(p => {
    const nameMatch =
      p.profiles?.full_name?.toLowerCase().includes(q);

    const contentMatch =
      p.content?.toLowerCase().includes(q);

    return nameMatch || contentMatch;
  });
}, [posts, searchQuery]);





const toggleFollow = async (targetUserId: string) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    alert("Login required");
    return;
  }

  const isFollowing = followingIds.includes(targetUserId);

  // 1️⃣ Optimistic UI update
  setPosts(prev =>
    prev.map(p =>
      p.user_id === targetUserId
        ? {
            ...p,
            followers_count: isFollowing
              ? Math.max(0, p.followers_count - 1)
              : p.followers_count + 1,
          }
        : p
    )
  );

  setFollowingIds(prev =>
    isFollowing
      ? prev.filter(id => id !== targetUserId)
      : [...prev, targetUserId]
  );

  try {
    // 2️⃣ Persist follow state
    if (isFollowing) {
      const { error } = await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("user_follows")
        .insert({
          follower_id: user.id,
          following_id: targetUserId,
        });

      if (error) throw error;
    }

    // 3️⃣ 🔥 Read the SOURCE OF TRUTH (profiles.followers_count)
    const { data, error } = await supabase
      .from("profiles")
      .select("followers_count")
      .eq("id", targetUserId)
      .single();

    if (error) throw error;

    if (typeof data?.followers_count === "number") {
      setPosts(prev =>
        prev.map(p =>
          p.user_id === targetUserId
            ? { ...p, followers_count: data.followers_count }
            : p
        )
      );
    }
  } catch (err) {
    console.error("Follow toggle failed:", err);

    // 4️⃣ Rollback optimistic update on failure
    setPosts(prev =>
      prev.map(p =>
        p.user_id === targetUserId
          ? {
              ...p,
              followers_count: isFollowing
                ? p.followers_count + 1
                : Math.max(0, p.followers_count - 1),
            }
          : p
      )
    );

    setFollowingIds(prev =>
      isFollowing
        ? [...prev, targetUserId]
        : prev.filter(id => id !== targetUserId)
    );
  }
};






// 1. FETCH LOGIC (DERIVED, PERSISTENT)
const fetchPosts = useCallback(async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch posts with derived like counts
const { data: postsData, error: postsError } = await supabase
  .from("video_posts")
  .select(`
    id,
    user_id,
    content,
    video_url,
    created_at,
    post_type,
        profiles!video_posts_user_id_fkey (
      full_name,
      avatar_url,
       followers_count
    ),
    post_likes(count),
    post_comments!fk_post_comments_video_posts(count),
    post_views(count)
  `)
  .order("created_at", { ascending: false });

  console.log("RENDER post profile:", postsData);


    if (postsError) throw postsError;


if (user) {
  const { data: follows } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", user.id);

  setFollowingIds(follows?.map(f => f.following_id) || []);
}






    // Fetch posts liked by the current user
    if (user) {
      const { data: likesData, error: likesError } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("user_id", user.id);

      if (likesError) throw likesError;

      setUserLikedPosts(likesData?.map(l => l.post_id) || []);
    } else {
      setUserLikedPosts([]);
    }




    // Normalize posts
const formattedPosts: VideoPost[] = (postsData || []).map(p => {
  const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;

  return {
    id: p.id,
    user_id: p.user_id,
    content: p.content,
    video_url: p.video_url,
    created_at: p.created_at,
    post_type: p.post_type ?? "meme",

    likes_count: p.post_likes?.[0]?.count ?? 0,
    comments_count: p.post_comments?.[0]?.count ?? 0,
    views_count: p.post_views?.[0]?.count ?? 0,

    followers_count: profile?.followers_count ?? 0, // ✅ ONLY HERE

    profiles: profile,
  };
});




console.log("FORMATTED POSTS:", formattedPosts);

formattedPosts.forEach((p, i) => {
  console.log(`POST ${i} final profile:`, p.profiles);
});





    setPosts(formattedPosts);
  } catch (err) {
    console.error("Fetch error:", err);
  } finally {
    setLoading(false);
  }
}, []);
useEffect(() => {
  fetchPosts();
}, [fetchPosts]);



// 2. LIKE LOGIC (SINGLE SOURCE OF TRUTH)
const handleLike = async (postId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("Please log in to like");

  const isAlreadyLiked = userLikedPosts.includes(postId);

  // Optimistic UI update
  setPosts(prev =>
    prev.map(p =>
      p.id === postId
        ? {
            ...p,
            likes_count: isAlreadyLiked
              ? Math.max(0, (p.likes_count ?? 0) - 1)
              : (p.likes_count ?? 0) + 1
          }
        : p
    )
  );

  setUserLikedPosts(prev =>
    isAlreadyLiked
      ? prev.filter(id => id !== postId)
      : [...prev, postId]
  );

  // Persist to DB (NO counter updates)
  if (isAlreadyLiked) {
    await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
  } else {
    await supabase
      .from("post_likes")
      .insert({ post_id: postId, user_id: user.id });
  }

  // Re-sync truth (optional but recommended)
  
};



useEffect(() => {
  const channel = supabase
    .channel("realtime-post-views")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "post_views" },
      () => {
        fetchPosts();
      }
    )
    .subscribe();

  // ✅ Cleanup MUST be sync
  return () => {
    supabase.removeChannel(channel);
  };
}, [fetchPosts]);


useEffect(() => {
  const channel = supabase
    .channel("realtime-post-likes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "post_likes",
      },
      (payload) => {
        // Any like/unlike anywhere → re-sync
        fetchPosts();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [fetchPosts]);


useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    setCurrentUserId(data.user?.id ?? null);
  });
}, []);




  const handlePost = async (e: React.FormEvent, type: 'reel' | 'meme') => {
    e.preventDefault();
    if (!content && !file) return alert("Please add text or a file");
    
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      let publicUrl = null;

      // Handle File Upload (Video for reels, Image for memes)
      if (file) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${type === 'reel' ? 'reels' : 'memes'}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(filePath, file, { contentType: file.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("chat-attachments")
          .getPublicUrl(filePath);
          
        publicUrl = urlData.publicUrl;
      }

      // Save to Database
      const { error: dbError } = await supabase
        .from("video_posts")
        .insert({
          content,
          video_url: publicUrl,
          user_id: userData.user.id
          
          // If you have a 'type' column in your DB, add: post_type: type
        });

      if (dbError) throw dbError;

      // Reset
      setContent("");
      setFile(null);
      setActiveTab('none');
      fetchPosts();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container">
      {/* HEADER WITH NAV ICONS */}
      <div className="header-nav">
        <div className="left-header">
    <button className="nav-btn" onClick={() => window.location.href = '/'}>
      <HomeArrowIcon />
    </button>
        <h2>Reels|Memes</h2>
        </div>
<div className="icon-group">
{searchOpen ? (
  <div className="search-wrapper">
    <div className="search-bar open-left">
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
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <input
        autoFocus
        type="text"
        placeholder="Search…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <button
        className="close-search"
        onClick={() => {
          setSearchOpen(false);
          setSearchQuery("");
        }}
      >
        ×
      </button>
    </div>
  </div>
) : (

    <>
      {/* 🔍 SEARCH ICON */}
      <button
        className="icon-btn"
        onClick={() => setSearchOpen(true)}
      >
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
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {/* 🎞 REEL */}
      <button 
        className={`icon-btn ${activeTab === 'reel' ? 'active-reel' : ''}`}
        onClick={() => setActiveTab(activeTab === 'reel' ? 'none' : 'reel')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
          <path d="M2 12h20M12 2v20M7 2v20M17 2v20"/>
        </svg>
        <span className="icon-label"></span>
      </button>

      {/* 🖼 MEME */}
      <button 
        className={`icon-btn ${activeTab === 'meme' ? 'active-meme' : ''}`}
        onClick={() => setActiveTab(activeTab === 'meme' ? 'none' : 'meme')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span className="icon-label"></span>
      </button>
    </>
  )}
</div>

      </div>

      {/* UPLOAD SECTIONS */}
{activeTab !== 'none' && (
  <form 
    onSubmit={(e) => handlePost(e, activeTab === 'reel' ? 'reel' : 'meme')} 
    className={`upload-section ${activeTab}-border`}
  >
    <div className="upload-header">
      <h3>{activeTab === 'reel' ? 'Post a Reel' : 'Share a Meme'}</h3>
      <button type="button" className="close-x" onClick={() => setActiveTab('none')}>×</button>
    </div>

    <textarea 
      placeholder={activeTab === 'reel' ? "What's the vibe of this reel?" : "Write something funny..."} 
      value={content} 
      onChange={(e) => setContent(e.target.value)} 
    />

    <div className="upload-controls">
      {/* Hidden default input */}
      <input 
        id="file-upload"
        type="file" 
        style={{ display: 'none' }}
        accept={activeTab === 'reel' ? "video/*" : "image/*"} 
        onChange={(e) => setFile(e.target.files?.[0] || null)} 
      />
      
      {/* Custom Styled Add File Button */}
      <label htmlFor="file-upload" className="add-file-label">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        {file ? file.name.substring(0, 15) + "..." : "Add File"}
      </label>

      <div className="form-actions">
        <button type="button" className="cancel-text-btn" onClick={() => setActiveTab('none')}>
          Cancel
        </button>
        <button type="submit" className="share-btn" disabled={uploading}>
          {uploading ? (
            <span className="spinner"></span>
          ) : (
            <>
              <span>Share</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 14-7-7 14-2-7-7-2Z"/>
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  </form>
)}

      {/* FEED */}
<div className="video-feed">
  {loading ? (
   <div className="loading-feed">
  <div className="spinner"></div>
  <span>Loading feed</span>
</div>


  ) : filteredPosts.length === 0 && searchQuery ? (
    <div className="empty-search">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.6 }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <p>No results found</p>
      <span>
        No users match <strong>“{searchQuery}”</strong>
      </span>
    </div>

  ) : (
    filteredPosts.map((post) => {
      const isVideo = post.video_url?.includes('.mp4') || post.video_url?.includes('reels');
      const hasMedia = !!post.video_url;

      return (
        <div key={post.id} className="post-container">
          {/* TOP: User Profile */}
<div className="post-header-outer">
  <div className="user-info">
    {/* Avatar */}
    <div className="user-avatar">
      {post.profiles?.avatar_url ? (
        <img
          src={post.profiles.avatar_url}
          alt={post.profiles.full_name}
          className="avatar-img"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="user-avatar-placeholder">
          {post.profiles?.full_name?.charAt(0) || "🧑"}
        </div>
      )}
    </div>

    {/* Username */}
    <span className="user-name">
      {post.profiles?.full_name || "Anonymous User"}
    </span>
  </div>

  {/* More button */}
<div className="more-wrapper">
  <button
    className="more-btn"
    onClick={() =>
      setMenuPostId(menuPostId === post.id ? null : post.id)
    }
  >
    •••
  </button>

  {menuPostId === post.id && (
    <div className="post-menu">
      {/* 🚨 REPORT */}
      <button
        className="menu-item danger"
        onClick={() => {
          alert("Reported");
          setMenuPostId(null);
        }}
      >
         Report
      </button>

      {/* 💬 MESSAGE USER */}
      <button
        className="menu-item"
        onClick={() => {
          window.location.href = `/messages?user=${post.user_id}`;
        }}
      >
         Message user
      </button>

      {/* ✏️ EDIT / 🗑 DELETE — ONLY OWNER */}
      {currentUserId === post.user_id && (
        <>
          <button
            className="menu-item"
            onClick={() => {
              alert("Edit coming next");
              setMenuPostId(null);
            }}
          >
             Edit
          </button>

          <button
            className="menu-item danger"
            onClick={async () => {
              if (!confirm("Delete this post?")) return;

              await supabase
                .from("video_posts")
                .delete()
                .eq("id", post.id);

              setPosts(prev => prev.filter(p => p.id !== post.id));
              setMenuPostId(null);
            }}
          >
             Delete
          </button>
        </>
      )}
    </div>
  )}
</div>

</div>


          {/* MIDDLE: THE DYNAMIC CARD */}
          <div className="dynamic-meme-card">
            {hasMedia ? (
              isVideo ? (
               <video
  src={post.video_url!}
  controls
  muted
  playsInline
  className="content-fit-media"
  onPlay={() => trackView(post.id)}
/>

              ) : (
               <img
  src={post.video_url!}
  alt="meme"
  className="content-fit-media"
  onLoad={() => trackView(post.id)}
/>

              )
            ) : (
              /* TEXT MEME: Card will contract/expand based on text length */
              <div className="text-meme-content">
                <p>{post.content}</p>
              </div>
            )}
          </div>

                      {hasMedia && post.content && (
              <div className="caption">
                <strong>{'@M@'}</strong> {post.content}
              </div>
            )}

          {/* BOTTOM: Actions */}
          <div className="post-footer-outer">
            <div className="action-bar">
              <div className="left-actions">
<button 
  className={`action-btn like-btn ${userLikedPosts.includes(post.id) ? 'liked' : ''}`} 
  onClick={() => handleLike(post.id)}
>
  <LikeIcon />
  {/* Ensure we only show a number if it exists and is > 0 */}
  {(post.likes_count ?? 0) > 0 && (
    <span className="like-count">{post.likes_count}</span>
  )}
</button>
<button
  className="action-btn"
  onClick={() => {
    trackView(post.id);        // 👁️ count view
    setShowComments(post.id);  // 💬 open comments
    fetchComments(post.id);    // 🔄 load comments
  }}
>
  <CommentIcon />
  {post.comments_count > 0 && (
    <span className="count-badge">{post.comments_count}</span>
  )}
</button>

<button className="action-btn view-btn" onClick={() => openViewers(post.id)}>
  <ViewIcon />
  {(post.views_count ?? 0) > 0 && (
    <span className="count-badge">{post.views_count}</span>
  )}
</button>

<button
  className="action-btn"
  onClick={() => {
    trackView(post.id);   // 👁️ mark as viewed
    handleShare(post);    // 🔗 open share sheet
  }}
>
  <ShareIcon />
</button>

<button
  className={`action-btn follow-btn ${
    followingIds.includes(post.user_id) ? "following" : ""
  }`}
  onClick={() => toggleFollow(post.user_id)}
>
  <FollowIcon following={followingIds.includes(post.user_id)} />

  {post.followers_count > 0 && (
    <span className="count-badge">{post.followers_count}</span>
  )}
</button>




              </div>
<button
  className="action-btn"
  onClick={() => {
    trackView(post.id);      // 👁️ mark as viewed
    handleDownload(post);    // ⬇️ download
  }}
  disabled={downloadingPostId === post.id}
>
  {downloadingPostId === post.id ? <SpinnerIcon /> : <SaveIcon />}
</button>



            </div>
            

            
            <div className="timestamp">
              {new Date(post.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      );
    })
  )}
</div>


{/* COMMENT BOTTOM SHEET */}
{showComments && (
  <div className="comment-sheet-overlay" onClick={() => {setShowComments(null); setReplyingTo(null);}}>
    <div className="comment-sheet" onClick={e => e.stopPropagation()}>
      
      {/* 1. HEADER WITH DRAG HANDLE */}
      <div className="sheet-header">
        <div className="drag-handle"></div>
        <div className="header-title">
          <h3>Comments</h3>
          <span className="comment-total">{comments.length}</span>
        </div>
        <button className="close-sheet-btn" onClick={() => setShowComments(null)}>×</button>
      </div>

      {/* 2. SCROLLABLE COMMENT LIST */}
      <div className="comments-scroll-area">
        {comments.length === 0 ? (
          <div className="empty-state">
            <p>comments</p>
            <span>No comments yet. Be the first to comment!</span>
          </div>
        ) : (
          comments.filter(c => !c.parent_id).map(comment => (
           
           
            <div key={comment.id} className="comment-thread">
              {/* Main Comment */}
              <div className="comment-block">
                <div className="comment-avatar">
                  {comment.profiles?.full_name?.charAt(0) || '?'}
                </div>
                <div className="comment-content">
                  <div className="comment-bubble">
                    <span className="author-name">{comment.profiles?.full_name || 'User'}</span>
                    <p>{comment.content}</p>
                  </div>
                  <div className="comment-actions">
                    <span className="comment-time">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>


<button
  className="reply-trigger"
  onClick={() => {
    if (openReplies === comment.id) {
      // Close replies
      setOpenReplies(null);
      setReplyingTo(null);
      
    } else {
      // Open replies
      setOpenReplies(comment.id);
      setReplyingTo(comment);
    }
}}
>
    

{openReplies === comment.id ? "Hide replies" : "Reply"}

        

</button>

                  </div>
                </div>
              </div>
              
              {/* Nested Replies */}
{openReplies === comment.id &&
  comments
    .filter(r => r.parent_id === comment.id)
    .map(reply => (
      <div key={reply.id} className="reply-block">
        <div className="reply-avatar">
          {reply.profiles?.full_name?.charAt(0) || '?'}
        </div>
        <div className="comment-content">
          <div className="comment-bubble reply-bubble">
            <span className="author-name">
              {reply.profiles?.full_name}
            </span>
            <p>{reply.content}</p>
          </div>
        </div>
      </div>
    ))}

            </div>
          ))
        )}
      </div>

      {/* 3. INPUT AREA (STUCK TO BOTTOM) */}
      <div className="sheet-footer">
        {replyingTo && (
          <div className="active-reply-bar">
            <span>Replying to <strong>{replyingTo.profiles?.full_name}</strong></span>
            <button onClick={() => setReplyingTo(null)}>Cancel</button>
          </div>
        )}
        <div className="comment-input-row">
          <input 
            type="text"
            placeholder={replyingTo ? "Write a reply..." : "Add a comment..."}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
          />
          <button 
            className="send-comment-btn" 
            onClick={handleSendComment}
            disabled={!newComment.trim()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m5 12 14-7-7 14-2-7-7-2Z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
)}

{showViewers && (
  <div
    className="comment-sheet-overlay"
    onClick={() => setShowViewers(null)}
  >
    <div
      className="comment-sheet"
      onClick={e => e.stopPropagation()}
    >
      {/* HEADER */}
      <div className="sheet-header">
        <div className="drag-handle"></div>

        <div className="header-title">
          <h3>Views</h3>
          <span className="comment-total">{viewers.length}</span>
        </div>

<button
  className="close-sheet-btn"
  onClick={() => setShowViewers(null)}
  aria-label="Close"
>
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="M6 6 18 18" />
  </svg>
</button>

      </div>

      {/* VIEWERS LIST */}
<div className="comments-scroll-area">
  {viewers.length === 0 ? (
    <div className="empty-state">
      <p>Views</p>
      <span>No views yet</span>
    </div>
  ) : (
    viewers.map((v, i) => {
      const profile = v.profiles;

      return (
        <div key={i} className="viewer-row">
          {/* Avatar */}
          <div className="user-avatar">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="avatar-img"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="user-avatar-placeholder">
                {profile?.full_name?.charAt(0) || "🧑"}
              </div>
            )}
          </div>

          {/* Name */}
          <span className="viewer-name">
            {profile?.full_name || "User"}
          </span>
        </div>
      );
    })
  )}
</div>

 

    </div>
  </div>
)}





      <style jsx>{`

      .loading-feed {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 0;
  font-size: 14px;
  color: #999;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 2.5px solid rgba(255, 255, 255, 0.15);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}


      .more-wrapper {
  position: relative;
}

.post-menu {
  position: absolute;
  right: 0;
  top: 28px;
  background: #111;
  border-radius: 10px;
  padding: 6px;
  min-width: 160px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.3);
  z-index: 50;
}

.menu-item {
  width: 100%;
  padding: 10px;
  background: none;
  border: none;
  color: #fff;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
}

.menu-item:hover {
  background: rgba(255,255,255,0.08);
}

.menu-item.danger {
  color: #ff5c5c;
}


      .search-wrapper {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  justify-content: flex-end; /* 🔥 critical */
}
  .empty-search {
  text-align: center;
  padding: 40px 20px;
  color: #888;
}

.empty-search p {
  font-size: 16px;
  font-weight: 600;
  margin-top: 12px;
}

.empty-search span {
  font-size: 14px;
  opacity: 0.8;
}


.icon-group {
  display: flex;
  align-items: center;
  padding-top: 10px;
  padding-bottom: 0px;
  padding-right: 10px;
  gap: 8px;
  position: relative; /* anchor */
}

/* Wrapper anchors the bar on the right */
.search-wrapper {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
}

/* Bar grows LEFT */
.search-bar.open-left {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 220px;
  padding: 6px 12px;
  background: #020617;
  border: 1px solid #334155;
  border-radius: 999px;

  transform-origin: right center;
  animation: expandLeft 0.2s ease-out;
}

@keyframes expandLeft {
  from {
    opacity: 0;
    transform: scaleX(0.6);
  }
  to {
    opacity: 1;
    transform: scaleX(1);
  }
}


.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #020617;
  border: 1px solid #334155;
  border-radius: 999px;
  padding: 6px 12px;
   max-width: calc(100vw - 80px);
  width: 220px;
}

.search-bar input {
  flex: 1;
  background: transparent;
  border: none;
  color: white;
  outline: none;
  font-size: 14px;
}

.close-search {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 20px;
  cursor: pointer;
}


.follow-btn {
  color: #94a3b8;
}

.follow-btn.following {
  color: white;
}


.viewer-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}

.viewer-name {
  font-weight: 500;
}

.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  overflow: hidden;
  background: #222;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar-placeholder {
  color: #fff;
  font-weight: 600;
}


      .user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: #222;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar-placeholder {
  color: white;
  font-weight: 600;
}


      .spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.viewer-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  font-size: 14px;
  color: #f1f5f9;
}
.close-sheet-btn:hover {
  color: #f87171; /* subtle red hint */
}



.sheet-header {
  position: relative;
  padding: 10px 0 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.drag-handle {
  width: 36px;
  height: 4px;
  background: #334155;
  border-radius: 999px;
  margin-bottom: 10px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.comment-total {
  font-size: 0.8rem;
  color: #94a3b8;
}

.close-sheet-btn {
  position: absolute;
  right: 0;
  top: 0;
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 26px;
  cursor: pointer;
  padding: 6px;
}

.close-sheet-btn:hover {
  color: #f8fafc;
}

.sheet-footer {
  border-top: 1px solid #1e293b;
  padding-top: 10px;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.active-reply-bar {
  background: #1e293b;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12px;
  color: #cbd5f5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.active-reply-bar button {
  background: none;
  border: none;
  color: #3b82f6;
  font-weight: 600;
  cursor: pointer;
}

.comment-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.comment-input-row input {
  flex: 1;
  background: #020617;
  border: 1px solid #334155;
  color: white;
  padding: 12px 14px;
  border-radius: 999px;
  font-size: 14px;
  outline: none;
}

.comment-input-row input::placeholder {
  color: #64748b;
}

.send-comment-btn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: none;
  background: #3b82f6;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.1s, background 0.2s;
}

.send-comment-btn:disabled {
  background: #1e293b;
  cursor: not-allowed;
}

.send-comment-btn:not(:disabled):active {
  transform: scale(0.9);
}

.send-comment-btn svg {
  transform: translateX(1px);
}

      /* 2. SCROLLABLE COMMENT LIST */
.comments-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 10px 5px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  /* Hide scrollbar for clean look but keep functionality */
  scrollbar-width: none; 
}
.comments-scroll-area::-webkit-scrollbar {
  display: none;
}

/* THREAD STRUCTURE */
.comment-thread {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comment-block, .reply-block {
  display: flex;
  gap: 12px;
  width: 100%;
}

.reply-block {
  margin-left: 45px; /* Indent replies */
  margin-top: -4px;
}

/* AVATARS */
.comment-avatar, .reply-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.reply-avatar {
  width: 28px;
  height: 28px;
  font-size: 12px;
}

/* BUBBLES */
.comment-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;
}

.comment-bubble {
  background: #1e293b;
  padding: 10px 14px;
  border-radius: 18px;
  border-top-left-radius: 2px;
}

.reply-bubble {
  background: #0f172a;
  border: 1px solid #334155;
}

.author-name {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  margin-bottom: 2px;
}

.comment-bubble p {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  color: #f1f5f9;
  word-break: break-word;
}

/* ACTIONS (Time & Reply Button) */
.comment-actions {
  display: flex;
  gap: 15px;
  padding-left: 4px;
}

.comment-time {
  font-size: 11px;
  color: #64748b;
}

.reply-trigger {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.reply-trigger:hover {
  color: #3b82f6;
}

/* EMPTY STATE */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  text-align: center;
  gap: 10px;
}

.empty-state p {
  font-size: 2rem;
  margin: 0;
}

.empty-state span {
  font-size: 14px;
}



.comment-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.comment-sheet {
  background: #0f172a;
  height: 60vh;
  border-radius: 24px 24px 0 0;
  display: flex;
  flex-direction: column;
  padding: 20px;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

reply-item { margin-left: 30px; margin-top: 8px; font-size: 0.85rem; color: #94a3b8; }


  .reply-block {
  position: relative;
}

/* Optional: Vertical thread line */
.reply-block::before {
  content: "";
  position: absolute;
  left: -20px;
  top: -15px;
  bottom: 50%;
  width: 2px;
  background: #334155;
  border-bottom-left-radius: 10px;
}



    .like-btn {
  display: flex;
  align-items: center;
  gap: 5px; /* Space between icon and number */
}

.like-count {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.upload-section {
  background: #0f172a;
  border-radius: 20px;
  padding: 20px;
  border: 1px solid #1e293b;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  margin-bottom: 30px;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.upload-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.close-x {
  background: none;
  border: none;
  color: #64748b;
  font-size: 24px;
  cursor: pointer;
}
  * {
  min-width: 0;
}

html, body {
  overflow-x: hidden;
}

textarea {
  width: 100%;
  background: transparent;
  border: none;
  color: white;
  overflow: hidden;
   box-sizing: border-box;
  font-size: 1.1rem;
  resize: none;
  outline: none;
  padding: 10px 0;
  min-height: 100px;
}

.upload-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #1e293b;
}

/* ADD FILE BUTTON */
.add-file-label {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1e293b;
  color: #f8fafc;
  padding: 10px 16px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.add-file-label:hover {
  background: #334155;
}

/* CANCEL & SHARE BUTTONS */
.form-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

.cancel-text-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-weight: 600;
  cursor: pointer;
  padding: 8px;
}

.share-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.1s, background 0.2s;
}

.share-btn:hover:not(:disabled) {
  background: #2563eb;
  transform: translateY(-1px);
}

.share-btn:active {
  transform: translateY(0px);
}

.share-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* LOADING SPINNER */
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

      .left-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-btn {
  background: none;
  border: none;
  color: #f1f5f9;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.nav-btn:hover {
  background: #1e293b;
}

.header-nav h2 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.5px;
}



 /* Each post wrapper */
.post-container {
  margin-bottom: 50px;
  display: flex;
  flex-direction: column;
}

/* THE CARD: This expands/contracts based on children */
.dynamic-meme-card {
  background: #0f172a; 
  border: 1px solid #334155;
  border-radius: 50px;
  overflow: hidden;
  width: 100%; /* Keeps the card aligned to the feed width */
  height: auto; /* IMPORTANT: Let content decide height */
  display: flex;
  flex-direction: column;
}

/* MEDIA: Grow to fit width, height follows aspect ratio */
.content-fit-media {
  width: 100%;
  height: auto;
  display: block;
  max-height: 85vh; /* Stops it from being infinitely tall */
  object-fit: contain;
  background: #000;
}

/* TEXT MEME: Snug padding */
.text-meme-content {
  padding: 24px; /* Card height is determined solely by text + this padding */
  text-align: left;
}

.text-meme-content p {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.5;
  color: #f8fafc;
  word-wrap: break-word;
}

/* CAPTION (Only for images/videos) */
.caption {
  font-size: 0.9rem;
  margin-top: 8px;
  color: #cbd5e1;
}
        /* This fills the whole screen background */
        body {
          background-color: #000000 !important;
          margin: 0;
          padding: 0;
        }
    



.container {
  width: 100%;
  min-height: 100vh;
    max-width: 100%;
  overflow-x: hidden;
  margin: 0;
  color: white;
  padding: 0px; /* optional, small breathing room */
  background-color: #000;
  box-sizing: border-box;
}
.video-feed {
  max-width: 550px;
  margin: 0 auto;
}
html, body, #__next {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: #000;
  overflow-x: hidden;
}

        
.header-nav {
  position: sticky;
  top: env(safe-area-inset-top);
  z-index: 1000;
   overflow-x: hidden;

  padding-top: calc(env(safe-area-inset-top) + 8px);
  padding-left: 12px;
  padding-right: 12px;
  padding-bottom: 12px;

  display: flex;
  justify-content: space-between;
  align-items: center;

  background: #000;
  border-bottom: 1px solid #1e293b;
}

        
    
        
        .icon-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #0f172a;
          border: 1px solid #334155;
          color: #94a3b8;
          padding: 8px 16px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .active-reel { background: #2563eb; color: white; border-color: #3b82f6; }
        .active-meme { background: #7c3aed; color: white; border-color: #8b5cf6; }


        
        textarea { 
          background: #000; 
          color: white; 
          border: 1px solid #334155; 
          padding: 12px; 
          border-radius: 8px; 
          resize: none; 
          min-height: 80px; 
        }

        .post-header-outer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
        }

        .user-info { display: flex; align-items: center; gap: 12px; }
        
        .user-avatar, .user-avatar-placeholder {
          width: 38px; 
          height: 38px; 
          border-radius: 50%; 
          background: #3b82f6; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-weight: bold;
          font-size: 14px;
        }

        .user-name { font-weight: 600; font-size: 14px; color: #f8fafc; }
        .more-btn { background: none; border: none; color: #64748b; cursor: pointer; font-size: 18px; }




        /* ACTIONS & CAPTION (OUTSIDE CARD) */
        .post-footer-outer {
          padding: 14px 0;
        }

        .action-bar { 
          display: flex; 
          justify-content: space-between; 
          margin-bottom: 12px; 
        }

        .left-actions { display: flex; gap: 20px; }

        .action-btn { 
          background: none; 
          border: none; 
          color: #f8fafc; 
          cursor: pointer; 
          padding: 0; 
          display: flex;
          align-items: center;
          transition: transform 0.1s;
        }
        
        .action-btn:active { transform: scale(0.9); }

        .caption { font-size: 14px; color: #e2e8f0; line-height: 1.5; margin-top: 4px; }
        .caption strong { color: white; margin-right: 8px; }

        .timestamp { 
          font-size: 11px; 
          color: #64748b; 
          margin-top: 8px; 
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        button.publish-btn { background: #3b82f6; color: white; padding: 10px 20px; border-radius: 8px; cursor: pointer; border: none; font-weight: bold; }
        button:disabled { opacity: 0.5; }
        .cancel-btn { background: transparent; color: #94a3b8; border: none; cursor: pointer; }
      `}</style>
    </div>
  );
}