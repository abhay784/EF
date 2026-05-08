"use client";

import { useState, useEffect } from "react";
import ChatPanel from "@/components/ChatPanel";
import CodeUploadModal from "@/components/CodeUploadModal";
import GranolaConnectModal from "@/components/GranolaConnectModal";
import { Calendar, Code, Slack } from "@/components/Icons";

interface TopBarProps {
  isSyncing: boolean;
  hasSynced: boolean;
  onSync: () => void;
  onOpenCodeUpload: () => void;
  uploadCount: number;
  granolaConnected: boolean;
  granolaOwner: string | null;
  onGranolaConnectClick: () => void;
  onGranolaDisconnect: () => void;
  slackConnected: boolean;
  slackTeamName: string | null;
  onSlackDisconnect: () => void;
}

function TopBar({
  isSyncing,
  hasSynced,
  onSync,
  onOpenCodeUpload,
  uploadCount,
  granolaConnected,
  granolaOwner,
  onGranolaConnectClick,
  onGranolaDisconnect,
  slackConnected,
  slackTeamName,
  onSlackDisconnect,
}: TopBarProps) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">R</div>
        <span>ReCall</span>
        <span
          style={{
            fontFamily: '"Geist Mono",monospace',
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: ".04em",
            textTransform: "uppercase",
            marginLeft: 6,
          }}
        >
          for startup
        </span>
      </div>

      <div className="top-right">
        <div className="sync">
          <span className={"dot" + (isSyncing ? " syncing" : " pulse")} />
          <span>{isSyncing ? "Syncing…" : hasSynced ? "Synced" : "Not synced"}</span>
        </div>
        <div className="source-pills">
          <button
            type="button"
            className={"pill" + (granolaConnected ? "" : " warn")}
            onClick={() => {
              if (granolaConnected) {
                if (confirm(`Disconnect Granola from "${granolaOwner || "this account"}"?`)) {
                  onGranolaDisconnect();
                }
              } else {
                onGranolaConnectClick();
              }
            }}
            title={granolaConnected ? `Connected as ${granolaOwner} — click to disconnect` : "Click to connect Granola"}
          >
            <span className="pill-dot" />
            <Calendar size={11} /> granola
          </button>
          <button
            type="button"
            className={"pill" + (slackConnected ? "" : " warn")}
            onClick={() => {
              if (slackConnected) {
                if (confirm(`Disconnect Slack from "${slackTeamName || "this workspace"}"?`)) {
                  onSlackDisconnect();
                }
              } else {
                window.open("/api/slack/install", "_blank", "noopener,noreferrer");
              }
            }}
            title={slackConnected ? `Connected to ${slackTeamName} — click to disconnect` : "Click to connect Slack"}
          >
            <span className="pill-dot" />
            <Slack size={11} /> slack
          </button>
          <button
            type="button"
            className={"pill" + (uploadCount === 0 ? " warn" : "")}
            onClick={onOpenCodeUpload}
            title="Click to add Claude/code context (paste or upload .md files)"
          >
            <span className="pill-dot" />
            <Code size={11} /> code{uploadCount > 0 ? ` · ${uploadCount}` : ""}
          </button>
        </div>
        <button className="sync-btn" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? "Syncing…" : "Sync"}
        </button>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [codeUploadOpen, setCodeUploadOpen] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [granolaConnectOpen, setGranolaConnectOpen] = useState(false);
  const [granolaConnected, setGranolaConnected] = useState(false);
  const [granolaOwner, setGranolaOwner] = useState<string | null>(null);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackTeamName, setSlackTeamName] = useState<string | null>(null);

  useEffect(() => {
    fetchUploadCount();
    fetchGranolaStatus();
    fetchSlackStatus();
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.slackConnected) fetchSlackStatus();
    };
    const onFocus = () => fetchSlackStatus();
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const fetchUploadCount = async () => {
    try {
      const res = await fetch("/api/code/upload");
      if (res.ok) {
        const data = await res.json();
        setUploadCount((data.files || []).length);
      }
    } catch {
      // ignore
    }
  };

  const fetchGranolaStatus = async () => {
    try {
      const res = await fetch("/api/granola/status");
      if (res.ok) {
        const data = await res.json();
        const wasConnected = granolaConnected;
        setGranolaConnected(Boolean(data.connected));
        setGranolaOwner(data.ownerName || null);
        if (data.connected && !wasConnected) runGranolaProbe();
      }
    } catch {
      // ignore
    }
  };

  const runGranolaProbe = async () => {
    try {
      console.log("[granola] Running live test against your account…");
      const res = await fetch("/api/granola/test");
      const data = await res.json();
      if (!res.ok) {
        console.error("[granola] test failed:", data);
        return;
      }
      console.log(`[granola] ✓ Connected as: ${data.owner?.name} (${data.owner?.email})`);
      console.log(`[granola] ${data.note_count} total notes; sample of ${data.sample?.length}:`);
      console.table(data.sample);
    } catch (e) {
      console.error("[granola] probe error:", e);
    }
  };

  const handleGranolaDisconnect = async () => {
    try {
      await fetch("/api/granola/disconnect", { method: "POST" });
    } finally {
      setGranolaConnected(false);
      setGranolaOwner(null);
    }
  };

  const fetchSlackStatus = async () => {
    try {
      const res = await fetch("/api/slack/status");
      if (res.ok) {
        const data = await res.json();
        const wasConnected = slackConnected;
        setSlackConnected(Boolean(data.connected));
        setSlackTeamName(data.teamName || null);
        if (data.connected && !wasConnected) runSlackProbe();
      }
    } catch {
      // ignore
    }
  };

  const runSlackProbe = async () => {
    try {
      console.log("[slack] Running live integration test against your workspace…");
      const res = await fetch("/api/slack/test");
      const data = await res.json();
      if (!res.ok) {
        console.error("[slack] test failed:", data);
        return;
      }
      console.log("[slack] ✓ Connected as:", data.auth_test?.user, "in", data.auth_test?.team);
      console.log(`[slack] ${data.channels?.total_visible} channels visible, member of ${data.channels?.bot_is_member_of}`);
      console.table(data.channels?.list);
      if (data.sample_messages?.messages?.length) {
        console.log(`[slack] Sample messages from #${data.sample_messages.from_channel}:`);
        console.table(data.sample_messages.messages);
      }
    } catch (e) {
      console.error("[slack] probe error:", e);
    }
  };

  const handleSlackDisconnect = async () => {
    try {
      await fetch("/api/slack/disconnect", { method: "POST" });
    } finally {
      setSlackConnected(false);
      setSlackTeamName(null);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      console.log("[sync]", data);
      setHasSynced(true);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="app">
      <TopBar
        isSyncing={isSyncing}
        hasSynced={hasSynced}
        onSync={handleSync}
        onOpenCodeUpload={() => setCodeUploadOpen(true)}
        uploadCount={uploadCount}
        granolaConnected={granolaConnected}
        granolaOwner={granolaOwner}
        onGranolaConnectClick={() => setGranolaConnectOpen(true)}
        onGranolaDisconnect={handleGranolaDisconnect}
        slackConnected={slackConnected}
        slackTeamName={slackTeamName}
        onSlackDisconnect={handleSlackDisconnect}
      />
      <CodeUploadModal
        open={codeUploadOpen}
        onClose={() => setCodeUploadOpen(false)}
        onSaved={fetchUploadCount}
      />
      <GranolaConnectModal
        open={granolaConnectOpen}
        onClose={() => setGranolaConnectOpen(false)}
        onConnected={fetchGranolaStatus}
      />
      <div className="main" style={{ gridTemplateColumns: "1fr" }}>
        <ChatPanel isSyncing={isSyncing} />
      </div>
    </div>
  );
}
