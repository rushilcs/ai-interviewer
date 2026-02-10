"use client";

import { type HTMLAttributes } from "react";

export function Table({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={`w-full border-collapse text-sm ${className}`}
      {...props}
    />
  );
}

export function THead({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`sticky top-0 z-10 bg-surface text-muted text-xs font-medium ${className}`}
      {...props}
    />
  );
}

export function TRow({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`border-b border-border transition-colors duration-150 hover:bg-surface2/50 ${className}`}
      {...props}
    />
  );
}

export function TH({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`text-left py-3 px-4 font-medium ${className}`}
      {...props}
    />
  );
}

export function TD({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableCellElement>) {
  return <td className={`py-3 px-4 ${className}`} {...props} />;
}
