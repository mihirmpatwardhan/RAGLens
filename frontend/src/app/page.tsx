"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileUp,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Bot,
  Send,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/components/common/brand-logo";

const WORKFLOW = [
  { 
    title: "Upload", 
    description: "Drop PDFs, markdown, text, CSV, or DOCX files directly into your workspace.", 
    icon: FileUp 
  },
  { 
    title: "Index", 
    description: "Documents are processed, split into semantic chunks, and indexed in ChromaDB.", 
    icon: Database 
  },
  { 
    title: "Ask", 
    description: "Chat with verified, grounded answers that link back to the exact source chunks.", 
    icon: MessageSquareText 
  },
];

const BENEFITS = [
  "Secure local JWT authentication with email verification",
  "Private knowledge bases per signed-in user",
  "Real-time upload and processing tracking",
  "Step-by-step retrieval trace visualization",
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-surface-0)] text-[var(--color-text-primary)] overflow-x-hidden">
      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface-0)]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <BrandLogo className="h-12 w-44 sm:h-14 sm:w-52" />
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative border-b border-[var(--color-border)] bg-dot-grid py-12 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 grid lg:grid-cols-[0.95fr_1.05fr] gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Title and Details */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-50)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] mb-6 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-[var(--color-success)]" />
              Verified Enterprise RAG Workspace
            </div>

            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.05] font-bold">
              Upload files.<br />Ask questions.<br />
              <span className="text-[var(--color-brand-600)]">See the proof.</span>
            </h1>
            
            <p className="mt-6 text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed max-w-xl">
              RAGLens gives every verified user a clean document workspace:
              upload documents, generate semantic vectors, and get answers that
              expose their exact retrieval pipeline trace.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/register"
                className="btn-primary px-6 py-3.5 text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-brand/10"
              >
                Create verified account <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard/documents"
                className="glass-interactive px-6 py-3.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                Upload documents <FileUp className="w-4 h-4" />
              </Link>
            </div>

            <div className="mt-10 grid sm:grid-cols-2 gap-3.5 max-w-xl">
              {BENEFITS.map((benefit) => (
                <div key={benefit} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                  <CheckCircle2 className="w-4.5 h-4.5 text-[var(--color-success)] flex-shrink-0" />
                  {benefit}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right Column: Premium Mock Workspace Preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="relative"
          >
            {/* Soft decorative glow behind the card */}
            <div className="absolute -inset-2 bg-gradient-to-tr from-[var(--color-brand-200)]/20 to-[var(--color-accent-300)]/15 rounded-3xl blur-2xl -z-10" />

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-50)] shadow-2xl overflow-hidden">
              {/* Window Header */}
              <div className="h-12 border-b border-[var(--color-border)] px-4 flex items-center justify-between bg-[var(--color-surface-100)]/70">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[var(--color-error)]/80" />
                  <span className="w-3 h-3 rounded-full bg-[var(--color-warning)]/80" />
                  <span className="w-3 h-3 rounded-full bg-[var(--color-success)]/80" />
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] font-mono">
                  <LockKeyhole className="w-3.5 h-3.5 text-[var(--color-success)]" />
                  local.raglense.session
                </div>
                <div className="flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-success)]"></span>
                  </span>
                  <span className="text-[10px] text-[var(--color-text-secondary)] font-semibold">Live</span>
                </div>
              </div>

              {/* Chat Interface Preview */}
              <div className="p-5 sm:p-6 space-y-4">
                {/* User Message Bubble */}
                <div className="flex justify-end items-start gap-2.5">
                  <div className="bg-[var(--color-brand-600)] text-white text-xs sm:text-sm rounded-2xl rounded-tr-none px-4 py-3 max-w-[85%] shadow-sm">
                    Show me the main project metrics from our Q3 summary document.
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-500)] text-white flex items-center justify-center text-xs font-bold shadow-sm">
                    U
                  </div>
                </div>

                {/* Assistant Message Bubble */}
                <div className="flex justify-start items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-brand-600)] text-white flex items-center justify-center text-xs shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="border border-[var(--color-border)] bg-[var(--color-surface-0)] text-[var(--color-text-primary)] text-xs sm:text-sm rounded-2xl rounded-tl-none px-4 py-3 max-w-[85%] shadow-sm space-y-2">
                    <p className="leading-relaxed">
                      According to <span className="font-semibold text-[var(--color-brand-700)] underline">q3-summary-doc.pdf</span>, the key metrics are:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-xs">
                      <li>Overall platform revenue grew by <strong className="text-[var(--color-text-primary)]">18.4%</strong>.</li>
                      <li>Storage infrastructure overhead reduced by <strong className="text-[var(--color-text-primary)]">$4,250/mo</strong>.</li>
                    </ul>
                    <div className="mt-2.5 border-t border-[var(--color-border)] pt-2 text-[10px] text-[var(--color-text-muted)] flex items-center gap-3">
                      <span>284ms latency</span>
                      <span>•</span>
                      <span>2 source chunks</span>
                    </div>
                  </div>
                </div>

                {/* Simulated Retrieval Trace Stages */}
                <div className="rounded-xl bg-[var(--color-surface-100)] border border-[var(--color-border)] p-4 mt-2">
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-3 pb-1 border-b border-[var(--color-border)]">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Search className="w-3.5 h-3.5 text-[var(--color-brand-500)]" />
                      Retrieval Pipeline Execution Trace
                    </span>
                    <Zap className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                  </div>
                  
                  <div className="space-y-2">
                    {[
                      { stage: "Query reformulation", detail: "Keywords expanded & intent classified" },
                      { stage: "Dense semantic vector search", detail: "Scored 5 chunks from ChromaDB" },
                      { stage: "Source cross-encoder reranking", detail: "Top 2 chunks prioritized" },
                      { stage: "LLM synthesis & citation link", detail: "Grounded answer generated" }
                    ].map((item, index) => (
                      <motion.div
                        key={item.stage}
                        className="rounded-lg bg-[var(--color-surface-0)] border border-[var(--color-border)] p-2 flex items-center justify-between px-3 text-[11px] hover:border-[var(--color-brand-400)] transition"
                        animate={{ opacity: [0.75, 1, 0.75] }}
                        transition={{ duration: 3, repeat: Infinity, delay: index * 0.4 }}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-[var(--color-text-primary)]">{item.stage}</span>
                          <span className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{item.detail}</span>
                        </div>
                        <Sparkles className="w-3.5 h-3.5 text-[var(--color-brand-500)] flex-shrink-0" />
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Input Composers Area */}
                <div className="border-t border-[var(--color-border)] pt-4 flex gap-2">
                  <div className="flex-1 border border-[var(--color-border)] bg-[var(--color-surface-0)] rounded-xl px-3.5 py-2 flex items-center justify-between text-xs text-[var(--color-text-muted)] shadow-inner">
                    <span>Ask anything about your document...</span>
                    <Send className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* ── Workflow Steps Section ── */}
      <section className="max-w-7xl mx-auto px-5 sm:px-6 py-16 lg:py-24">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-600)]">
            How it works
          </p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold">
            Ingestion, indexing, and chat — in one pipeline
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[var(--color-text-secondary)] leading-relaxed">
            RAGLens bridges the gap between documents and answers by providing absolute visibility into the retrieval process.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {WORKFLOW.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.45, delay: index * 0.1 }}
              className="p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-50)] shadow-sm hover:border-[var(--color-brand-400)]/45 transition group"
            >
              <div className="w-12 h-12 rounded-xl bg-[var(--color-surface-0)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-brand-600)] group-hover:bg-[var(--color-brand-600)] group-hover:text-white transition duration-300 shadow-sm">
                <step.icon className="w-5 h-5" />
              </div>
              <h3 className="font-display text-xl font-bold mt-5 text-[var(--color-text-primary)]">
                {step.title}
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mt-3">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--color-border)] py-8 bg-[var(--color-surface-50)]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo compact className="h-7 w-7" />
            <span className="text-xs text-[var(--color-text-secondary)] font-semibold">
              RAGLens — Open-Source AI Knowledge Platform
            </span>
          </div>
          <span className="text-xs text-[var(--color-text-muted)] font-mono">
            v0.1.0
          </span>
        </div>
      </footer>
    </main>
  );
}
