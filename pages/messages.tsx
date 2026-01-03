"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../src/lib/supabaseClient";

console.log("🟢 HEARTBEAT: File has been loaded by the browser");

export default function MessagesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);

  // 1. COMPONENT MOUNT CHECK
  useEffect(() => {
    console.log("🔵 COMPONENT MOUNTED: useEffect is running");

    const init = async () => {
      try {
        console.log("🟡 AUTH CHECK: Requesting user from Supabase...");
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
          console.error("🔴 AUTH ERROR:", authError.message);
          setLoading(false);
          return;
        }

        if (!user) {
          console.warn("🟠 NO USER: You are logged out. Redirecting/Stopping.");
          setLoading(false);
          return;
        }

        console.log("✅ USER FOUND:", user.email);
        setCurrentUser(user);

        // Fetch Profiles
        console.log("🟡 DATA FETCH: Getting profiles...");
        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select("*")
          .neq("id", user.id);

        if (fetchError) {
          console.error("🔴 DB ERROR:", fetchError.message);
        } else {
          console.log(`✅ SUCCESS: Found ${data?.length} users`);
          setUsers(data || []);
        }

      } catch (err) {
        console.error("🔴 CRITICAL CRASH:", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  if (loading) return <div style={{padding: '20px', color: 'white'}}>System Initializing... Check Console (F12)</div>;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#020617', color: 'white' }}>
      {/* SIDEBAR */}
      <div style={{ width: '300px', borderRight: '1px solid #1e293b', padding: '20px' }}>
        <h3>Messages ({users.length})</h3>
        <div style={{ marginTop: '20px' }}>
          {users.length === 0 && <p style={{color: '#64748b'}}>No users found in database.</p>}
          {users.map(u => (
            <div 
              key={u.id} 
              onClick={() => setSelectedTarget(u)}
              style={{ 
                padding: '10px', 
                cursor: 'pointer', 
                background: selectedTarget?.id === u.id ? '#1e293b' : 'transparent',
                borderRadius: '8px'
              }}
            >
              {u.full_name || u.email}
            </div>
          ))}
        </div>
      </div>

      {/* CHAT AREA */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {selectedTarget ? (
          <div>Chatting with {selectedTarget.full_name}</div>
        ) : (
          <div style={{ color: '#475569' }}>Select a user to test connectivity</div>
        )}
      </div>
    </div>
  );
}
