"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ThemeChip from "./ThemeChip";
import { Sparkle, Paperclip, Link, Mic, Send, X, Doc, ImageIcon, Link as LinkIcon } from "@/components/Icons";
import type { WeeklyBrief, Theme, ChatMessage, VideoScript } from "@/lib/types";

interface Attachment {
  name: string;
  kind: "doc" | "image" | "link";
}

function extractReplyAndScript(text: string): { reply: string; script: VideoScript | null } {
  const trimmed = text.trim();
  if (!trimmed) return { reply: "", script: null };

  const candidates: string[] = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.unshift(fenced[1].trim());
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        const reply = typeof parsed.reply === "string" ? parsed.reply : "";
        const s = parsed.script;
        const script =
          s && typeof s.hook === "string" && typeof s.middle === "string" && typeof s.cta === "string"
            ? (s as VideoScript)
            : typeof parsed.hook === "string" && typeof parsed.middle === "string" && typeof parsed.cta === "string"
            ? { hook: parsed.hook, middle: parsed.middle, cta: parsed.cta }
            : null;
        if (reply || script) {
          return { reply: reply || "Updated the script on the right.", script };
        }
      }
    } catch {
      continue;
    }
  }

  return { reply: trimmed, script: null };
}

interface ChatPanelProps {
  brief: WeeklyBrief | null;
  onScriptUpdate: (script: VideoScript | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onActiveThemeChange: (theme: Theme | null) => void;
  onRefiningChange: (refining: boolean) => void;
  isSyncing: boolean;
}

function ClaudeMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="msg">
      <div className="msg-avatar claude">C</div>
      <div className="msg-body">{children}</div>
    </div>
  );
}

function UserMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="msg" style={{ flexDirection: "row-reverse" }}>
      <div className="msg-avatar">AB</div>
      <div className="msg-body" style={{ maxWidth: "82%" }}>
        <div className="user-msg">{children}</div>
      </div>
    </div>
  );
}

