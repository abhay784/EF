"use client";

import { useState, useRef, useCallback } from "react";
import ThemeChip from "./ThemeChip";
import type { WeeklyBrief, Theme, ChatMessage, VideoScript } from "@/lib/types";

interface ChatPanelProps {
  brief: WeeklyBrief | null;
  onScriptUpdate: (script: VideoScript | null) => void;
  onLoadingChange: (loading: boolean) => void;
}

export default function ChatPanel({
  brief,
  onScriptUpdate,
  onLoadingChange,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !brief || !activeTheme) return;

      const newMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: text },
      ];
      setMessages(newMessages);
      setInput("");
      setIsLoading(true);
      onLoadingChange(true);
      onScriptUpdate(null);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            theme: activeTheme,
            messages: newMessages,
            brief,
          }),
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let assistantText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n\n").filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            const data = line.replace("data: ", "");
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantText += parsed.text;
              }
            } catch (e) {
              continue;
            }
          }
        }

        try {
          const script = JSON.parse(assistantText) as VideoScript;
          onScriptUpdate(script);
        } catch {
          onScriptUpdate(null);
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantText },
        ]);
      } catch (error) {
        console.error("Failed to send message:", error);
      } finally {
        setIsLoading(false);
        onLoadingChange(false);
      }

      setTimeout(scrollToBottom, 0);
    },
    [messages, brief, activeTheme, onScriptUpdate, onLoadingChange]
  );

  const handleThemeSelect = (theme: Theme) => {
    setActiveTheme(theme);
    setMessages([]);
    onScriptUpdate(null);
    const firstMessage = `Write a short-form video script about: ${theme.title}. Use this angle: ${theme.content_angle}`;
    sendMessage(firstMessage);
  };

  const handleSendInput = () => {
    if (input.trim()) {
      sendMessage(input);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendInput();
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800">
      {/* Header */}
      <div className="border-b border-zinc-800 p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-100">Script Studio</h1>
        <button className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white">
          Sync
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {!brief ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <p className="text-zinc-400 mb-4">No brief yet</p>
              <p className="text-sm text-zinc-500">
                Click Sync to generate a weekly brief from your activity
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <p className="text-zinc-300 text-sm mb-6 text-center">
              Pick a theme to start writing
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {brief.themes.map((theme) => (
                <ThemeChip
                  key={theme.title}
                  theme={theme}
                  selected={activeTheme?.title === theme.title}
                  onClick={handleThemeSelect}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={clsx(
                  "flex gap-3 text-sm",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={clsx(
                    "flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-semibold",
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-300"
                  )}
                >
                  {msg.role === "user" ? "Y" : "A"}
                </div>
                <div
                  className={clsx(
                    "flex-1 p-3 rounded-lg max-w-xs",
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-100"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <p className="text-xs text-zinc-400">
                      (JSON response — see storyboard)
                    </p>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 text-sm">
                <div className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-semibold bg-zinc-800 text-zinc-300">
                  A
                </div>
                <div className="flex-1 p-3 rounded-lg bg-zinc-800 text-zinc-100">
                  <span className="text-xs text-zinc-400">Generating...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      {brief && messages.length > 0 && (
        <div className="border-t border-zinc-800 p-4 space-y-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for changes... (e.g., 'make the hook punchier')"
            disabled={isLoading}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm disabled:opacity-50"
          />
          <button
            onClick={handleSendInput}
            disabled={isLoading || !input.trim()}
            className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

function clsx(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}
