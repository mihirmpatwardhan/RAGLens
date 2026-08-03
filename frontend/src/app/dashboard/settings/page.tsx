"use client";

import { FeaturePlaceholder } from "@/components/common/feature-placeholder";

export default function SettingsPage() {
  return (
    <FeaturePlaceholder
      eyebrow="Configuration"
      title="Runtime settings stay env-driven for now"
      description="The old settings UI looked writable but did not persist real backend configuration. This cleaned version keeps the product honest until configuration storage, validation, and rollout rules are implemented."
      bullets={[
        "Local auth, backend origin, provider keys, and retrieval defaults come from environment setup.",
        "Knowledge-base settings already persist the most important retrieval knobs.",
        "Editable global settings should validate provider readiness before saving.",
        "A future admin surface should expose runtime config, secrets health, and change history.",
      ]}
      actions={[
        { href: "/dashboard/knowledge", label: "Tune per-workspace settings" },
        { href: "/dashboard/analytics", label: "Review live metrics" },
      ]}
    />
  );
}
