import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { CustomAuthProvider } from "@/components/auth/custom-auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAGLens - AI Knowledge Studio",
  description:
    "Upload documents, build searchable knowledge bases, and chat with grounded answers and pipeline traces.",
  keywords: [
    "RAG",
    "AI",
    "Knowledge Base",
    "LLM",
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
    <html lang="en">
      <body className="antialiased min-h-screen bg-[var(--color-surface-0)] text-[var(--color-text-primary)]">
        <CustomAuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: "var(--color-surface-50)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              },
            }}
          />
        </CustomAuthProvider>
      </body>
    </html>
  );
}

