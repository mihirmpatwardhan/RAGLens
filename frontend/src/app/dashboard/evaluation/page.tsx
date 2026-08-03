"use client";

import { FeaturePlaceholder } from "@/components/common/feature-placeholder";

export default function EvaluationPage() {
  return (
    <FeaturePlaceholder
      eyebrow="Quality"
      title="Evaluation stays hidden until the scores are real"
      description="The old dashboard showed static quality scores and history. This view now stays transparent: no benchmark numbers are displayed until evaluation jobs are actually persisted and replayable."
      bullets={[
        "Grounded chat and retrieval traces are already available in production flow.",
        "Evaluation should run against saved datasets and stored answers.",
        "Metrics need reproducible inputs, timestamps, and run history.",
        "This page should only surface results once the backend owns them.",
      ]}
      actions={[
        { href: "/dashboard", label: "Use chat" },
        { href: "/dashboard/pipelines", label: "Review pipelines" },
      ]}
    />
  );
}
