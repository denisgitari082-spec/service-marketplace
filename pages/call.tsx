"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../src/lib/supabaseClient";
import Peer from "simple-peer";

interface PeerError extends Error {
  code?: string;
}

// Polyfill for Simple-Peer in Next.js environment
if (typeof window !== "undefined" && !window.process) {
  (window as any).global = window;
  (window as any).process = { 
    env: { DEBUG: undefined }, 
    browser: true, 
    version: '', 
    nextTick: (cb: any) => setTimeout(cb, 0) 
  };
}

export default function CallPage() {

    // Inside your CallPage function
const hasStarted = useRef(false); // Add this ref
  const router = useRouter();
  const { targetId, type, role } = router.query;
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callStatus, setCallStatus] = useState("Initializing...");
  const [isPoorConnection, setIsPoorConnection] = useState(false);
  const [targetName, setTargetName] = useState("User");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const channelRef = useRef<any>(null);
  const latestSignal = useRef<any>(null);
  const statsInterval = useRef<NodeJS.Timeout | null>(null);

  // --- FIREFOX STABILITY: Safe Media Assignment ---
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video || !remoteStream) return;

    if (video.srcObject !== remoteStream) {
      video.srcObject = remoteStream;
      video.onloadedmetadata = () => {
        video.play().catch(e => {
          if (e.name !== 'AbortError') console.warn("Playback prevented:", e);
        });
      };
    }
  }, [remoteStream, callStatus]);


  useEffect(() => {
    if (!router.isReady || !targetId || hasStarted.current) return;
  hasStarted.current = true; // Mark as started immediately
    if (!router.isReady || !targetId) return;

    const cleanup = () => {
      if (statsInterval.current) clearInterval(statsInterval.current);
      if (peerRef.current) peerRef.current.destroy();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };

    async function initCall() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const myId = user.id;

      // Fetch Target Profile
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", targetId).single();
      if (profile?.full_name) setTargetName(profile.full_name);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: type === "video",
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Initialize Peer with Trickle ICE (Faster for Firefox)
        const p = new Peer({
          initiator: role === "caller",
          trickle: true,
          stream: stream,
          config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
        });

        // Setup Supabase Channel with No-Ack for lower latency
        const channelIds = [myId, targetId as string].sort();
        const callChannel = supabase.channel(`call:${channelIds[0]}_${channelIds[1]}`, {
          config: { broadcast: { ack: false, self: false } }
        });
        channelRef.current = callChannel;

        p.on("signal", (data) => {
          latestSignal.current = data;
          callChannel.send({
            type: "broadcast",
            event: "signal",
            payload: { from: myId, signal: data, sentAt: Date.now() },
          });
        });

        p.on("stream", (remoteMediaStream) => {
          setRemoteStream(remoteMediaStream);
          setCallStatus("Connected");
          
          statsInterval.current = setInterval(async () => {
            // @ts-ignore
            const pc = p._pc as RTCPeerConnection;
            if (pc && pc.signalingState !== 'closed') {
              const stats = await pc.getStats();
              stats.forEach(r => {
                if (r.type === 'inbound-rtp' && r.packetsLost !== undefined && r.packetsReceived) {
                  const lossRate = r.packetsLost / (r.packetsLost + r.packetsReceived);
                  setIsPoorConnection(lossRate > 0.1);
                }
              });
            }
          }, 3000);
        });

        p.on("error", (err: Error) => {
          const peerErr = err as PeerError;
          if (peerErr.code === 'ERR_ICE_CONNECTION_FAILURE') setCallStatus("Reconnecting...");
        });

        callChannel
          .on("broadcast", { event: "signal" }, ({ payload }) => {
            // IGNORE GHOST SIGNALS (Older than 5 seconds)
            if (Date.now() - payload.sentAt > 5000) return;
            if (payload.from !== myId) p.signal(payload.signal);
          })
          .on("broadcast", { event: "ready" }, () => {
            if (role === "caller" && latestSignal.current) {
              callChannel.send({
                type: "broadcast",
                event: "signal",
                payload: { from: myId, signal: latestSignal.current, sentAt: Date.now() },
              });
            }
          })
          .on("broadcast", { event: "hangup" }, () => {
            setCallStatus("Call Ended");
            cleanup();
            setTimeout(() => window.close(), 1000);
          })
// Find this block in your subscribe status
.subscribe((status) => {
  if (status === "SUBSCRIBED") {
    setCallStatus(role === "caller" ? "Ringing..." : "Connecting...");
    
    // Only the receiver should send the "ready" ping to wake up the caller
    if (role === "receiver") {
      channelRef.current.send({ 
        type: "broadcast", 
        event: "ready", 
        payload: { from: myId } 
      });
    }
  }
});
        peerRef.current = p;
      } catch (err) {
        setCallStatus("Access Denied");
      }
    }

    initCall();
    return cleanup;
  }, [router.isReady, targetId]);

