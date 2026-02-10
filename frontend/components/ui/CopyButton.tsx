"use client";

import { useState, useCallback } from "react";
import { Button } from "./Button";

export interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = "Copy", className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <Button variant="secondary" onClick={handleCopy} type="button">
        {copied ? "Copied" : label}
      </Button>
      {copied && (
        <span className="text-xs text-muted">Copied</span>
      )}
    </div>
  );
}
