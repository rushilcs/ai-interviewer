"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
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

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 rounded-[10px] px-4 text-sm font-medium",
  lg: "h-10 px-5 text-base font-medium rounded-[10px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          rounded-[10px]
          transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${sizeClasses[size]}
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
