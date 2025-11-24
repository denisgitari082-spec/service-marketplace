// pages/auth/register.tsx
import { useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter } from "next/router";

export default function Register() {
  const router = useRouter();

  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1️⃣ Create user in Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // 2️⃣ Insert additional user info into profiles table
      const { error: insertError } = await supabase
        .from("profiles")
        .insert([
          {
            id: data.user?.id,
            full_name: fullName,
            email: email,
            category: category,
          },
        ]);

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
    <div style={{ maxWidth: 400, margin: "50px auto" }}>
      <h1>Register</h1>
      <form onSubmit={handleRegister}>
        <div>
          <label>Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            style={{ width: "100%" }}
          >
            <option value="">Select a category</option>
            <option value="Plumbing">Plumbing</option>
            <option value="Cleaning">Cleaning</option>
            <option value="Delivery">Delivery</option>
            <option value="Tutoring">Tutoring</option>
          </select>
        </div>

        <button type="submit" disabled={loading} style={{ marginTop: 10 }}>
          {loading ? "Registering..." : "Register"}
        </button>
      </form>
    </div>
  );
}
