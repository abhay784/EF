"use client";

import { useState, useEffect } from "react";
import { Refresh, Copy, NotionIcon, Download, Sparkle } from "@/components/Icons";
import { spokenSeconds } from "@/lib/utils";
import type { VideoScript, Theme } from "@/lib/types";

interface PreviewPanelProps {
  script: VideoScript | null;
  isLoading: boolean;
  activeTheme: Theme | null;
  isRefining: boolean;
}

function VideoView({ script }: { script: VideoScript }) {
  const hookSec = spokenSeconds(script.hook);
  const midSec = spokenSeconds(script.middle);
  const ctaSec = spokenSeconds(script.cta);
  const total = hookSec + midSec + ctaSec;

  const segs = [
    { stage: "Hook", time: `0:00 – 0:${String(hookSec).padStart(2, "0")}`, duration: hookSec, copy: script.hook, vo: "ON CAMERA · QUICK CUT" },
    { stage: "Middle", time: `0:${String(hookSec).padStart(2, "0")} – 0:${String(hookSec + midSec).padStart(2, "0")}`, duration: midSec, copy: script.middle, vo: "ON CAMERA · B-ROLL" },
    { stage: "CTA", time: `0:${String(hookSec + midSec).padStart(2, "0")} – 0:${String(total).padStart(2, "0")}`, duration: ctaSec, copy: script.cta, vo: "ON CAMERA · DIRECT" },
  ];

  return (
    <div className="script">
      {segs.map((s, i) => (
        <div key={i} className="seg">
          <div className="seg-stage">
            <div className="label">{s.stage}</div>
            <div className="time">{s.time}</div>
          </div>
          <div className="seg-copy">
            <span className="vo">{s.vo}</span>
            {s.copy}
          </div>
          <div className="seg-bar">
            <div className="duration">{s.duration}s</div>
            <div className="meter"><i style={{ width: ((s.duration / total) * 100) + "%" }} /></div>
            <div className="ratio">9:16</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BuildingView() {
  return (
    <div className="frames">
      {[0, 1, 2].map((i) => (
        <div key={i} className="frame building">
          <div className="frame-num" style={{ opacity: 0.4 }}>0{i + 1}<small>building…</small></div>
          <div>
            <div className="frame-label">{i === 0 ? "HOOK" : i === 1 ? "MIDDLE" : "CTA"}</div>
            <div className="build-stack">
              <div className="build-line w90" />
              <div className="build-line w70" />
              {i === 1 && <div className="build-line w50" />}
            </div>
          </div>
          <div style={{ color: "var(--muted)" }}>
            <span className="typing"><i className="ti" /><i className="ti" /><i className="ti" /></span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PreviewPanel({
  script,
  isLoading,
  activeTheme,
  isRefining,
}: PreviewPanelProps) {
  const [copied, setCopied] = useState(false);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setBuilding(true);
      return;
    }
    const t = setTimeout(() => setBuilding(false), 400);
    return () => clearTimeout(t);
  }, [isLoading]);

  const handleCopy = () => {
    if (!script) return;
    const text = `[HOOK]\n${script.hook}\n\n[MIDDLE]\n${script.middle}\n\n[CTA]\n${script.cta}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const showEmpty = !script && !isLoading;

  return (
    <div className="preview">
      <div className="preview-bar">
        <div className="preview-actions">
          <button className="ghost-btn"><Refresh size={13} /> Regenerate</button>
          <button className="ghost-btn" onClick={handleCopy}>
            <Copy size={13} /> {copied ? "Copied!" : "Copy"}
          </button>
          <button className="ghost-btn"><NotionIcon size={13} /> Notion</button>
          <button className="ghost-btn primary"><Download size={13} /> Export</button>
        </div>
      </div>

      <div className="preview-body">
        {showEmpty ? (
          <div className="empty">
            <div>
              <div className="empty-art" />
              <h3>Pick an angle to start drafting</h3>
              <p>
                The right panel becomes a live storyboard for your video script —
                hook, middle, and CTA, timed for short-form.
              </p>
            </div>
          </div>
        ) : (
          <>
            {script && (
              <div className="preview-header">
                <div className="preview-title">
                  <em>"{activeTheme?.title ?? "Your story"}"</em>
                </div>
                <div className="preview-meta">
                  <div className="v">VIDEO SCRIPT · DRAFT v{isRefining ? 2 : 1}</div>
                  {activeTheme && <div>{activeTheme.sources.slice(0, 2).join(" · ")}</div>}
                  <div>SAVED JUST NOW</div>
                </div>
              </div>
            )}

            {isRefining && script && (
              <div className="refinement-note">
                <Sparkle size={12} /> Updated · hook reordered
              </div>
            )}

            {building ? (
              <BuildingView />
            ) : script ? (
              <VideoView script={script} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
