"use client";

import { useState, useEffect } from "react";
import {
  PostIcon, ThreadIcon, VideoIcon, CarouselIcon,
  Refresh, Copy, NotionIcon, Download, Sparkle,
} from "@/components/Icons";
import { spokenSeconds } from "@/lib/utils";
import type { VideoScript, Theme, Format } from "@/lib/types";

interface PreviewPanelProps {
  script: VideoScript | null;
  isLoading: boolean;
  format: Format;
  setFormat: (f: Format) => void;
  activeTheme: Theme | null;
  isRefining: boolean;
}

function PostView({ script }: { script: VideoScript }) {
  const body = `${script.hook}\n\n${script.middle}\n\n${script.cta}`;
  const chars = body.length;
  const limit = 3000;
  const pct = Math.min(100, (chars / limit) * 100);
  return (
    <div className="post">
      <div className="post-author">
        <div className="post-avatar">AB</div>
        <div className="post-author-info">
          <div className="post-author-name">You</div>
          <div className="post-author-sub">builder · 1st</div>
        </div>
      </div>
      <div className="post-body">{body}</div>
      <div className="post-footer">
        <div className="char-count">
          <span>{chars} / {limit}</span>
          <span className="char-bar"><i style={{ width: pct + "%" }} /></span>
        </div>
        <span>LINKEDIN · LONG-FORM</span>
      </div>
    </div>
  );
}

function ThreadView({ script }: { script: VideoScript }) {
  const tweets = [script.hook, script.middle, script.cta];
  const labels = ["HOOK", "BEAT", "CTA"];
  return (
    <div className="thread">
      {tweets.map((copy, i) => (
        <div key={i} className="tweet">
          <div className="tweet-rail">
            <div className="av">AB</div>
            <div className="line" />
          </div>
          <div className="tweet-body">
            <div className="tweet-head">
              <span className="name">You</span>
              <span className="handle">@you</span>
              <span className="pos">{i + 1}/{tweets.length}</span>
            </div>
            <div className="tweet-copy">{copy}</div>
            <div className="tweet-foot">
              <span className="cc">{copy.length} / 280</span>
              <span>{labels[i]}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
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

function CarouselView({ script, theme }: { script: VideoScript; theme: Theme | null }) {
  const coverTitle = theme?.title ?? "This week's story";
  const slides = [
    { kind: "cover", title: coverTitle, body: script.hook, meta: "01 / 04" },
    { title: "The setup", body: script.hook, meta: "02 / 04" },
    { title: "The insight", body: script.middle, meta: "03 / 04" },
    { kind: "last", title: "Take action", body: script.cta, meta: "04 / 04" },
  ];
  return (
    <div className="carousel">
      {slides.map((s, i) => (
        <div key={i} className={"slide" + (s.kind === "cover" ? " cover" : "") + (s.kind === "last" ? " last" : "")}>
          <div className="slide-num">{s.meta}</div>
          <div>
            <div className="slide-title">{s.title}</div>
            <div className="slide-body">{s.body}</div>
          </div>
          <div className="slide-meta">
            {i === 0 ? "INSTAGRAM · COVER" : i === slides.length - 1 ? "INSTAGRAM · CLOSE" : "INSTAGRAM · BODY"}
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

const FORMAT_TABS = [
  { id: "post" as Format, label: "Post", Icon: PostIcon },
  { id: "thread" as Format, label: "Thread", Icon: ThreadIcon },
  { id: "video" as Format, label: "Video", Icon: VideoIcon },
  { id: "carousel" as Format, label: "Carousel", Icon: CarouselIcon },
];

export default function PreviewPanel({
  script,
  isLoading,
  format,
  setFormat,
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
  }, [isLoading, format]);

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
        <div className="format-tabs">
          {FORMAT_TABS.map(({ id, label, Icon }) => (
            <button key={id} aria-pressed={format === id} onClick={() => setFormat(id)}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
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
                The right panel becomes a live storyboard. Switch formats anytime —
                beats stay aligned across post, thread, video and carousel.
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
                  <div className="v">{format.toUpperCase()} · DRAFT v{isRefining ? 2 : 1}</div>
                  {activeTheme && <div>{activeTheme.sources.slice(0, 2).join(" · ")}</div>}
                  <div>SAVED JUST NOW</div>
                </div>
              </div>
            )}

            {isRefining && script && (
              <div className="refinement-note">
                <Sparkle size={12} /> Updated · hook reordered across all formats
              </div>
            )}

            {building ? (
              <BuildingView />
            ) : script ? (
              <>
                {format === "post" && <PostView script={script} />}
                {format === "thread" && <ThreadView script={script} />}
                {format === "video" && <VideoView script={script} />}
                {format === "carousel" && <CarouselView script={script} theme={activeTheme} />}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
