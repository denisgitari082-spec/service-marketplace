"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../src/lib/supabaseClient";

export default function AddEditService() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serviceId = searchParams?.get("id") ?? null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [provider, setProvider] = useState("");
  const [contact, setContact] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [warning, setWarning] = useState("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // ---------------- Auth Guard ----------------
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        router.push("/auth/login");
        return;
      }
      if (!user.email_confirmed_at) {
        router.push("/auth/verify-email");
        return;
      }
      setCurrentUser(user.id);
      if (serviceId) fetchService();
    };
    checkAuth();
  }, [serviceId]);

  // ---------------- Fetch service for edit ----------------
  const fetchService = async () => {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("id", serviceId)
      .single();
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setTitle(data.title);
    setDescription(data.description);
    setCategory(data.category);
    setProvider(data.provider);
    setContact(data.contact);
    setLocation(data.location);
  };

  // ---------------- Save / Update ----------------
  const handleSave = async (e: any) => {
    e.preventDefault();
    setErrorMsg("");
    setWarning("");

    if (!contact.startsWith("254")) {
      setWarning("⚠️ Please include the country code (e.g. 254712345678).");
      return;
    }

    setLoading(true);

    // Trim inputs to remove extra spaces
    const trimmedCategory = category.trim();
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const trimmedProvider = provider.trim();
    const trimmedContact = contact.trim();
    const trimmedLocation = location.trim();

    if (serviceId) {
      const { error } = await supabase
        .from("services")
        .update({
          title: trimmedTitle,
          description: trimmedDescription,
          category: trimmedCategory,
          provider: trimmedProvider,
          contact: trimmedContact,
          location: trimmedLocation,
        })
        .eq("id", serviceId);
      setLoading(false);
      if (error) return setErrorMsg(error.message);
    } else {
      const { error } = await supabase
        .from("services")
        .insert([
          {
            title: trimmedTitle,
            description: trimmedDescription,
            category: trimmedCategory,
            provider: trimmedProvider,
            contact: trimmedContact,
            location: trimmedLocation,
            owner_id: currentUser,
          },
        ]);
      setLoading(false);
      if (error) return setErrorMsg(error.message);
    }

    router.push("/");
  };
 

  // ---------------- Delete ----------------
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this service?")) return;
    setLoading(true);
    const { error } = await supabase.from("services").delete().eq("id", serviceId);
    setLoading(false);
    if (error) return setErrorMsg(error.message);
    router.push("/");
  };

  return (
    <div className="page">
      <div className="card">
        <h2 className="title">{serviceId ? "Edit Service" : "Add a Service"}</h2>

        {errorMsg && <p className="error">{errorMsg}</p>}
        {warning && <p className="warning">{warning}</p>}

        <form className="form" onSubmit={handleSave}>
          <input
            type="text"
            placeholder="Service Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="input"
          />
          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="textarea"
            rows={4}
          />
          <input
            type="text"
            placeholder="Category (e.g. Cleaning)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="input"
          />
          <input
            type="text"
            placeholder="Provider Name"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            required
            className="input"
          />
          <input
            type="tel"
            placeholder="Phone Number (e.g. 254712345678)"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            required
            className="input"
          />
          <input
            type="text"
            placeholder="Job Location (e.g. Nairobi)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
            className="input"
          />

          <button type="submit" disabled={loading} className="button">
            {loading ? "Saving..." : serviceId ? "Update Service" : "Add Service"}
          </button>

          {serviceId && (
            <button type="button" onClick={handleDelete} className="delete">
              🗑️ Delete Service
            </button>
          )}
        </form>
      </div>

      <style jsx>{`
        .page {
          background: #1e3a8a;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }
        .card {
          background: white;
          padding: 30px;
          border-radius: 16px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }
        .title {
          text-align: center;
          font-size: 26px;
          font-weight: bold;
          margin-bottom: 20px;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        .input,
        .textarea {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #ccc;
          font-size: 16px;
        }
        .button {
          background: #2563eb;
          color: white;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
        }
        .button:hover {
          background: #1d4ed8;
        }
        .delete {
          background: #dc2626;
          color: white;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          margin-top: 10px;
        }
        .delete:hover {
          opacity: 0.85;
        }
        .error {
          background: #dc2626;
          color: white;
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 10px;
          text-align: center;
        }
        .warning {
          background: #facc15;
          color: #111;
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 10px;
          text-align: center;
        }
      `}</style>
    </div>
  );
  }

