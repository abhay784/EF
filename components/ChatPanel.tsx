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

function renderWithCitations(text: string) {
  // Convert [source/filename.md] patterns into subtle inline tags.
  const parts = text.split(/(\[[^\]]+\.md\])/g);
  return parts.map((part, i) => {
    if (/^\[[^\]]+\.md\]$/.test(part)) {
      return (
        <span
          key={i}
          style={{
            display: "inline-block",
            fontFamily: '"Geist Mono", monospace',
            fontSize: "11px",
            background: "var(--surface)",
            color: "var(--ink-2)",
            padding: "1px 6px",
            borderRadius: 4,
            margin: "0 2px",
            border: "1px solid var(--hair)",
          }}
        >
          {part.slice(1, -1)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
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
                  Reading your Slack, Granola notes, Claude Code sessions, and uploaded files.
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
                <p style={{ color: "var(--ink-2)", fontSize: "13.5px", marginBottom: 6 }}>
                  I read your Slack, Granola meetings, code sessions, and uploads. Ask things like:
                </p>
                <ul style={{ color: "var(--ink-2)", fontSize: "13.5px", paddingLeft: 18, margin: "8px 0 12px" }}>
                  <li>&ldquo;Story with John&rdquo;</li>
                  <li>&ldquo;What did I ship this week?&rdquo;</li>
                  <li>&ldquo;Who&apos;s been blocking the auth migration?&rdquo;</li>
                  <li>&ldquo;Summarize Tuesday&apos;s meetings&rdquo;</li>
                </ul>
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
                msg.content.split(/\n{2,}/).map((para, p) => (
                  <p key={p}>{renderWithCitations(para)}</p>
                ))
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
