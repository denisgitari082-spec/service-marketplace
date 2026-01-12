"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../src/lib/supabaseClient";


export default function GroupAdminPage() {
  const router = useRouter();
  const { id } = router.query; // Get ID from query string
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [content, setContent] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
 const [previewUrl, setPreviewUrl] = useState<string | null>(null);

 // 1. Add state to track which message is being edited
const [editingPostId, setEditingPostId] = useState<string | null>(null);
const [editContent, setEditContent] = useState("");

// 2. Delete Logic
const handleDeleteMessage = async (post: any) => {
  const isOwner = post.user_id === userId;
  // Admin can delete anything, users can only delete their own
  if (!isAdmin && !isOwner) return;

  if (!window.confirm("Delete this message?")) return;

  const { error } = await supabase
    .from("group_posts")
    .delete()
    .eq("id", post.id);

  if (!error) {
    setPosts(prev => prev.filter(p => p.id !== post.id));
  }
};

// 3. Edit Logic
const handleStartEdit = (post: any) => {
  setEditingPostId(post.id);
  setEditContent(post.content);
};

const handleSaveEdit = async (postId: string) => {
  if (!editContent.trim()) return;

  const { error } = await supabase
    .from("group_posts")
    .update({ content: editContent, is_edited: true }) // You may want an 'is_edited' column
    .eq("id", postId);

  if (!error) {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content: editContent, is_edited: true } : p));
    setEditingPostId(null);
  }
};

  // 1. Add this state at the top with your other states
const [showEmojiPicker, setShowEmojiPicker] = useState(false);
const emojis = ["😀", "😂", "🥰", "👍", "🔥", "🙌", "❤️", "✨", "🚀", "😮"];

// 2. Function to add emoji to text
const addEmoji = (emoji: string) => {
  setContent(prev => prev + emoji);
  setShowEmojiPicker(false);
  textareaRef.current?.focus();
};
// WhatsApp-style Image Compressor
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 1024; // Standard mobile width
          const scale = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Compress to JPEG at 70% quality
          canvas.toBlob((blob) => resolve(blob as Blob), "image/jpeg", 0.7);
        };
      };
    });
  };
  const handleDownload = async (url: string, fileName: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed", error);
    }
  };

const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setPendingFile(file);
  
  // Create a local URL so the user can see/hear it before sending
  const url = URL.createObjectURL(file);
  setPreviewUrl(url);
};

// Helper to cancel the selection
const cancelFile = () => {
  setPendingFile(null);
  setPreviewUrl(null);
  if (fileInputRef.current) fileInputRef.current.value = "";
};

  const handleStartCall = async (type: 'voice' | 'video') => {
  if (!userId || !isMember) return;

  // Insert a special "Call" post into the database
  const { error } = await supabase.from("group_posts").insert([{
    group_id: id,
    user_id: userId,
    content: `started a ${type} call`, // The text that shows in the bubble
    is_call: true, // You might need to add this boolean column to your table
    call_type: type
  }]);

  if (!error) {
    // Navigate the caller to the call page immediately
    router.push(`/calls?id=${id}&type=${type}`);
  }
};

