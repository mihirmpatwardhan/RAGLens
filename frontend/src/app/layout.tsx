import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAGLense — Enterprise Knowledge Intelligence Platform",
  description:
    "Explainable, enterprise-ready Multimodal Knowledge Intelligence Platform. Ingest any data, process through visual AI pipelines, and chat with complete transparency.",
  keywords: [
    "RAG",
    "AI",
    "Knowledge Base",
    "LLM",
    "Enterprise AI",
    "Retrieval Augmented Generation",
    "Vector Database",
    "Document Intelligence",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-[var(--color-surface-0)] text-[var(--color-text-primary)]">
        {children}
      </body>
    </html>
  );
}
