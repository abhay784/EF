"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send } from "@/components/Icons";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
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

function renderInline(text: string) {
  // Render **bold**, *italic*, and [source/file.md] citation tags inline.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\.md\])/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i} style={{ color: "var(--ink)" }}>{part.slice(2, -2)}</strong>;
    }
    if (/^\*[^*\n]+\*$/.test(part)) {
      return <em key={i} style={{ fontStyle: "italic", color: "var(--ink)" }}>{part.slice(1, -1)}</em>;
    }
    if (/^\[[^\]]+\.md\]$/.test(part)) {
      const inner = part.slice(1, -1);
      const sourceKind = inner.split("/")[0];
      const dotColor: Record<string, string> = {
        granola: "#6366f1",
        slack: "#4a154b",
        code: "#16a34a",
        uploads: "#d97706",
      };
      return (
        <span
          key={i}
          title={inner}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontFamily: '"Geist Mono", monospace',
            fontSize: "10px",
            background: "var(--surface)",
            color: "var(--ink-2)",
            padding: "1px 6px",
            borderRadius: 999,
            margin: "0 2px",
            border: "1px solid var(--hair)",
            verticalAlign: "1px",
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor[sourceKind] || "var(--ink-2)" }} />
          {sourceKind}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function renderContent(text: string) {
  // Parse markdown into structured blocks: headings, bullets, plain text.
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <div
        key={key++}
        style={{
          margin: "12px 0",
          padding: "12px 14px",
          background: "var(--surface)",
          border: "1px solid var(--hair)",
          borderLeft: "3px solid var(--ink)",
          borderRadius: 8,
        }}
      >
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {bulletBuffer.map((b, i) => (
            <li
              key={i}
              style={{
                position: "relative",
                paddingLeft: 18,
                marginBottom: i === bulletBuffer.length - 1 ? 0 : 8,
                lineHeight: 1.5,
                fontSize: "13.5px",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: "0.55em",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--ink)",
                }}
              />
              {renderInline(b)}
            </li>
          ))}
        </ul>
      </div>
    );
    bulletBuffer = [];
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    const h3Match = line.match(/^###\s+(.*)/);
    const h2Match = line.match(/^##\s+(.*)/);
    const labelMatch = line.match(/^\*\*(.+)\*\*\s*$/);
    const blockquoteMatch = line.match(/^>\s+(.*)/);
    const trimmed = line.trim();

    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
    } else if (h3Match) {
      flushBullets();
      blocks.push(
        <h3
          key={key++}
          style={{
            fontFamily: '"Instrument Serif", serif',
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "22px",
            lineHeight: 1.2,
            color: "var(--ink)",
            margin: "16px 0 10px",
          }}
        >
          {renderInline(h3Match[1])}
        </h3>
      );
    } else if (h2Match) {
      flushBullets();
      blocks.push(
        <h2 key={key++} style={{ fontSize: "16px", fontWeight: 600, margin: "14px 0 8px", color: "var(--ink)" }}>
          {renderInline(h2Match[1])}
        </h2>
      );
    } else if (labelMatch) {
      flushBullets();
      blocks.push(
        <div key={key++} style={{ fontWeight: 600, fontSize: "12px", color: "var(--ink-2)", marginTop: 10, marginBottom: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>
          {labelMatch[1]}
        </div>
      );
    } else if (blockquoteMatch) {
      flushBullets();
      blocks.push(
        <blockquote
          key={key++}
          style={{
            margin: "8px 0",
            padding: "6px 0 6px 12px",
            borderLeft: "2px solid var(--hair)",
            color: "var(--ink-2)",
            fontStyle: "italic",
            fontSize: "13.5px",
          }}
        >
          {renderInline(blockquoteMatch[1])}
        </blockquote>
      );
    } else if (trimmed) {
      flushBullets();
      blocks.push(<p key={key++} style={{ margin: "6px 0", lineHeight: 1.6 }}>{renderInline(trimmed)}</p>);
    }
  }
  flushBullets();
  return blocks;
}

export default function ChatPanel({ isSyncing }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastSourceCount, setLastSourceCount] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages(newMessages);
      setInput("");
      if (taRef.current) taRef.current.style.height = "auto";
      setIsLoading(true);

      // Insert empty assistant message we'll fill as we stream
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newMessages }),
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let assistantText = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const evt of events) {
            if (!evt.startsWith("data: ")) continue;
            const data = evt.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.meta?.sourceCount !== undefined) {
                setLastSourceCount(parsed.meta.sourceCount);
                console.log(`[ask] using ${parsed.meta.sourceCount} source files`, parsed.meta.sources);
                continue;
              }
              if (parsed.error) {
                console.error("[ask] error:", parsed.error);
                continue;
              }
              if (parsed.text) {
                assistantText += parsed.text;
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: assistantText };
                  return copy;
                });
              }
            } catch {
              // skip malformed event
            }
          }
        }
      } catch (err) {
        console.error("ask failed:", err);
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "Something went wrong on my end. Try again?",
          };
          return copy;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [messages]
  );

  const handleSend = () => {
    if (input.trim()) sendMessage(input);
  };

  const grow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(140, e.target.scrollHeight) + "px";
  };

  const placeholder =
    messages.length > 0
      ? "Ask a follow-up…"
      : "Ask anything about your work — \"story with John\", \"what did I ship Tuesday\"…";

  return (
    <div className="chat" style={{ borderRight: 0 }}>
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <ClaudeMsg>
            <div className="msg-name">Assistant</div>
            {isSyncing ? (
              <>
                <div className="brief-headline">Syncing your sources…</div>
                <p style={{ color: "var(--ink-2)", fontSize: "13.5px" }}>
                  Reading your Granola notes, Claude Code sessions, and uploaded files.
                </p>
                <span className="typing">
                  <i className="ti" />
                  <i className="ti" />
                  <i className="ti" />
                </span>
              </>
            ) : (
              <>
                <div className="brief-headline">Ask me about your work.</div>
                <p style={{ color: "var(--ink-2)", fontSize: "13.5px", marginBottom: 10 }}>
                  I read your Granola meetings, code sessions, and uploads. Try one of these:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "4px 0 14px" }}>
                  {[
                    {
                      title: "Tell me the story of this week",
                      hint: "A narrative recap across meetings, calls, and code — who I talked to, what I shipped, where it stands now.",
                      prompt:
                        "Tell me the story of this week. Who did I meet with, what came out of those conversations, and what did I ship in code? Connect the threads — make it read like a story.",
                    },
                    {
                      title: "Story of my biggest meeting",
                      hint: "The conversation that shaped this week the most — context, the turn, where it left off.",
                      prompt:
                        "Tell me the story of the most important meeting from this week. Who was there, what was the real thread, what got decided, and what's still open?",
                    },
                    {
                      title: "Story of the one thing I should follow up on",
                      hint: "The thing hiding in the sources that I'd regret missing — with the receipts.",
                      prompt:
                        "Looking across my meetings and work this week, what's the one thing I most need to follow up on? Tell me the story behind it — why it matters, who's waiting, and what should I do next.",
                    },
                  ].map((s) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => !isLoading && sendMessage(s.prompt)}
                      disabled={isLoading}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        border: "1px solid var(--hair)",
                        borderRadius: 10,
                        background: "var(--surface)",
                        cursor: isLoading ? "default" : "pointer",
                        font: "inherit",
                        color: "inherit",
                      }}
                    >
                      <div style={{ fontSize: "13.5px", fontWeight: 500, marginBottom: 2 }}>{s.title}</div>
                      <div style={{ fontSize: "12px", color: "var(--ink-2)", lineHeight: 1.45 }}>{s.hint}</div>
                    </button>
                  ))}
                </div>
                <p style={{ color: "var(--ink-2)", fontSize: "12px" }}>
                  Hit <strong>Sync</strong> first to refresh sources, then ask anything.
                </p>
              </>
            )}
          </ClaudeMsg>
        )}

        {messages.map((msg, idx) => {
          if (msg.role === "user") {
            return <UserMsg key={idx}>{msg.content}</UserMsg>;
          }
          return (
            <ClaudeMsg key={idx}>
              <div className="msg-name">Assistant</div>
              {msg.content === "" && isLoading && idx === messages.length - 1 ? (
                <span className="typing">
                  <i className="ti" />
                  <i className="ti" />
                  <i className="ti" />
                </span>
              ) : (
                renderContent(msg.content)
              )}
            </ClaudeMsg>
          );
        })}

        {lastSourceCount !== null && messages.length > 0 && (
          <div style={{ textAlign: "center", color: "var(--ink-2)", fontSize: 11, padding: "8px 0", fontFamily: '"Geist Mono", monospace' }}>
            answered using {lastSourceCount} source file{lastSourceCount === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer-frame">
          <textarea
            ref={taRef}
            value={input}
            onChange={grow}
            placeholder={placeholder}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="composer-row">
            <div className="composer-tools" />
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
