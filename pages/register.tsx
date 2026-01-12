// register.tsx
import { useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";
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

      * {
  box-sizing: border-box;
  min-width: 0;
}

html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
}

.page {
  height: 100dvh; /* mobile-safe viewport */
  width: 100vw;

  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  gap: 20px;
  padding: 0; /* 🔥 removes outer margin feel */

  background: linear-gradient(135deg, #1f1f21ff, #151617ff);
}


.card {
  background: white;
  padding: 40px 30px;
  border-radius: 16px;

  width: 100%;
  max-width: 400px;

  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  text-align: center;
}
@media (max-width: 480px) {
  .card {
    border-radius: 0;
    max-width: 100%;
    height: 100%;
    justify-content: center;
    display: flex;
    flex-direction: column;
  }
}

        .card:hover {
          transform: translateY(-5px);
        }
        .title {
          font-size: 28px;
          font-weight: bold;
          margin-bottom: 25px;
          color: #090a0aff;
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
          border: 1px solid #100f0fff;
          font-size: 16px;
          outline: none;
          transition: border 0.2s, box-shadow 0.2s;
        }
        input:focus,
        select:focus {
          border-color: #131414ff;
          box-shadow: 0 0 8px rgba(16, 17, 19, 0.4);
        }
        button {
          background: #181819ff;
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
          background: #1d1d1fff;
          transform: translateY(-2px);
        }
        .login-link {
          margin-top: 20px;
          font-size: 14px;
          color: #101011ff;
        }
        .login-link span {
          color: #0a0a0bff;
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
          color: #121213ff;
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



