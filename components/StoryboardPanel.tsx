"use client";

import clsx from "clsx";
import CopyButton from "./CopyButton";
import { spokenSeconds, wordCount } from "@/lib/utils";
import type { VideoScript } from "@/lib/types";

interface StoryboardPanelProps {
  script: VideoScript | null;
  isLoading?: boolean;
}

export default function StoryboardPanel({
  script,
  isLoading = false,
}: StoryboardPanelProps) {
  const totalSeconds = script
    ? spokenSeconds(script.hook) +
      spokenSeconds(script.middle) +
      spokenSeconds(script.cta)
    : 0;

  const formatScript = () => {
    if (!script) return "";
    return `[HOOK]\n${script.hook}\n\n[MIDDLE]\n${script.middle}\n\n[CTA]\n${script.cta}`;
  };

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto">
      {/* Header with runtime badge and copy button */}
      <div className="flex items-center justify-between">
        {script && (
          <div className="text-sm font-medium text-zinc-400">
            <span className="bg-zinc-800 px-3 py-1 rounded">
              {totalSeconds}s total runtime
            </span>
          </div>
        )}
        <CopyButton text={formatScript()} disabled={!script} />
      </div>

      {/* Video script sections */}
      <div className="flex flex-col gap-4 flex-1">
        {/* Hook */}
        <div
          className={clsx(
            "flex flex-col gap-2 p-4 rounded-lg border",
            script
              ? "bg-zinc-900 border-zinc-800"
              : "bg-zinc-900/50 border-zinc-700/50"
          )}
        >
          <div className="flex items-center justify-between">
            <span
              className={clsx(
                "font-semibold text-sm",
                script ? "text-zinc-200" : "text-zinc-500"
              )}
            >
              Hook
            </span>
            {script && (
              <span className="text-xs text-zinc-500">
                0–{spokenSeconds(script.hook)}s
              </span>
            )}
          </div>
          {script ? (
            <p className="text-zinc-300 text-sm leading-relaxed">
              {script.hook}
            </p>
          ) : (
            <p className="text-zinc-600 text-sm italic">
              Hook will appear here (0–10s)
            </p>
          )}
          {script && (
            <p className="text-xs text-zinc-500 mt-1">
              {wordCount(script.hook)} words
            </p>
          )}
        </div>

        {/* Middle */}
        <div
          className={clsx(
            "flex flex-col gap-2 p-4 rounded-lg border",
            script
              ? "bg-zinc-900 border-zinc-800"
              : "bg-zinc-900/50 border-zinc-700/50"
          )}
        >
          <div className="flex items-center justify-between">
            <span
              className={clsx(
                "font-semibold text-sm",
                script ? "text-zinc-200" : "text-zinc-500"
              )}
            >
              Middle
            </span>
            {script && (
              <span className="text-xs text-zinc-500">
                {spokenSeconds(script.hook)}–
                {spokenSeconds(script.hook) + spokenSeconds(script.middle)}s
              </span>
            )}
          </div>
          {script ? (
            <p className="text-zinc-300 text-sm leading-relaxed">
              {script.middle}
            </p>
          ) : (
            <p className="text-zinc-600 text-sm italic">
              Middle will appear here (10–50s)
            </p>
          )}
          {script && (
            <p className="text-xs text-zinc-500 mt-1">
              {wordCount(script.middle)} words
            </p>
          )}
        </div>

        {/* CTA */}
        <div
          className={clsx(
            "flex flex-col gap-2 p-4 rounded-lg border",
            script
              ? "bg-zinc-900 border-zinc-800"
              : "bg-zinc-900/50 border-zinc-700/50"
          )}
        >
          <div className="flex items-center justify-between">
            <span
              className={clsx(
                "font-semibold text-sm",
                script ? "text-zinc-200" : "text-zinc-500"
              )}
            >
              CTA
            </span>
            {script && (
              <span className="text-xs text-zinc-500">
                {spokenSeconds(script.hook) + spokenSeconds(script.middle)}–
                {totalSeconds}s
              </span>
            )}
          </div>
          {script ? (
            <p className="text-zinc-300 text-sm leading-relaxed">
              {script.cta}
            </p>
          ) : (
            <p className="text-zinc-600 text-sm italic">
              CTA will appear here (50–60s)
            </p>
          )}
          {script && (
            <p className="text-xs text-zinc-500 mt-1">
              {wordCount(script.cta)} words
            </p>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-center text-sm text-zinc-500">
          Generating script...
        </div>
      )}
    </div>
  );
}
