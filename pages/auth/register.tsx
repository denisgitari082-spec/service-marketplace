// register.tsx
import { useState } from "react";
import { supabase } from "../src/lib/supabaseClient";
import { useRouter } from "next/router";

export default function Register() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;

      const { error: insertError } = await supabase
        .from("profiles")
        .insert([{ id: data.user?.id, full_name: fullName, email, category }]);
      if (insertError) throw insertError;

      alert("Registration successful! Please check your email for verification.");
      router.push("/auth/login");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <h1 className="title">Register</h1>
        <form onSubmit={handleRegister} className="form">
          <input
            type="text"
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
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
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            <option value="">Select a category</option>
            <option value="Plumbing">Plumbing</option>
            <option value="Cleaning">Cleaning</option>
            <option value="Delivery">Delivery</option>
            <option value="Tutoring">Tutoring</option>
          </select>

          <button type="submit" disabled={loading}>
            {loading ? "Registering..." : "Register"}
          </button>

          {/* Links */}
          <p className="login-link">
            Already have an account?{" "}
            <span onClick={() => router.push("/auth/login")}>Login</span>
          </p>
          <p className="about-link">
            <span onClick={() => router.push("/about")}>About Us</span>
          </p>
        </form>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background: linear-gradient(135deg, #1e3a8a, #2563eb);
          padding: 20px;
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
          color: #1e3a8a;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        input,
        select {
          padding: 12px 15px;
          border-radius: 10px;
          border: 1px solid #ccc;
          font-size: 16px;
          outline: none;
          transition: border 0.2s, box-shadow 0.2s;
        }
        input:focus,
        select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 8px rgba(37, 99, 235, 0.4);
        }
        button {
          background: #2563eb;
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
          background: #1d4ed8;
          transform: translateY(-2px);
        }
        .login-link {
          margin-top: 20px;
          font-size: 14px;
          color: #1e3a8a;
        }
        .login-link span {
          color: #2563eb;
          font-weight: bold;
          cursor: pointer;
        }
        .login-link span:hover {
          text-decoration: underline;
        }
        .about-link {
          margin-top: 10px;
          font-size: 14px;
        }
        .about-link span {
          color: #2563eb;
          font-weight: bold;
          cursor: pointer;
        }
        .about-link span:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}


