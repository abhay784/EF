"use client";

import { useState, useEffect } from "react";
import ChatPanel from "@/components/ChatPanel";
import StoryboardPanel from "@/components/StoryboardPanel";
import type { WeeklyBrief, VideoScript } from "@/lib/types";

export default function StudioPage() {
  const [brief, setBrief] = useState<WeeklyBrief | null>(null);
  const [script, setScript] = useState<VideoScript | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchBrief();
  }, []);

  const fetchBrief = async () => {
    try {
      const response = await fetch("/api/brief");
      if (response.ok) {
        const data = await response.json();
        setBrief(data);
      }
    } catch (error) {
      console.error("Failed to fetch brief:", error);
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950">
      <div className="w-1/2 flex flex-col border-r border-zinc-800">
        <ChatPanel
          brief={brief}
          onScriptUpdate={setScript}
          onLoadingChange={setIsLoading}
        />
      </div>
      <div className="w-1/2 flex flex-col">
        <StoryboardPanel script={script} isLoading={isLoading} />
      </div>
    </div>
  );
}
