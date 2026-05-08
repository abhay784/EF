"use client";

import { useState, useEffect } from "react";
import ChatPanel from "@/components/ChatPanel";
import PreviewPanel from "@/components/PreviewPanel";
import { ChevronLeft, ChevronRight, Settings, Calendar, Slack, Code } from "@/components/Icons";
import type { WeeklyBrief, VideoScript, Theme } from "@/lib/types";

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const wk = Math.ceil(
    (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000
  );
  return {
    range: `${fmt(start)} — ${fmt(end)}`,
    label: `WK ${wk} · ${now.getFullYear()}`,
  };
}

interface TopBarProps {
  brief: WeeklyBrief | null;
  isSyncing: boolean;
  onSync: () => void;
  slackConnected: boolean;
}

function TopBar({ brief, isSyncing, onSync, slackConnected }: TopBarProps) {
  const { range, label } = getWeekLabel();

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

      <div className="week">
        <button className="icon-btn">
          <ChevronLeft size={14} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
          <span className="week-label">{label}</span>
          <span className="week-range">{range}</span>
        </div>
        <button className="icon-btn">
          <ChevronRight size={14} />
        </button>
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
            className="pill"
            onClick={() => {
              if (slackConnected) return;
              window.open("/api/slack/install", "_blank", "noopener,noreferrer");
            }}
            title={slackConnected ? "Slack connected" : "Click to connect Slack"}
            style={{ cursor: slackConnected ? "default" : "pointer", border: 0, font: "inherit" }}
          >
            <span className="pill-dot" />
            <Slack size={11} /> slack
          </button>
          <span className={"pill" + (!brief ? " warn" : "")}>
            <span className="pill-dot" />
            <Code size={11} /> code
          </span>
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

  useEffect(() => {
    fetchBrief();
    fetchSlackStatus();
  }, []);

  const fetchSlackStatus = async () => {
    try {
      const res = await fetch("/api/slack/status");
      if (res.ok) {
        const data = await res.json();
        setSlackConnected(Boolean(data.connected));
      }
    } catch {
      // status stays false
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
      <TopBar brief={brief} isSyncing={isSyncing} onSync={handleSync} slackConnected={slackConnected} />
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
