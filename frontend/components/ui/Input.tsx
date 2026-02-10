"use client";

import { type InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`
          h-10 w-full rounded-[10px] bg-surface2 border border-border
          px-3 text-text placeholder:text-muted
          focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
          transition-colors duration-150
          ${className}
        `}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
