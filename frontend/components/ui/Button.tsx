"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-bg hover:opacity-90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg border border-transparent",
  secondary:
    "bg-surface2 border border-border hover:bg-surface2/80 focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-bg",
  ghost:
    "bg-transparent hover:bg-surface2 focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-bg border border-transparent",
  danger:
    "bg-danger text-white hover:opacity-90 focus:ring-2 focus:ring-danger focus:ring-offset-2 focus:ring-offset-bg border border-transparent",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          h-9 rounded-[10px] px-4 text-sm font-medium
          transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${className}
        `}
        disabled={disabled}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
