"use client";

import { type TextareaHTMLAttributes, forwardRef } from "react";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={`
        w-full min-h-[80px] rounded-[10px] bg-surface2 border border-border
        px-3 py-2 text-text placeholder:text-muted
        focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
        transition-colors duration-150 resize-y
        ${className}
      `}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
