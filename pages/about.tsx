"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function AboutPage() {
  const router = useRouter();
   const searchParams = useSearchParams();
   const from = searchParams?.get("from");

    const handleBack = () => {
    if (from === "login") {
      router.push("/auth/login");
    } else if (from === "register") {
      router.push("/auth/register");
    } else {
      router.back(); // safe fallback
    }}

  return (
    <div className="about-container">

      {/* Mobile App Bar */}
      <div className="app-bar">
        <button className="appbar-btn" onClick={handleBack}>
          ←
        </button>
        <h1 className="appbar-title">About Us</h1>
        <div style={{ width: 36 }} /> {/* spacer */}
      </div>

      {/* Content */}
      <div className="content">
        <h1 className="page-title">About Us</h1>

        <p>
          Welcome to our platform! Our mission is to help people connect and find
          the services they need quickly and easily. Whether you’re looking to
          hire someone for a task or offer your own services, our website makes
          it simple and secure.
        </p>

        <p>
          Users can list their services, browse offerings from others, and manage
          requests all in one place. We aim to build a community where service
          providers and seekers can meet, collaborate, and grow together.
        </p>

        <p>
          Our platform is designed to be user-friendly, reliable, and accessible
          to everyone. Whether you’re a professional looking to reach more clients
          or someone seeking trustworthy help, we’re here to make the process
          smooth and hassle-free.
        </p>

        <p>
          Thank you for visiting our website. We’re excited to help you get started
          and make your service connections easier than ever!
        </p>
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
          min-width: 0;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          overflow-x: hidden;
        }

        .about-container {
          min-height: 100vh;
          background: #0f172a;
          color: white;
        }

        /* APP BAR */
        .app-bar {
          display: none;
          position: sticky;
          top: 0;
          z-index: 50;

          height: calc(56px + env(safe-area-inset-top));
          padding: env(safe-area-inset-top) 12px 0;

          background: #0f172a;
          border-bottom: 1px solid #1e293b;

          align-items: center;
          justify-content: space-between;
        }

        .appbar-btn {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: #f5f6f7ff;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
        }

        .appbar-title {
          font-size: 16px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* CONTENT */
        .content {
          max-width: 720px;
          margin: 0 auto;
          padding: 32px 20px;
        }

        .page-title {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 24px;
          text-align: center;
        }

        p {
          font-size: 1.05rem;
          line-height: 1.7;
          margin-bottom: 16px;
          color: #e5e7eb;
        }

        /* MOBILE */
        @media (max-width: 768px) {
          .app-bar {
            display: flex;
          }

          .content {
            padding-top: calc(56px + env(safe-area-inset-top) + 16px);
            padding-left: 16px;
            padding-right: 16px;
          }

          .page-title {
            display: none; /* avoid double title */
          }
        }
      `}</style>
    </div>
  );
}
