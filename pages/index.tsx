"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../src/lib/supabaseClient";

type Service = {
  id: string;
  title: string;
  description: string;
  category: string;
  provider: string;
  contact: string;
  location: string;
  owner_id: string;
};

type Reaction = {
  service_id: string;
  user_id: string;
  reaction: "like" | "dislike";
};

export default function Services() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [reactions, setReactions] = useState<{ [key: string]: Reaction }>({});
  const [reactionCounts, setReactionCounts] = useState<{ [key: string]: { like: number; dislike: number } }>({});
  const [seeMore, setSeeMore] = useState<{ [key: string]: boolean }>({});

  // ---------------- Auth Guard ----------------
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        router.push("/auth/login"); // redirect if not logged in
        return;
      }
      // Optional: enforce email verification
      if (!user.email_confirmed_at) {
        router.push("/auth/verify-email");
        return;
      }
      setCurrentUser(user.id);
      fetchServices();
    };
    checkAuth();
  }, []);

  // ---------------- Data fetching ----------------
  const fetchServices = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("services").select("*");
    if (error) alert(error.message);
    else setServices(data);
    setLoading(false);
    fetchReactionCounts();
  };

  const fetchReactionCounts = async () => {
    const { data, error } = await supabase.from("service_reactions").select("*");
    if (!error && data) {
      const counts: { [key: string]: { like: number; dislike: number } } = {};
      data.forEach((r: Reaction) => {
        if (!counts[r.service_id]) counts[r.service_id] = { like: 0, dislike: 0 };
        counts[r.service_id][r.reaction]++;

      });
      setReactionCounts(counts);

      if (currentUser) {
        const userReactions: { [key: string]: Reaction } = {};
        data.forEach((r: Reaction) => {
          if (r.user_id === currentUser) userReactions[r.service_id] = r;
        });
        setReactions(userReactions);
      }
    }
  };

  // ---------------- Actions ----------------
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service?")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) alert(error.message);
    fetchServices();
  };

  const handleReaction = async (serviceId: string, reaction: "like" | "dislike") => {
    if (!currentUser) return alert("Login to react.");
    if (reactions[serviceId]) return alert("You already reacted!");

    const { error } = await supabase.from("service_reactions").insert([
      { service_id: serviceId, user_id: currentUser, reaction },
    ]);
    if (error) return alert(error.message);

    setReactions({ ...reactions, [serviceId]: { service_id: serviceId, user_id: currentUser, reaction } });
    setReactionCounts({
      ...reactionCounts,
      [serviceId]: {
        like: (reactionCounts[serviceId]?.like || 0) + (reaction === "like" ? 1 : 0),
        dislike: (reactionCounts[serviceId]?.dislike || 0) + (reaction === "dislike" ? 1 : 0),
      },
    });
  };

  // ---------------- Filtering & grouping ----------------
  const filteredServices = services.filter((service) => {
    const term = search.toLowerCase();
    return (
      service.title?.toLowerCase().includes(term) ||
      service.category?.toLowerCase().includes(term) ||
      service.provider?.toLowerCase().includes(term) ||
      service.location?.toLowerCase().includes(term)
    );
  });

  const categories = [
    "cleaning",
    "farming",
    "plumbing",
    "electrical",
    "carpentry",
    "tutoring",
    "beauty",
    "delivery",
    "transport",
    "it",
    "construction",
    "graphic design",
  ];

  const groupedServices: { [key: string]: Service[] } = {};
  categories.forEach((cat) => {
    groupedServices[cat] = filteredServices.filter((s) => s.category.toLowerCase() === cat);
  });
  groupedServices["others"] = filteredServices.filter((s) => !categories.includes(s.category.toLowerCase()));

  // ---------------- Render ----------------
  return (
    <div className="container">
      <h1 className="title">Service Marketplace</h1>

      <Link href="/create-service" className="add-btn">
        + Add Service
      </Link>

      <input
        type="text"
        placeholder="Search by title, category, provider, or location..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="search-box"
      />

      {loading ? (
        <p className="loading">Loading services...</p>
      ) : filteredServices.length === 0 ? (
        <p className="loading">No matching services found.</p>
      ) : (
        <>
          {Object.entries(groupedServices).map(([category, services]) =>
            services.length > 0 ? (
              <div key={category} className="category-group">
                <h2 className="category-title">
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </h2>
                <div className="grid">
                  {services.slice(0, seeMore[category] ? undefined : 4).map((service) => (
                    <div key={service.id} className="service-card">
                      <h3 className="card-title">{service.title}</h3>
                      <p className="category">
                        <strong>Category:</strong> {service.category}
                      </p>
                      <p className="description">{service.description}</p>
                      <p className="provider">
                        <strong>Provider:</strong> {service.provider}
                      </p>
                      <p className="location">
                        <strong>Location:</strong> {service.location}
                      </p>

                      <div className="button-group">
                        <a href={`https://wa.me/${service.contact}`} target="_blank" rel="noopener noreferrer" className="whatsapp">
                          💬 WhatsApp
                        </a>
                        <a href={`tel:${service.contact}`} className="call">
                          📞 Call
                        </a>
                      </div>

                      <div className="reaction-group">
                        <button
                          className="like"
                          disabled={!!reactions[service.id]}
                          onClick={() => handleReaction(service.id, "like")}
                        >
                          👍 {reactionCounts[service.id]?.like || 0}
                        </button>
                        <button
                          className="dislike"
                          disabled={!!reactions[service.id]}
                          onClick={() => handleReaction(service.id, "dislike")}
                        >
                          👎 {reactionCounts[service.id]?.dislike || 0}
                        </button>
                      </div>

                      {service.owner_id === currentUser && (
                        <div className="owner-actions">
                          <Link href={`/edit-service/${service.id}`} className="edit">
                            ✏️ Edit
                          </Link>
                          <button onClick={() => handleDelete(service.id)} className="delete">
                            🗑️ Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {services.length > 4 && (
                  <button
                    className="see-more"
                    onClick={() => setSeeMore({ ...seeMore, [category]: !seeMore[category] })}
                  >
                    {seeMore[category] ? "See Less" : "See More"}
                  </button>
                )}
              </div>
            ) : null
          )}
        </>
      )}

      
      <style jsx>{`
        .container {
          min-height: 100vh;
          background: #0d1b2a;
          padding: 20px;
          color: white;
        }

        .title {
          text-align: center;
          font-size: 32px;
          margin-bottom: 20px;
          font-weight: bold;
        }

        .add-btn {
          display: block;
          width: fit-content;
          margin: 0 auto 15px auto;
          padding: 10px 20px;
          background: #1d4ed8;
          color: white;
          border-radius: 8px;
          font-weight: bold;
          text-decoration: none;
          transition: background 0.2s;
        }

        .add-btn:hover {
          background: #1e40af;
        }

        .search-box {
          display: block;
          width: 100%;
          max-width: 400px;
          margin: 20px auto 40px auto;
          padding: 10px 15px;
          border-radius: 8px;
          border: none;
          font-size: 1rem;
        }

        .loading {
          text-align: center;
          margin-top: 40px;
          color: #ccc;
        }

        .category-group {
          margin-bottom: 40px;
          position: relative;
        }

        .category-title {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 15px;
          color: #e0e7ff;
        }

        .grid {
          display: grid;
          gap: 20px;
          grid-template-columns: repeat(2, 1fr);
        }

        @media (min-width: 640px) {
          .grid {
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          }
        }

        .service-card {
          background: #1b263b;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
          transition: transform 0.25s, box-shadow 0.25s;
        }

        .service-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
        }

        .card-title {
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 8px;
          color: #e0e7ff;
        }

        .category,
        .provider,
        .location {
          color: #cbd5e1;
          margin: 5px 0;
        }

        .description {
          margin: 10px 0 15px 0;
          line-height: 1.5;
          color: #f1f5f9;
        }

        .button-group,
        .reaction-group {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }

        .whatsapp,
        .call,
        .like,
        .dislike {
          flex: 1;
          padding: 10px;
          text-align: center;
          border-radius: 8px;
          font-weight: bold;
          color: white;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .whatsapp {
          background: #128c7e;
        }

        .call {
          background: #2563eb;
        }

        .like {
          background: #22c55e;
        }

        .dislike {
          background: #ef4444;
        }

        .whatsapp:hover,
        .call:hover,
        .like:hover,
        .dislike:hover {
          opacity: 0.8;
        }

        .owner-actions {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }

        .edit,
        .delete {
          flex: 1;
          padding: 8px;
          text-align: center;
          border-radius: 8px;
          font-weight: bold;
          border: none;
          cursor: pointer;
          color: white;
          transition: opacity 0.2s;
        }

        .edit {
          background: #f59e0b;
        }

        .delete {
          background: #dc2626;
        }

        .edit:hover,
        .delete:hover {
          opacity: 0.8;
        }

        .see-more {
          margin: 10px auto 0 auto;
          display: block;
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          font-weight: bold;
          cursor: pointer;
          background: #1d4ed8;
          color: white;
          position: sticky;
          top: 10px; /* floats when scrolling */
          z-index: 10;
        }
      `}</style>
    </div>
  );
}