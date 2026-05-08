"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export default function GranolaConnectModal({ open, onClose, onConnected }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const key = apiKey.trim();
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/granola/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect");
        return;
      }
      console.log(`[granola] ✓ connected as ${data.ownerName} (${data.ownerEmail}) — ${data.noteCount} notes visible`);
      setApiKey("");
      onConnected();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--hair)",
          borderRadius: 12,
          padding: 24,
          width: "min(440px, 92vw)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Connect Granola</h2>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: 0, fontSize: 18, cursor: "pointer", color: "var(--ink-2)" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 0 }}>
          Paste your Granola API key. We'll validate it against{" "}
          <code style={{ fontSize: 12 }}>public-api.granola.ai</code> and pull your meeting notes on every sync.
        </p>

        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) submit();
          }}
          placeholder="grn_…"
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--hair)",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: '"Geist Mono", monospace',
            background: "var(--bg)",
            color: "var(--ink)",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <div style={{ marginTop: 10, padding: 10, background: "#fee", border: "1px solid #fcc", borderRadius: 6, color: "#900", fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ padding: "8px 14px", background: "transparent", color: "var(--ink-2)", border: 0, borderRadius: 6, fontSize: 13, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !apiKey.trim()}
            style={{
              padding: "8px 14px",
              background: "#000",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              fontSize: 13,
              cursor: busy || !apiKey.trim() ? "not-allowed" : "pointer",
              opacity: busy || !apiKey.trim() ? 0.5 : 1,
            }}
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: 11, color: "var(--ink-2)" }}>
          Don't have a key? Visit your Granola account settings → API.
        </div>
      </div>
    </div>
  );
}
