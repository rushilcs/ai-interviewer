"use client";

type Variant = "error" | "info";

export interface BannerProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

export function Banner({ variant = "error", children, className = "" }: BannerProps) {
  const isError = variant === "error";
  return (
    <div
      role="alert"
      className={`
        rounded-[10px] border px-4 py-3 text-sm
        ${isError ? "border-danger text-danger bg-surface2" : "border-primary text-primary bg-surface2"}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
