"use client";

import { useState, useEffect, useRef } from "react";

interface UploadedFile {
  name: string;
  size: number;
  mtime: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  target?: "uploads" | "granola";
  title?: string;
  description?: string;
}

export default function CodeUploadModal({
  open,
  onClose,
  onSaved,
  target = "uploads",
  title = "Add Claude / code context",
  description,
}: Props) {
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [existing, setExisting] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const apiUrl = `/api/uploads?target=${encodeURIComponent(target)}`;
  const folderLabel = `context/${target}/`;
  const desc =
    description ||
    `Paste markdown or upload .md files. Saved to ${folderLabel} and pulled into the next sync.`;

  useEffect(() => {
    if (open) refreshList();
  }, [open]);

  const refreshList = async () => {
    try {
      const res = await fetch(apiUrl);
      const data = await res.json();
      setExisting(data.files || []);
    } catch {
      setExisting([]);
    }
  };

  const submitPaste = async () => {
    if (!pasteText.trim()) return;
    setBusy(true);
    try {
      const name = pasteName.trim() || `paste_${Date.now()}`;
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: [{ name, content: pasteText }] }),
      });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      console.log(`[upload-${target}] saved paste:`, name);
      setPasteText("");
      setPasteName("");
      await refreshList();
      onSaved();
    } catch (e) {
      console.error(`[upload-${target}]`, e);
      alert("Save failed. Check console.");
    } finally {
      setBusy(false);
    }
  };

  const submitFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      const files = await Promise.all(
        Array.from(fileList).map(async (f) => ({
          name: f.name,
          content: await f.text(),
        }))
      );
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const data = await res.json();
      console.log(`[upload-${target}] saved files:`, data.written);
      if (fileInput.current) fileInput.current.value = "";
      await refreshList();
      onSaved();
    } catch (e) {
      console.error(`[upload-${target}]`, e);
      alert("Upload failed. Check console.");
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
          width: "min(560px, 92vw)",
          maxHeight: "85vh",
          overflow: "auto",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: 0, fontSize: 18, cursor: "pointer", color: "var(--ink-2)" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 0 }}>{desc}</p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "var(--ink-2)", display: "block", marginBottom: 4 }}>Filename (optional)</label>
          <input
            type="text"
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            placeholder={target === "granola" ? "e.g. q3-planning-meeting.md" : "e.g. session-notes.md"}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--hair)",
              borderRadius: 6,
              fontSize: 13,
              fontFamily: "inherit",
              background: "var(--bg)",
              color: "var(--ink)",
              boxSizing: "border-box",
            }}
          />
        </div>

        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={target === "granola" ? "Paste a Granola meeting export here…" : "Paste markdown content here…"}
          style={{
            width: "100%",
            minHeight: 180,
            padding: 10,
            border: "1px solid var(--hair)",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: '"Geist Mono", monospace',
            background: "var(--bg)",
            color: "var(--ink)",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button
            onClick={submitPaste}
            disabled={busy || !pasteText.trim()}
            style={{
              padding: "8px 14px",
              background: "#000",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              fontSize: 13,
              cursor: busy || !pasteText.trim() ? "not-allowed" : "pointer",
              opacity: busy || !pasteText.trim() ? 0.5 : 1,
            }}
          >
            {busy ? "Saving…" : "Save paste"}
          </button>

          <span style={{ color: "var(--ink-2)", fontSize: 12 }}>or</span>

          <label
            style={{
              padding: "8px 14px",
              background: "transparent",
              color: "var(--ink)",
              border: "1px solid var(--hair)",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Upload .md files
            <input
              ref={fileInput}
              type="file"
              accept=".md,.txt,.json,.jsonl"
              multiple
              style={{ display: "none" }}
              onChange={(e) => submitFiles(e.target.files)}
            />
          </label>
        </div>

        {existing.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--hair)" }}>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 8 }}>
              {existing.length} file{existing.length === 1 ? "" : "s"} in {folderLabel}
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, fontFamily: '"Geist Mono", monospace' }}>
              {existing.map((f) => (
                <li key={f.name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "var(--ink-2)" }}>
                  <span style={{ color: "var(--ink)" }}>{f.name}</span>
                  <span>{Math.round(f.size / 1024)}kb</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
