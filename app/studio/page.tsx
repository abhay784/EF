"use client";

import { useState, useEffect } from "react";
import ChatPanel from "@/components/ChatPanel";
import PreviewPanel from "@/components/PreviewPanel";
import CodeUploadModal from "@/components/CodeUploadModal";
import { Settings, Calendar, Slack, Code } from "@/components/Icons";
import type { WeeklyBrief, VideoScript, Theme } from "@/lib/types";

interface TopBarProps {
  brief: WeeklyBrief | null;
  isSyncing: boolean;
  onSync: () => void;
  slackConnected: boolean;
  slackTeamName: string | null;
  onSlackDisconnect: () => void;
  onOpenCodeUpload: () => void;
  uploadCount: number;
}

function TopBar({ brief, isSyncing, onSync, slackConnected, slackTeamName, onSlackDisconnect, onOpenCodeUpload, uploadCount }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">w</div>
        <span>Weekly</span>
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
          for you
        </span>
      </div>

      <div className="top-right">
        <div className="sync">
          <span className={"dot" + (isSyncing ? " syncing" : " pulse")} />
          <span>{isSyncing ? "Syncing…" : brief ? "Synced" : "Not synced"}</span>
        </div>
        <div className="source-pills">
          <span className="pill">
            <span className="pill-dot" />
            <Calendar size={11} /> granola · {brief ? brief.themes.length : 0}
          </span>
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
            className={"pill" + (uploadCount === 0 && !brief ? " warn" : "")}
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
        <button className="icon-btn" title="Settings">
          <Settings size={15} />
        </button>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const [brief, setBrief] = useState<WeeklyBrief | null>(null);
  const [script, setScript] = useState<VideoScript | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackTeamName, setSlackTeamName] = useState<string | null>(null);
  const [codeUploadOpen, setCodeUploadOpen] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);

  useEffect(() => {
    fetchBrief();
    fetchSlackStatus();
    fetchUploadCount();
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

  const fetchSlackStatus = async () => {
    try {
      const res = await fetch("/api/slack/status");
      if (res.ok) {
        const data = await res.json();
        const wasConnected = slackConnected;
        setSlackConnected(Boolean(data.connected));
        setSlackTeamName(data.teamName || null);
        // When we just transitioned to connected, run the live test and log it to browser console.
        if (data.connected && !wasConnected) {
          runSlackProbe();
        }
      }
    } catch {
      // status stays false
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
      } else {
        console.log("[slack] No sample messages found:", data.sample_messages?.hint);
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

  const fetchBrief = async () => {
    try {
      const res = await fetch("/api/brief");
      if (res.ok) setBrief(await res.json());
    } catch {
      // brief stays null
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      await fetchBrief();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="app">
      <TopBar
        brief={brief}
        isSyncing={isSyncing}
        onSync={handleSync}
        slackConnected={slackConnected}
        slackTeamName={slackTeamName}
        onSlackDisconnect={handleSlackDisconnect}
        onOpenCodeUpload={() => setCodeUploadOpen(true)}
        uploadCount={uploadCount}
      />
      <CodeUploadModal
        open={codeUploadOpen}
        onClose={() => setCodeUploadOpen(false)}
        onSaved={fetchUploadCount}
      />
      <div className="main">
        <ChatPanel
          brief={brief}
          onScriptUpdate={setScript}
          onLoadingChange={setIsLoading}
          onActiveThemeChange={setActiveTheme}
          onRefiningChange={setIsRefining}
          isSyncing={isSyncing}
        />
        <PreviewPanel
          script={script}
          isLoading={isLoading}
          activeTheme={activeTheme}
          isRefining={isRefining}
        />
      </div>
    </div>
  );
}