useEffect(() => {
  if (router.isReady && id) {
    init();

    const channel = supabase
      .channel(`group-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Listen specifically for new messages
          schema: 'public',
          table: 'group_posts',
          filter: `group_id=eq.${id}`,
        },
        async (payload) => {
          // Instead of fetching everything, fetch the full profile for JUST the new message
          const { data: newPost } = await supabase
            .from("group_posts")
            .select(`*, profiles (full_name)`)
            .eq("id", payload.new.id)
            .single();

          if (newPost) {
            setPosts((prev) => [newPost, ...prev]); // Add to the top of the list
          }
        }
      )
.on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'group_posts', filter: `group_id=eq.${id}` },
  async (payload) => {
    if (payload.eventType === 'INSERT') {
      const { data: newPost } = await supabase
        .from("group_posts")
        .select(`*, profiles (full_name)`)
        .eq("id", payload.new.id)
        .single();
      if (newPost) setPosts((prev) => [newPost, ...prev]);
    } else if (payload.eventType === 'DELETE') {
      setPosts((prev) => prev.filter(p => p.id !== payload.old.id));
    } else if (payload.eventType === 'UPDATE') {
      setPosts((prev) => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
    }
  }
)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}, [id, router.isReady]);

  // UI UPGRADE: Auto-expand textarea height based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "42px";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  const init = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        router.push('/auth/login'); // Redirect if not logged in
        return;
    }
    setUserId(user.id);

    // 1. Get Group Data
    const { data: groupData } = await supabase.from("groups").select("*").eq("id", id).single();
    if (groupData) {
      setGroup(groupData);
      setIsAdmin(groupData.created_by === user.id);
    }

    // 2. Check Membership & Fetch Members
    await fetchMembers(user.id);
    
    // 3. Fetch Posts
    await fetchPosts();
    
    setLoading(false);
  };

const fetchMembers = async (currentUid?: string) => {
  const uid = currentUid || userId;
  if (!uid || !id) return; 

  const { data: memData, error } = await supabase
    .from("group_members")
    .select(`
      user_id,
      profiles (
        full_name
      )
    `) // Removed avatar_url from here
    .eq("group_id", id);

  if (error) {
    console.error("Supabase Error:", error.message);
    // CRITICAL: If there's an error, don't just return. 
    // Set loading to false so we don't get stuck.
    return;
  }

  const memberList = memData || [];
  setMembers(memberList);

  const isMemberCheck = memberList.some(m => String(m.user_id) === String(uid));
  setIsMember(isMemberCheck);
};
const fetchPosts = async () => {
    // You must add 'error' here inside the curly braces
    const { data: postData, error } = await supabase
      .from("group_posts")
      .select(`
        *,
        profiles (full_name)
      `)
      .eq("group_id", id)
      .order("created_at", { ascending: false });

    // Now 'error' (lowercase) is defined and can be checked
    if (error) {
      console.error("Error fetching posts:", error.message);
      return;
    }
    
    setPosts(postData || []);
  };


const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && !pendingFile) || !userId || !isMember) return;

    try {
      setUploading(true);
      let mediaUrl = null;
      let isMedia = false;
      let finalContent = content;

      if (pendingFile) {
        let fileToUpload: File | Blob = pendingFile;
        
        // 1. WhatsApp-style Video Constraint
        if (pendingFile.type.startsWith("video/") && pendingFile.size > 25 * 1024 * 1024) {
          alert("Video too large! Keep it under 25MB (WhatsApp limit).");
          setUploading(false);
          return;
        }

        // 2. Client-side Image Compression
        if (pendingFile.type.startsWith("image/")) {
          fileToUpload = await compressImage(pendingFile);
        }

        const storagePath = `${id}/${Date.now()}_${pendingFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('group-media')
          .upload(storagePath, fileToUpload, { cacheControl: '3600', upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('group-media')
          .getPublicUrl(storagePath);

        mediaUrl = publicUrl;
        isMedia = true;
        if (!finalContent.trim()) finalContent = pendingFile.name;
      }

      const { error: postError } = await supabase.from("group_posts").insert([{
        group_id: id,
        user_id: userId,
        content: finalContent,
        media_url: mediaUrl,
        is_media: isMedia,
        is_contract: false
      }]);

      if (postError) throw postError;
      setContent("");
      cancelFile();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const removeMember = async (memId: string) => {
    if (!isAdmin || memId === userId) return;
    if (!window.confirm("Are you sure you want to remove this member?")) return;
    
    await supabase.from("group_members").delete().eq("group_id", id).eq("user_id", memId);
    fetchMembers();
  };

  if (loading) return <div className="state-screen">Loading Chat...</div>;
  if (!isMember) {
  return (
    <div className="state-screen">
      <div style={{ textAlign: 'center' }}>
        <p>You are not a member of this group.</p>
        <button 
          onClick={() => router.push('/group')}
          style={{ marginTop: '10px', padding: '8px 16px', cursor: 'pointer' }}
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
  return (
    <div className="chat-container">
     <aside className={`sidebar ${showMembers ? 'mobile-show' : 'mobile-hide'}`}>
        <div className="sidebar-header">
          <h3>Members ({members.length})</h3>
          <button className="close-sidebar-btn" onClick={() => setShowMembers(false)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
        </div>
        <div className="member-list">
          {members.map((m) => (
            <div key={m.user_id} className="member-item">
             <span className="user-name">
  {m.profiles?.full_name || `User ${m.user_id.slice(0, 5)}`}
</span>
              {m.user_id === group?.created_by ? (
                <span className="admin-badge">Owner</span>
              ) : isAdmin ? (
                <button onClick={() => removeMember(m.user_id)} className="kick-btn">Kick</button>
              ) : null}
            </div>
          ))}
        </div>
      </aside>
      {showMembers && (
  <div className="sidebar-overlay" onClick={() => setShowMembers(false)} />
)}

      <main className="chat-area">
{/* Mobile App Bar */}
<div className="mobile-app-bar">
  <button
    className="appbar-btn"
    onClick={() => router.push("/group")}
    aria-label="Back"
  >
    ←
  </button>

  <div className="appbar-center">
    <h1 className="appbar-title">
      {group?.name || "Group"}
    </h1>
    <span className="appbar-sub">
      {members.length} members
    </span>
  </div>

  <button
    className="appbar-btn"
    onClick={() => setShowMembers(true)}
    aria-label="Members"
  >
    👥
  </button>
</div>


<header className="chat-header">
  {/* LEFT SIDE: Avatar and Name */}
  <div className="header-left">
    <button onClick={() => router.push("/group")} className="group-avatar-link">
      {group?.avatar_url ? (
        <img 
          src={group.avatar_url} 
          alt={group.name} 
          className="header-group-avatar" 
        />
      ) : (
        <div className="header-group-avatar-fallback">
          {group?.name?.charAt(0) || "G"}
        </div>
      )}
    </button>
    <div className="header-info">
      <h2 className="nav-current">{group?.name || "Chat"}</h2>
      <p className="status-sub">{members.length} members</p>
    </div>
  </div>

  {/* RIGHT SIDE: Actions and Exit */}
  <div className="header-right">
    <div className="call-actions">
      {/* Members Toggle */}
      <button 
        className={`call-btn ${showMembers ? 'active-toggle' : ''}`} 
        onClick={() => setShowMembers(!showMembers)}
        title="Show Members"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      </button>

      {/* Voice Call */}
      <button className="call-btn voice" onClick={() => handleStartCall('voice')} title="Start Voice Call">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
      </button>

      {/* Video Call */}
      <button className="call-btn video" onClick={() => handleStartCall('video')} title="Start Video Call">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"></polygon>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
      </button>
    </div>

    <button className="exit-btn" onClick={() => router.push("/group")}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '8px'}}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
      </svg>
      Back
    </button>
  </div>
</header>

<div className="feed">
  {posts.map((post) => (
    <div key={post.id} className={`post-row ${post.user_id === userId ? 'own-post' : 'other-post'}`}>
      <div className={`post-bubble ${post.is_call ? 'call-bubble' : ''}`}>
        
        {/* ACTION BUTTONS: Edit/Delete Overlay */}
        {!post.is_call && (post.user_id === userId || isAdmin) && (
          <div className="post-actions-overlay">
            {/* Edit only for the sender and only for text posts */}
            {post.user_id === userId && !post.is_media && (
              <button onClick={() => handleStartEdit(post)} className="action-icon" title="Edit">✎</button>
            )}
            {/* Delete for sender OR admin */}
            <button onClick={() => handleDeleteMessage(post)} className="action-icon delete" title="Delete">✕</button>
          </div>
        )}

        {/* CASE 1: CALL MESSAGES */}
        {post.is_call ? (
          <div className="call-message-content">
            <div className={`call-icon-circle ${post.content === "Call ended" ? 'ended' : 'active'}`}>
              {post.call_type === 'video' ? (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
              )}
            </div>
            <div className="call-details">
              <p><strong>{post.profiles?.full_name || 'User'}</strong> {post.content}</p>
              {post.content !== "Call ended" && (
                <button className="join-call-btn" onClick={() => router.push(`/calls?id=${id}&type=${post.call_type}`)}>Join</button>
              )}
            </div>
          </div>
        ) : (
          /* CASE 2: TEXT & MEDIA MESSAGES */
          <div className="post-content">
            {editingPostId === post.id ? (
              /* EDIT MODE */
              <div className="edit-mode">
                <textarea 
                  className="edit-textarea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  autoFocus
                />
                <div className="edit-actions">
                  <button onClick={() => handleSaveEdit(post.id)}>Save</button>
                  <button onClick={() => setEditingPostId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              /* VIEW MODE */
              <>
                {post.is_media && post.media_url ? (
                  <div className="media-attachment">
                    {/* Images */}
                    {post.media_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) && (
                      <div className="media-container">
                        <img src={post.media_url} alt="file" className="chat-image" onClick={() => window.open(post.media_url, '_blank')} />
                        <button className="download-overlay-btn" onClick={() => handleDownload(post.media_url, post.content || 'image.jpg')}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4m4-10l5 5 5-5m-5 5V3"/>
                          </svg>
                        </button>
                      </div>
                    )}
                    {/* Video */}
                    {post.media_url.match(/\.(mp4|webm|ogg)$/i) && (
                      <video controls className="chat-video">
                        <source src={post.media_url} type="video/mp4" />
                      </video>
                    )}
                    {/* Audio */}
                    {post.media_url.match(/\.(mp3|wav|ogg)$/i) && (
                      <div className="audio-wrapper">
                        <p className="file-name-label">🎵 {post.content}</p>
                        <audio controls className="chat-audio">
                          <source src={post.media_url} type="audio/mpeg" />
                        </audio>
                      </div>
                    )}
                    {/* Other Files */}
                    {!post.media_url.match(/\.(jpeg|jpg|gif|png|webp|mp4|webm|mp3|wav)$/i) && (
                      <a href={post.media_url} target="_blank" rel="noreferrer" className="file-link">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '8px'}}>
                           <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                           <polyline points="13 2 13 9 20 9"></polyline>
                        </svg>
                        {post.content}
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="content-text">
                    {post.content}
                    {post.is_edited && <span className="edited-label">(edited)</span>}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="post-info">
          <span className="time-stamp">
            {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  ))}
</div>

<footer className="input-footer">
  {showEmojiPicker && (
    <div className="emoji-popover">
      {emojis.map(e => (
        <button key={e} onClick={() => addEmoji(e)} className="emoji-btn">{e}</button>
      ))}
    </div>
  )}

  {/* FIX 1: Moved Preview above the input wrapper so it doesn't break the layout */}
  {pendingFile && (
    <div className="file-preview-container">
      <div className="preview-card">
        <button type="button" className="cancel-preview" onClick={cancelFile}>×</button>
        
        {pendingFile.type.startsWith('image/') && <img src={previewUrl!} className="preview-media" alt="preview" />}
        {pendingFile.type.startsWith('audio/') && <audio src={previewUrl!} controls className="preview-media" />}
        {pendingFile.type.startsWith('video/') && <video src={previewUrl!} className="preview-media" />}
        
        <span className="preview-filename">
          {uploading ? "Uploading..." : pendingFile.name}
        </span>
      </div>
    </div>
  )}
  
  <form onSubmit={handleSendMessage} className="input-wrapper">
    <input 
      type="file" 
      ref={fileInputRef} 
      style={{ display: 'none' }} 
      onChange={handleFileSelect}
    />
    
    <button 
      type="button" 
      className="icon-btn" 
      onClick={() => fileInputRef.current?.click()}
      title="Upload File"
      disabled={uploading}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
    </button>

    <button 
      type="button" 
      className="icon-btn" 
      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
      title="Add Emoji"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
        <line x1="9" y1="9" x2="9.01" y2="9"></line>
        <line x1="15" y1="9" x2="15.01" y2="9"></line>
      </svg>
    </button>

    <textarea 
      ref={textareaRef}
      rows={1}
      value={content}
      onChange={(e) => setContent(e.target.value)}
      placeholder={pendingFile ? "Add a caption..." : "Write a message..."}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage(e);
        }
      }}
    />
    
    {/* FIX 2: Button is now enabled if there is text OR a file */}
    <button 
      type="submit" 
      className="send-btn" 
      disabled={uploading || (!content.trim() && !pendingFile)}
    >
      {uploading ? (
        <span className="spinner"></span> 
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      )}
    </button>
  </form>
</footer>
      </main>

      <style jsx>{`
      @media (max-width: 768px) {

  /* Show mobile app bar */
  .mobile-app-bar {
    display: flex;
  }

  /* Hide desktop header */
  .chat-header {
    display: none;
  }

  /* Push content BELOW app bar */
  .chat-area {
    padding-top: calc(56px + env(safe-area-inset-top));
  }

  /* Feed padding reduced to avoid overflow */
  .feed {
    padding: 12px;
  }

  /* Prevent bubble overflow */
  .post-bubble {
    max-width: 85%;
  }

  /* Images & videos never exceed screen */
  .chat-image,
  .chat-video {
    max-width: 100%;
    width: 100%;
  }

  /* Sidebar must not cause horizontal scroll */
  .sidebar {
    max-width: 85vw;
  }
}


      * {
  box-sizing: border-box;
  min-width: 0;
}

html, body {
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}
.mobile-app-bar {
  display: none;
  position: sticky;
  top: 0;
  z-index: 50;

  height: calc(56px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 12px 0;

  background: #1e293b;
  border-bottom: 1px solid #334155;

  align-items: center;
  justify-content: space-between;
}

.appbar-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: #334155;
  color: white;
  font-size: 18px;
  cursor: pointer;
}

.appbar-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.appbar-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.appbar-sub {
  font-size: 0.7rem;
  color: #94a3b8;
}

      .spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
  .media-container {
    position: relative;
    width: fit-content;
  }
    .group-avatar-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: transform 0.2s ease;
}

.group-avatar-link:hover {
  transform: scale(1.05);
}
  .header-info {
  display: flex;
  flex-direction: column;
}
  .header-group-avatar, .header-group-avatar-fallback {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.header-group-avatar {
  width: 40px;
  height: 40px;
  margin-left: 20px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #334155;
}


.nav-current {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.status-sub {
  margin: 0;
  font-size: 0.75rem;
  color: #10b981;
}

.header-group-avatar-fallback {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #3b82f6;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.2rem;
  border: 2px solid #334155;
}

/* Adjust breadcrumb spacing since we removed "Communities" */
.breadcrumb {
  display: flex;
  align-items: center;
  margin-left: 8px;
}
   

.post-actions-overlay {
  position: absolute;
  top: -10px;
  right: 10px;
  display: flex;
  gap: 4px;
  opacity: 0; /* Hidden until hover */
  transition: opacity 0.2s;
}

.post-row:hover .post-actions-overlay {
  opacity: 1;
}
  .post-row.other-post {
  justify-content: flex-start;
}

.action-icon {
  background: #1e293b;
  border: 1px solid #334155;
  color: #94a3b8;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-icon:hover { color: white; background: #3b82f6; }
.action-icon.delete:hover { background: #ef4444; }

.edit-textarea {
  width: 100%;
  background: #0f172a;
  color: white;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  padding: 5px;
  font-size: 0.9rem;
}

.edit-actions {
  display: flex;
  gap: 10px;
  margin-top: 5px;
}

.edit-actions button {
  font-size: 0.7rem;
  padding: 2px 8px;
  cursor: pointer;
  border-radius: 4px;
  border: none;
}

  .download-overlay-btn {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s, background 0.2s;
    backdrop-filter: blur(4px);
  }

  .media-container:hover .download-overlay-btn {
    opacity: 1;
  }

  .download-overlay-btn:hover {
    background: rgba(59, 130, 246, 0.9);
  }

@keyframes spin {
  to { transform: rotate(360deg); }
}

.file-preview-container {
  background: #1e293b;
  border: 1px solid #3b82f6; /* Blue border to show something is ready to send */
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
   max-width: 100%;
  max-width: 300px;
}
.chat-container { 
    display: flex; 
    height: 100dvh; 
    background: #0e1d20ff; 
    color: white; 
    position: relative; 
    overflow: hidden; 
  }

  /* 2. Sidebar Base Styles (Desktop) */
  .sidebar { 
    width: 280px; 
    height: 100%;
    background: #1e293b; 
    display: flex; 
    flex-direction: column; 
    border-right: 1px solid #334155; 
    transition: transform 0.3s ease, width 0.3s ease;
    z-index: 1000;
  }

  /* 3. Mobile Logic (Max-width 1023px) */
  @media (max-width: 1023px) {
    .sidebar {
      position: absolute;
      left: 0;
      top: 0;
      width: 50% !important; /* Forces 50% width on tablet/mobile */
      box-shadow: 20px 0 50px rgba(0,0,0,0.5);
    }

    .mobile-hide { 
      transform: translateX(-100%); 
      visibility: hidden;
    }

    .mobile-show { 
      transform: translateX(0); 
      visibility: visible;
    }

    .close-sidebar-btn {
      display: block;
      background: none;
      border: none;
      color: #d2d8e1ff;
      cursor: pointer;
    }

    .sidebar-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(2px);
      z-index: 999;
    }
  }

  /* 4. Desktop Logic (Min-width 1024px) */
  @media (min-width: 1024px) {
    .sidebar {
      transform: translateX(0) !important;
      width: 280px !important; /* Standard width for large screens */
      visibility: visible !important;
      position: relative !important;
    }
    
    .sidebar-overlay, .close-sidebar-btn {
      display: none !important;
    }
  }

  /* 5. Utility & Component Styles */
  .active-toggle {
    background: #6dbe26ff !important;
    color: white !important;
    border-color: #5dba2eff !important;
  }
      
        /* Sidebar Styles */
       
        .sidebar-header { padding: 24px 20px; border-bottom: 1px solid #334155; }
        .sidebar-header h3 { margin: 0; font-size: 1.1rem; color: #f8fafc; }
        .member-list { flex: 1; overflow-y: auto; padding: 15px; }
        .member-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-radius: 8px; margin-bottom: 8px; background: #33415544; transition: background 0.2s; }
        .user-name { font-size: 0.9rem; color: #e2e8f0; }
        .admin-badge { color: #f59e0b; font-size: 0.7rem; font-weight: bold; border: 1px solid #f59e0b44; padding: 2px 6px; border-radius: 4px; }
        .kick-btn { color: #f87171; background: none; border: none; cursor: pointer; font-size: 0.75rem; transition: opacity 0.2s; }
        .kick-btn:hover { opacity: 0.7; }

        /* Main Chat Area */
        .chat-area { flex: 1; display: flex; flex-direction: column; position: relative; background: #0f172a; }
        .chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  height: 70px;
  flex-shrink: 0; /* Important: prevents header from collapsing */
}
        .header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
        .back-btn { background: none; border: none; color: #94a3b8; font-size: 1.6rem; cursor: pointer; padding: 4px; }
        .header-text h2 { margin: 0; font-size: 1.2rem; }
        .status-sub { margin: 0; font-size: 0.75rem; color: #10b981; }
        .exit-btn { background: #334155; border: 1px solid #475569; color: #f1f5f9; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }

        /* Feed / Messages */
        .feed { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column-reverse; gap: 16px; scroll-behavior: smooth; }
        .post-row { display: flex; width: 100%; margin-bottom: 4px;}
        .post-row.own-post { justify-content: flex-end; }
        
        
        .own-post .post-bubble { background: #3b82f6; color: white; border-bottom-right-radius: 2px; width: fit-content;}
        .other-post .post-bubble { background: #1e293b; color: #f1f5f9; border-bottom-left-radius: 2px; border: 1px solid #334155; width: fit-content; }
        
        .content-text { margin: 0; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
        .post-info { display: flex; justify-content: flex-end; margin-top: 4px; opacity: 0.7; }
        .time-stamp { font-size: 0.65rem; }

        /* Navigator / Breadcrumb Styles */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
}
  .file-name-label {
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 4px;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
  .chat-image, .chat-video {
    max-width: 100%;
    width: 280px; /* Force a standard bubble width */
    height: auto;
    border-radius: 10px;
    display: block;
    margin-top: 5px;
    object-fit: cover;
  }

  .preview-media {
    max-height: 120px; /* Small preview while typing */
    border-radius: 8px;
  }

.audio-wrapper {
  display: flex;
  flex-direction: column;
  background: rgba(0,0,0,0.2);
  padding: 8px;
  border-radius: 10px;
}

.nav-link {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s;
}

.nav-link:hover {
  color: #3b82f6;
  text-decoration: underline;
}

.nav-separator {
  color: #475569;
}

.nav-current {
  color: #f1f5f9;
  font-weight: 600;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
}

.exit-btn {
  display: flex;
  align-items: center;
  background: #ef44441a;
  border: 1px solid #ef444433;
  color: #f87171;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s;
}

.exit-btn:hover {
  background: #ef4444;
  color: white;
}
  .call-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: 20px;
  padding-right: 20px;
  border-right: 1px solid #334155;
}

.call-btn {
  background: #334155;
  border: 1px solid #475569;
  color: #94a3b8;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.call-btn:hover {
  transform: translateY(-2px);
  color: white;
  background: #3b82f6;
  border-color: #60a5fa;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.call-btn.video:hover {
  background: #10b981;
  border-color: #34d399;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}
  



  /* Enhanced Call Bubble */
.call-bubble {
  background: #1e293b !important;
  border: 1px solid #334155 !important;
  min-width: unset;
  max-width: 100%;
  border-left: 4px solid #3b82f6 !important; /* Visual indicator for active call */
}

.call-message-content {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}

.call-icon-circle {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  flex-shrink: 0;
}

.call-icon-circle.active {
  background: #3b82f622;
  color: #3b82f6;
}

.call-icon-circle.ended {
  background: #47556922;
  color: #94a3b8;
}

.call-details p {
  margin: 0 0 6px 0;
  font-size: 0.9rem;
  color: #e2e8f0;
}

.join-call-btn {
  background: #10b981;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}

.join-call-btn:hover {
  background: #059669;
  transform: scale(1.02);
}

.ended-badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
  letter-spacing: 0.5px;
  background: #334155;
  padding: 2px 8px;
  border-radius: 4px;
}

        /* Footer Input */
        .input-footer { padding: 20px 24px; background: #0f172a; border-top: 1px solid #334155; }
        .input-wrapper { background: #1e293b; border: 1px solid #334155; border-radius: 24px; display: flex; align-items: flex-end; padding: 6px 12px; transition: border-color 0.2s; }
        .input-wrapper:focus-within { border-color: #3b82f6; }
        .input-wrapper textarea { flex: 1; background: none; border: none; color: white; padding: 10px; font-size: 0.95rem; line-height: 1.4; outline: none; resize: none; max-height: 180px; }
        .send-btn { background: #3b82f6; color: white; border: none; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; margin-bottom: 2px; }
        .send-btn:disabled { background: #334155; color: #64748b; cursor: default; }
        .send-btn:hover:not(:disabled) { background: #2563eb; transform: scale(1.05); }
        .input-footer { 
  padding: 20px 24px; 
  background: #0f172a; 
  border-top: 1px solid #334155; 
  position: relative; 
}

.emoji-popover {
  position: absolute;
  bottom: 80px;
  left: 24px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.4);
  z-index: 100;
}

.emoji-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  padding: 5px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}

.emoji-btn:hover {
  background: #334155;
}

.icon-btn {
  background: none;
  border: none;
  color: #94a3b8;
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.icon-btn:hover {
  color: #3b82f6;
}

.input-wrapper { 
  background: #1e293b; 
  border: 1px solid #334155; 
  border-radius: 24px; 
  display: flex; 
  align-items: flex-end; 
  padding: 4px 12px; 
  transition: border-color 0.2s; 
}
  .chat-image {
  max-width: 100%;
  max-height: 300px;
  border-radius: 8px;
  cursor: pointer;
  display: block;
  margin-top: 5px;
  transition: opacity 0.2s;
}

.chat-image:hover {
  opacity: 0.9;
}

.file-link {
  display: flex;
  align-items: center;
  color: #3b82f6;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.9rem;
}

.own-post .file-link {
  color: #ffffff;
  background: rgba(0, 0, 0, 0.1);
}

.media-attachment {
  margin-bottom: 4px;
}
  .chat-video {
  max-width: 100%;
  border-radius: 8px;
  margin-top: 8px;
  background: black;
}

.chat-audio {
  width: 100%;
  max-width: 240px;
  margin-top: 8px;
  height: 40px;
}

/* Ensure bubbles expand for media */
.post-bubble {
  width: fit-content;      /* <--- KEY PROPERTY */
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 16px;
  position: relative;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Progress indicator for uploads */
.uploading-overlay {
  font-size: 0.7rem;
  color: #3b82f6;
  padding: 4px;
}
  .file-preview-container {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 10px;
  position: relative;
}
.preview-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-media {
  max-height: 100px;
  border-radius: 8px;
  width: auto;
}
.cancel-preview {
  position: absolute;
  top: 5px;
  right: 5px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  line-height: 1;
}
.preview-filename {
  font-size: 0.8rem;
  color: #94a3b8;
}

        .state-screen { height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: white; font-size: 1.1rem; }
      `}</style>
    </div>
  );
}