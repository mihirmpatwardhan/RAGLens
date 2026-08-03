"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

type Action = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

interface FeaturePlaceholderProps {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  actions: Action[];
}

export function FeaturePlaceholder({
  eyebrow,
  title,
  description,
  bullets,
  actions,
}: FeaturePlaceholderProps) {
  return (
    <div className="p-6 md:p-8 h-full">
      <div className="max-w-4xl rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-8 md:p-10 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          {eyebrow}
        </p>
        <h2 className="mt-4 font-display text-3xl font-bold text-[var(--color-text-primary)]">
          {title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-text-secondary)]">
          {description}
        </p>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {bullets.map((bullet) => (
            <div
              key={bullet}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm text-[var(--color-text-secondary)]"
            >
              {bullet}
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-brand-500)]/30 hover:text-[var(--color-brand-700)]"
              >
                {Icon ? <Icon className="h-4 w-4" /> : null}
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
