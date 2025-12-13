import React, { useState } from "react";

interface SavedItem {
  id: string;
  type: 'scan' | 'alert' | 'watchlist';
  name: string;
  data: any;
}

export default function CustomizationPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<'scan' | 'alert' | 'watchlist'>('scan');
  const [saving, setSaving] = useState(false);

  // Placeholder save handler
  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setItems([
        ...items,
        { id: Date.now().toString(), type, name, data: {} }
      ]);
      setName("");
      setSaving(false);
    }, 500);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0F172A", color: "#fff", padding: "2rem" }}>
      <h1 style={{ fontSize: "2.2rem", fontWeight: 700, marginBottom: "1.5rem", color: "#10B981" }}>
        User Customization
      </h1>
      <p style={{ color: "#94A3B8", marginBottom: "2rem" }}>
        Save your favorite scans, alerts, and watchlists. (Demo only, not persistent yet)
      </p>
      <div style={{ marginBottom: 24 }}>
        <select value={type} onChange={e => setType(e.target.value as any)} style={{ padding: 8, borderRadius: 8, marginRight: 8 }}>
          <option value="scan">Scan</option>
          <option value="alert">Alert</option>
          <option value="watchlist">Watchlist</option>
        </select>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={`Name your ${type}`}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #3B82F6", marginRight: 8 }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{ padding: 8, borderRadius: 8, background: "#3B82F6", color: "#fff", border: "none", fontWeight: 600 }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <div style={{ marginTop: 32 }}>
        <h2 style={{ color: "#10B981", marginBottom: 12 }}>Saved Items</h2>
        {items.length === 0 ? (
          <div style={{ color: "#94A3B8" }}>No saved items yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {items.map(item => (
              <li key={item.id} style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 12 }}>
                <strong style={{ color: "#3B82F6" }}>{item.type.toUpperCase()}</strong>: {item.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
