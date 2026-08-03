"use client";

import { FeaturePlaceholder } from "@/components/common/feature-placeholder";

export default function ExperimentsPage() {
  return (
    <FeaturePlaceholder
      eyebrow="Experimentation"
      title="Experiments need backend jobs before they deserve a dashboard"
      description="The previous view listed fake A/B runs and progress bars. This page now makes the product boundary clear until experiment scheduling, tracking, and results storage are implemented."
      bullets={[
        "Chunking, embeddings, reranking, and prompts should be versioned before testing.",
        "Experiment runs need persisted inputs, metrics, and winning configurations.",
        "Progress bars should reflect worker jobs instead of browser-only animation.",
        "Until then, the live product flow stays centered on upload, ingest, and chat.",
      ]}
      actions={[
        { href: "/dashboard/knowledge", label: "Manage workspaces" },
        { href: "/dashboard/documents", label: "Upload files" },
      ]}
    />
  );
}
