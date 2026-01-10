// pages/auth/login.tsx
import { useState, useEffect } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect to register if no users exist
  useEffect(() => {
    const checkUsers = async () => {
      const { data: users, error } = await supabase.from("users").select("*");
      if (!error && users.length === 0) {
        router.replace("/auth/register");
      }
    };
    checkUsers();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/"); // redirect after login
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <h1 className="title">Login</h1>
        <form onSubmit={handleLogin} className="form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="register">
          Don’t have an account?{" "}
          <span onClick={() => router.push("/auth/register")}>Register</span>
        </p>

             
      <p className="about-link">
        <span onClick={() => router.push("/about")}>About Us</span>
      </p>
      </div>



      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 20px; /* space between card and About Us */
          padding: 20px;
          background: linear-gradient(135deg, #1f1f21ff, #151617ff);
        }
        .card {
          background: white;
          padding: 40px 30px;
          border-radius: 16px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          text-align: center;
          transition: transform 0.3s;
        }
        .card:hover {
          transform: translateY(-5px);
        }
        .title {
          font-size: 28px;
          font-weight: bold;
          margin-bottom: 25px;
          color: #121213ff;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        input {
          padding: 12px 15px;
          border-radius: 10px;
          border: 1px solid #121212ff;
          font-size: 16px;
          outline: none;
          transition: border 0.2s, box-shadow 0.2s;
        }
        input:focus {
          border-color: #161717ff;
          box-shadow: 0 0 8px rgba(21, 21, 21, 0.4);
        }
        button {
          background: #0c0c0cff;
          color: white;
          font-weight: bold;
          padding: 12px;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 16px;
          transition: background 0.2s, transform 0.2s;
        }
        button:hover {
          background: #0b0b0bff;
          transform: translateY(-2px);
        }
        .register {
          margin-top: 20px;
          font-size: 14px;
          color: #212020ff;
        }
        .register span {
          color: #141313ff;
          font-weight: bold;
          cursor: pointer;
        }
        .register span:hover {
          text-decoration: underline;
        }
        .about-link {
          font-size: 16px;
          font-weight: bold;
          color: #0d0d0eff;
          cursor: pointer;
        }
        .about-link span:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}