export default function ChatPanel({
  brief,
  onScriptUpdate,
  onLoadingChange,
  onActiveThemeChange,
  onRefiningChange,
  isSyncing,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [pickedAngleId, setPickedAngleId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dropping, setDropping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const setTheme = (theme: Theme | null) => {
    setActiveTheme(theme);
    onActiveThemeChange(theme);
  };

  const sendMessage = useCallback(
    async (text: string, themeOverride?: Theme) => {
      if (!text.trim()) return;

      const themeForRequest =
        themeOverride ?? activeTheme ?? brief?.themes[0] ?? null;
      if (themeForRequest && (!activeTheme || activeTheme.title !== themeForRequest.title)) {
        setTheme(themeForRequest);
      }

      const isFirstMsg = messages.length === 0;
      const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages(newMessages);
      setInput("");
      if (taRef.current) taRef.current.style.height = "auto";
      setIsLoading(true);
      onLoadingChange(true);
      if (!isFirstMsg) onRefiningChange(false);
      if (isFirstMsg && themeForRequest) onScriptUpdate(null);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: themeForRequest, messages: newMessages, brief }),
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let assistantText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.replace("data: ", "");
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) assistantText += parsed.text;
            } catch {
              continue;
            }
          }
        }

        const { reply, script } = extractReplyAndScript(assistantText);
        if (script) {
          onScriptUpdate(script);
          if (!isFirstMsg) onRefiningChange(true);
        }
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (err) {
        console.error("generate failed:", err);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Something went wrong on my end. Try again?" },
        ]);
      } finally {
        setIsLoading(false);
        onLoadingChange(false);
      }
    },
    [messages, brief, activeTheme, onScriptUpdate, onLoadingChange, onRefiningChange]
  );

  const handleAnglePick = (theme: Theme) => {
    setTheme(theme);
    setPickedAngleId(theme.title);
    setMessages([]);
    onScriptUpdate(null);
    onRefiningChange(false);
    sendMessage(
      `Write short-form content about: ${theme.title}. Angle: ${theme.content_angle}`,
      theme
    );
  };

  const handleSend = () => {
    if (input.trim()) sendMessage(input);
  };

  const addAttachment = (a: Attachment) => setAttachments((prev) => [...prev, a]);
  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, j) => j !== i));

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDropping(true); };
  const onDragLeave = () => setDropping(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const f = e.dataTransfer?.files?.[0];
    addAttachment(f
      ? { name: f.name, kind: f.type.startsWith("image") ? "image" : "doc" }
      : { name: "dropped-file.md", kind: "doc" });
  };

  const grow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(140, e.target.scrollHeight) + "px";
  };

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef}>
        <ClaudeMsg>
          <div className="msg-name">Claude · weekly brief</div>
          {brief ? (
            <>
              <div className="brief-headline">
                You had a <em>busy</em> week. {brief.themes.length} threads I think are worth telling —
              </div>
              <p style={{ color: "var(--ink-2)", fontSize: "13.5px", marginBottom: "10px" }}>
                From your activity across {brief.themes.length} themes. Tap a theme to dig in.
              </p>
              <div className="chips">
                {brief.themes.map((t) => (
                  <ThemeChip
                    key={t.title}
                    theme={t}
                    selected={activeTheme?.title === t.title}
                    onClick={() => setTheme(t)}
                  />
                ))}
              </div>
              <p style={{ fontSize: "13.5px", color: "var(--ink-2)", margin: "8px 0 12px" }}>
                Here are the angles I&apos;d lead with:
              </p>
              <div>
                {brief.themes.map((theme) => (
                  <div
                    key={theme.title}
                    className={"angle-card" + (pickedAngleId === theme.title ? " picked" : "")}
                    onClick={() => !isLoading && handleAnglePick(theme)}
                  >
                    <div className="angle-meta">
                      <span className="src">{theme.suggested_formats[0]?.toUpperCase() ?? "CONTENT"}</span>
                      <span>·</span>
                      <span>from {theme.sources.slice(0, 2).join(", ")}</span>
                    </div>
                    <div className="angle-title">{theme.title}</div>
                    <div className="angle-hook">&ldquo;{theme.content_angle}&rdquo;</div>
                    <div className="angle-actions">
                      <button
                        className="angle-cta"
                        disabled={isLoading}
                        onClick={(e) => { e.stopPropagation(); handleAnglePick(theme); }}
                      >
                        <Sparkle size={13} /> Make this
                      </button>
                      <button className="angle-secondary" onClick={(e) => e.stopPropagation()}>
                        Try a different angle
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : isSyncing ? (
            <>
              <div className="brief-headline">Syncing your week…</div>
              <p style={{ color: "var(--ink-2)", fontSize: "13.5px" }}>
                Reading your Claude Code sessions, Slack messages, and Granola notes.
              </p>
              <span className="typing"><i className="ti" /><i className="ti" /><i className="ti" /></span>
            </>
          ) : (
            <>
              <div className="brief-headline">No brief yet.</div>
              <p style={{ color: "var(--ink-2)", fontSize: "13.5px" }}>
                Hit <strong>Sync</strong> to read your Claude Code sessions, Slack messages, and Granola notes.
              </p>
            </>
          )}
        </ClaudeMsg>

        {messages.map((msg, idx) => {
          if (msg.role === "user") {
            return (
              <UserMsg key={idx}>
                {idx === 0 && pickedAngleId ? (
                  <><span className="tag">make this</span>{" "}{activeTheme?.title}</>
                ) : msg.content}
              </UserMsg>
            );
          }
          return (
            <ClaudeMsg key={idx}>
              <div className="msg-name">Claude</div>
              {msg.content
                .split(/\n{2,}/)
                .map((para, p) => <p key={p}>{para}</p>)}
            </ClaudeMsg>
          );
        })}

        {isLoading && (
          <ClaudeMsg>
            <div className="msg-name">Claude · drafting</div>
            <span className="typing"><i className="ti" /><i className="ti" /><i className="ti" /></span>
          </ClaudeMsg>
        )}
      </div>

      <div
        className={"composer" + (dropping ? " dropping" : "")}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="composer-frame">
          {attachments.length > 0 && (
            <div className="attachments">
              {attachments.map((a, i) => (
                <span key={i} className="attachment">
                  <span className="attachment-icon">
                    {a.kind === "image" ? <ImageIcon size={13} /> : a.kind === "link" ? <LinkIcon size={13} /> : <Doc size={13} />}
                  </span>
                  <span>{a.name}</span>
                  <span className="x" onClick={() => removeAttachment(i)}><X size={11} /></span>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={taRef}
            value={input}
            onChange={grow}
            placeholder={messages.length > 0 ? "ask claude to refine, or type a follow-up…" : "ask for a different angle, or upload context…"}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
          />
          <div className="composer-row">
            <div className="composer-tools">
              <button className="icon-btn" title="Attach file" onClick={() => fileRef.current?.click()}>
                <Paperclip size={15} />
              </button>
              <button
                className="icon-btn"
                title="Add link"
                onClick={() => addAttachment({ name: "link", kind: "link" })}
              >
                <Link size={15} />
              </button>
              <button className="icon-btn" title="Voice"><Mic size={15} /></button>
              <input
                ref={fileRef}
                type="file"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addAttachment({ name: f.name, kind: f.type.startsWith("image") ? "image" : "doc" });
                }}
              />
            </div>
            <button
              className="send-btn"
              disabled={!input.trim() || isLoading}
              onClick={handleSend}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
