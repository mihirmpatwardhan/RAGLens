"use client";

import { motion } from "framer-motion";
import { Sparkles, Code, History, Play, Save, RotateCcw, Copy, Eye } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const PROMPT_TEMPLATES = [
  { id: "system", label: "System Prompt", icon: "🧠", active: true },
  { id: "retriever", label: "Retriever Prompt", icon: "🔍", active: false },
  { id: "rewrite", label: "Query Rewrite", icon: "✏️", active: false },
  { id: "compress", label: "Compression", icon: "📦", active: false },
  { id: "answer", label: "Answer Prompt", icon: "💬", active: false },
  { id: "agent", label: "Agent Prompts", icon: "🤖", active: false },
];

const DEFAULT_SYSTEM_PROMPT = `You are RAGLense, an advanced AI knowledge assistant.

## Instructions
- Answer questions based on the provided context from the knowledge base.
- Always cite your sources with specific document names and page numbers.
- If the context doesn't contain enough information, say so clearly.
- Use markdown formatting for structured responses.
- Be concise but thorough.

## Context
{context}

## User Question
{question}

## Response Guidelines
1. Start with a direct answer
2. Provide supporting details from the sources
3. Include citations in [Source: document, page] format
4. If uncertain, express confidence level`;

export default function PromptsPage() {
  const [activePrompt, setActivePrompt] = useState("system");
  const [promptContent, setPromptContent] = useState(DEFAULT_SYSTEM_PROMPT);

  return (
    <div className="h-full flex">
      {/* Prompt List */}
      <div className="w-60 border-r border-[var(--color-border)] bg-[var(--color-surface-50)]/50 p-4 space-y-1 flex-shrink-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] px-3 mb-4">
          Prompt Templates
        </h3>
        <div className="space-y-1">
          {PROMPT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setActivePrompt(tpl.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left font-medium text-sm group",
                activePrompt === tpl.id
                  ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] border-l-2 border-[var(--color-brand-500)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-200)]"
              )}
            >
              <span className="text-base group-hover:scale-110 transition-transform">{tpl.icon}</span>
              <span>{tpl.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--color-surface-0)]/20">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold font-display">System Prompt</h3>
            <span className="px-2 py-0.5 rounded-md bg-[var(--color-brand-500)]/15 text-[10px] font-bold text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20">
              v3.2
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { icon: History, label: "History" },
              { icon: Eye, label: "Preview" },
              { icon: Copy, label: "Copy" },
            ].map((btn) => (
              <button
                key={btn.label}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-200)] transition-all font-medium"
              >
                <btn.icon className="w-3.5 h-3.5" />
                {btn.label}
              </button>
            ))}
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold btn-primary btn-shimmer"
            >
              <Save className="w-3.5 h-3.5" />
              Save Changes
            </motion.button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 p-6">
          <textarea
            value={promptContent}
            onChange={(e) => setPromptContent(e.target.value)}
            className="w-full h-full bg-[var(--color-surface-100)]/70 border border-[var(--color-border)] rounded-xl p-5 text-sm font-mono text-[var(--color-text-secondary)] leading-relaxed resize-none focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)] outline-none input-glow transition-all"
            spellCheck={false}
          />
        </div>

        {/* Bottom Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-50)]/50">
          <div className="flex items-center gap-5">
            <span>
              <strong className="text-[var(--color-text-secondary)]">{promptContent.length}</strong> characters
            </span>
            <span>
              <strong className="text-[var(--color-text-secondary)]">{promptContent.split(/\s+/).filter(Boolean).length}</strong> words
            </span>
            <span className="flex items-center gap-1.5">
              Variables:{" "}
              <code className="px-1.5 py-0.5 rounded bg-[var(--color-surface-300)] text-[var(--color-brand-400)] font-mono text-[10px]">
                {"{context}"}
              </code>
              <code className="px-1.5 py-0.5 rounded bg-[var(--color-surface-300)] text-[var(--color-brand-400)] font-mono text-[10px]">
                {"{question}"}
              </code>
            </span>
          </div>
          <span className="font-mono">Last saved: 2m ago</span>
        </div>
      </div>
    </div>
  );
}
