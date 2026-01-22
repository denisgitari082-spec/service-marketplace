import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

const CameraPage = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [filter, setFilter] = useState('none');
  const [brightness, setBrightness] = useState(100);
  const [isCaptured, setIsCaptured] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera access denied", err);
      }
    };
    startCamera();
  }, []);

  const captureImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (ctx) {
        ctx.filter = `${filter} brightness(${brightness}%)`;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setIsCaptured(true);
      }
    }
  };

  const downloadImage = () => {
    const link = document.createElement('a');
    link.download = 'custom-photo.png';
    link.href = canvasRef.current?.toDataURL() || '';
    link.click();
  };

  return (
    <div className="camera-container">
      <Head><title>Customize Image</title></Head>

      <nav className="app-bar">
        <button  onClick={() => window.location.href = '/videos'} className="back-btn">← </button>
        <h1 className="title">Crawl</h1>
        {isCaptured && <button onClick={downloadImage} className="save-link">Save</button>}
      </nav>

      <main className="studio-content">
        <div className="preview-window">
          {/* Main View */}
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            style={{ filter: `${filter} brightness(${brightness}%)` }}
            className={isCaptured ? 'hidden' : 'full-view'}
          />
          <canvas ref={canvasRef} className={isCaptured ? 'full-view' : 'hidden'} />

          {/* OVERLAY: Adjustments (Top/Side) */}
          {!isCaptured && (
            <div className="adjustment-overlay">
              <div className="filter-scroll">
                <button onClick={() => setFilter('none')} className={filter === 'none' ? 'active' : ''}>Normal</button>
                <button onClick={() => setFilter('grayscale(100%)')} className={filter.includes('gray') ? 'active' : ''}>B&W</button>
                <button onClick={() => setFilter('sepia(100%)')} className={filter.includes('sepia') ? 'active' : ''}>Vintage</button>
                <button onClick={() => setFilter('hue-rotate(90deg)')}>Cool</button>
              </div>
              
              <div className="brightness-wrap">
                <input 
                  type="range" min="50" max="200" 
                  value={brightness} 
                  onChange={(e) => setBrightness(parseInt(e.target.value))} 
                />
              </div>
            </div>
          )}

          {/* OVERLAY: Capture Button (Bottom Middle) */}
          <div className="action-overlay">
            {!isCaptured ? (
              <button onClick={captureImage} className="round-capture-btn"></button>
            ) : (
              <button onClick={() => setIsCaptured(false)} className="retake-btn">Retake</button>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .camera-container { height: 100vh; background: white; color: black; display: flex; flex-direction: column; overflow: hidden; }
        .app-bar { display: flex; justify-content: space-between; align-items: center; padding: 0px; height: 40px; background: white; z-index: 10; }
        .title { font-size: 1.1rem; font-weight: 600; }
        .back-btn, .save-link { background: none; border: none; color: black; font-size: 1rem; cursor: pointer; }

        .studio-content { flex: 1; position: relative; display: flex; justify-content: center; align-items: center; }

        .preview-window { 
          position: relative;
          width: 100%; height: 100%;
          max-width: 500px; max-height: 800px;
          background: #fefefe;
          display: flex; justify-content: center; align-items: center;
        }
        
        .full-view { width: 100%; height: 100%; object-fit: cover; }
        .hidden { display: none; }

        /* ADJUSTMENT OVERLAY (Inside the image) */
        .adjustment-overlay {
          position: absolute;
          top: 20px;
          left: 10px; right: 10px;
          display: flex; flex-direction: column; gap: 15px;
          pointer-events: none;
        }
        .filter-scroll { display: flex; gap: 10px; overflow-x: auto; pointer-events: auto; padding-bottom: 5px; }
        .filter-scroll button { 
          background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.3); 
          color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; cursor: pointer; white-space: nowrap;
        }
        .filter-scroll button.active { background: white; color: black; border-color: white; }

        .brightness-wrap { pointer-events: auto; width: 150px; }
        input[type="range"] { width: 100%; accent-color: white; }

        /* CAPTURE OVERLAY (Bottom Middle) */
        .action-overlay {
          position: absolute;
          bottom: 40px;
          left: 0; right: 0;
          display: flex; justify-content: center;
          pointer-events: none;
        }

        .round-capture-btn {
          width: 70px; height: 70px;
          background: white;
          border: 5px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          cursor: pointer;
          pointer-events: auto;
          transition: transform 0.1s;
        }
        .round-capture-btn:active { transform: scale(0.9); }

        .retake-btn {
          background: rgba(255,255,255,0.2); border: 1px solid white;
          color: white; padding: 10px 25px; border-radius: 25px;
          pointer-events: auto; cursor: pointer; backdrop-filter: blur(5px);
        }
      `}</style>
    </div>
  );
};

export default CameraPage;