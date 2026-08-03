"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "destructive" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref,
  ) => {
    const base =
      "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none";

    const variants: Record<string, string> = {
      default:
        "bg-[var(--color-brand-500,#6366f1)] text-white hover:bg-[var(--color-brand-600,#4f46e5)] focus-visible:ring-[var(--color-brand-500,#6366f1)]",
      secondary:
        "bg-[var(--color-surface-200,#1e1e2e)] text-[var(--color-text-primary,#e2e8f0)] hover:bg-[var(--color-surface-300,#2d2d3e)]",
      destructive: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
      ghost:
        "bg-transparent hover:bg-[var(--color-surface-200,#1e1e2e)] text-[var(--color-text-primary,#e2e8f0)]",
      outline:
        "border border-[var(--color-border,#334155)] bg-transparent hover:bg-[var(--color-surface-200,#1e1e2e)] text-[var(--color-text-primary,#e2e8f0)]",
    };

    const sizes: Record<string, string> = {
      default: "h-10 py-2 px-4 text-sm",
      sm: "h-9 px-3 text-sm rounded-md",
      lg: "h-11 px-6 text-base rounded-md",
      icon: "h-10 w-10",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant ?? "default"], sizes[size ?? "default"], className)}
        {...props}
      >
        {leftIcon && <span className="mr-2 flex-shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2 flex-shrink-0">{rightIcon}</span>}
      </button>
    );
  },
);

Button.displayName = "Button";