const endCall = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  
  // 1. Tell the Peer-to-Peer channel to hang up (for the Call window)
  channelRef.current?.send({ 
    type: "broadcast", 
    event: "hangup", 
    payload: { sentAt: Date.now() } 
  });

  // 2. Tell the recipient's INBOX to stop ringing (for the Messages window)
  const inboxChannel = supabase.channel(`inbox:${targetId}`);
  await inboxChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await inboxChannel.send({
        type: 'broadcast',
        event: 'call-cancelled', // This is the event your MessagesPage will listen for
        payload: { callerId: user?.id, type: type }
      });
      // Small delay to ensure message sends before window closes
      setTimeout(() => window.close(), 200);
    }
  });
};

  return (
    <div className="call-screen">
      {isPoorConnection && <div className="network-warning">⚠️ Poor connection detected</div>}
      
      <div className="video-grid">
        <div className="remote-container">
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className={(remoteStream && callStatus === "Connected") ? "active-video" : "hidden"}
          />
          
          {(!remoteStream || callStatus !== "Connected") && (
            <div className="placeholder">
              <div className="avatar-big">{targetName[0]?.toUpperCase()}</div>
              <h2>{targetName}</h2>
              <p className={`status-text ${callStatus === 'Reconnecting...' ? 'warning' : ''}`}>
                {callStatus}
              </p>
            </div>
          )}
        </div>

        <div className={`local-preview ${(type === 'voice' || isVideoOff) ? 'hidden' : ''}`}>
          <video ref={localVideoRef} autoPlay muted playsInline />
        </div>
      </div>

      <div className="controls-bar">
        <button onClick={() => {
          localStream?.getAudioTracks().forEach(t => t.enabled = !t.enabled);
          setIsMuted(!isMuted);
        }} className={`btn ${isMuted ? 'danger' : ''}`}>
          {isMuted ? "🔇" : "🎤"}
        </button>
        {type === "video" && (
          <button onClick={() => {
            localStream?.getVideoTracks().forEach(t => t.enabled = !t.enabled);
            setIsVideoOff(!isVideoOff);
          }} className={`btn ${isVideoOff ? 'danger' : ''}`}>
            {isVideoOff ? "❌📹" : "📹"}
          </button>
        )}
        <button onClick={endCall} className="btn hangup">📞</button>
      </div>

      <style jsx>{`
        .call-screen { height: 100vh; width: 100vw; background: #0b141a; display: flex; flex-direction: column; color: white; font-family: sans-serif; position: relative; overflow: hidden; }
        .network-warning { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); background: #eab308; padding: 8px 16px; border-radius: 20px; font-size: 14px; z-index: 100; font-weight: bold; color: #000; }
        .video-grid { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; background: #111b21; }
        .remote-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        .active-video { width: 100%; height: 100%; object-fit: cover; }
        .local-preview { position: absolute; bottom: 20px; right: 20px; width: 220px; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; border: 2px solid #334155; z-index: 10; background: #000; }
        .local-preview video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
        .hidden { display: none !important; }
        .placeholder { text-align: center; }
        .avatar-big { width: 150px; height: 150px; background: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 64px; margin: 0 auto 20px; }
        .status-text { color: #94a3b8; animation: pulse 2s infinite; }
        .controls-bar { height: 110px; background: #1e293b; display: flex; align-items: center; justify-content: center; gap: 25px; }
        .btn { width: 60px; height: 60px; border-radius: 50%; border: none; background: #334155; color: white; cursor: pointer; font-size: 24px; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .btn.danger { background: #ef4444; }
        .btn.hangup { background: #dc2626; transform: rotate(135deg); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}