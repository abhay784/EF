"use client";

import { useState } from "react";
import clsx from "clsx";

interface CopyButtonProps {
  text: string;
  disabled?: boolean;
}

export default function CopyButton({ text, disabled = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      disabled={disabled}
      className={clsx(
        "px-4 py-2 rounded-lg font-medium transition-all",
        disabled
          ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
          : copied
            ? "bg-green-600 text-white"
            : "bg-blue-600 text-white hover:bg-blue-700"
      )}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}
