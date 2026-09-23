"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppAuth, useAppUser } from "@/hooks/use-auth";
import {
  Bot,
  Database,
  ExternalLink,
  FileCheck2,
  FileUp,
  Globe,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";
import { PipelineInspector } from "@/components/chat/pipeline-inspector";
import { apiClient, getErrorMessage, getStreamingApiUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";
import { useSearchParams, useRouter } from "next/navigation";
import type { KnowledgeBase, RetrievalTrace } from "@/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: RetrievalTrace | null;
  image_paths?: string[];
  streamingStatus?: boolean;
};

type AnswerMode = "strict" | "normal";

function imagePathsFromCitations(citations: unknown): string[] {
  if (!Array.isArray(citations)) return [];

  return Array.from(
    new Set(
      citations.flatMap((citation) => {
        if (!citation || typeof citation !== "object") return [];
        const paths = (citation as { image_paths?: unknown }).image_paths;
        return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string" && path.length > 0) : [];
      })
    )
  );
}

function CitationImage({ path, alt }: { path: string; alt: string }) {
  const { getToken } = useAppAuth();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function loadImage() {
      try {
        const token = await getToken();
        const response = await fetch(
          getStreamingApiUrl(`/documents/image?path=${encodeURIComponent(path)}`),
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        if (!response.ok) throw new Error(`Image request failed (${response.status})`);

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      } catch {
        // A missing/removed source image should not break the whole answer card.
      }
    }

    void loadImage();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [getToken, path]);

  if (!src) return null;

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] transition hover:opacity-90"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-32 w-full object-cover" />
    </a>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const chatId = searchParams?.get("chat");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<RetrievalTrace | null>(null);
  const [answerMode, setAnswerMode] = useState<AnswerMode>("strict");
  const { getToken } = useAppAuth();
  const { user } = useAppUser();
  const { rightPanelOpen, setRightPanelOpen } = useThemeStore();
  const endRef = useRef<HTMLDivElement>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  const selectedKb = useMemo(
    () => knowledgeBases.find((kb) => kb.id === selectedKbId) || null,
    [knowledgeBases, selectedKbId]
  );

  async function loadKnowledgeBases() {
    try {
      const { data } = await apiClient.get("/knowledge-bases");
      const items = data.items || [];
      setKnowledgeBases(items);
      if (!chatId && items.length > 0) {
        setSelectedKbId((current) => current || items[0]?.id || "");
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  useEffect(() => {
    setTimeout(() => {
      void loadKnowledgeBases();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    async function loadConversation() {
      if (chatId) {
        // Prevent re-fetching and wiping out active streaming messages on the first question
        if (activeConversationIdRef.current === chatId) {
          return;
        }
        activeConversationIdRef.current = chatId;

        try {
          const { data: convs } = await apiClient.get("/chat/conversations");
          const targetConv = convs.find((c: Record<string, unknown>) => c.id === chatId);
          
          if (targetConv) {
            if (targetConv.knowledge_base_id) {
              setSelectedKbId(targetConv.knowledge_base_id as string);
            }
            setConversationId(chatId);
            const { data: msgs } = await apiClient.get(`/chat/conversations/${chatId}/messages`);
            const formattedMsgs = msgs.map((m: Record<string, unknown>) => ({
              ...m,
              trace: m.pipeline_trace || m.trace || null,
              // Citations are persisted with the assistant message. Rebuild the
              // render-only image list when an existing chat is opened.
              image_paths: imagePathsFromCitations(m.citations),
            }));
            setMessages(formattedMsgs as ChatMessage[]);
            
            const lastAssistantMsg = formattedMsgs.slice().reverse().find((m: Record<string, unknown>) => m.role === "assistant" && m.trace);
            if (lastAssistantMsg) {
              setSelectedTrace(lastAssistantMsg.trace as RetrievalTrace);
            }
          } else {
             router.replace("/dashboard");
          }
        } catch (error) {
          console.error("Failed to load specific conversation", error);
        }
      } else {
        activeConversationIdRef.current = null;
        setConversationId(null);
        setMessages([]);
        setSelectedTrace(null);
      }
    }
    
    void loadConversation();
  }, [chatId, router]);

  async function ensureConversation(title: string, kbId: string) {
    if (conversationId) return conversationId;

    const { data } = await apiClient.post("/chat/conversations", {
      title: title.slice(0, 80),
      knowledge_base_id: kbId || null,
    });

    activeConversationIdRef.current = data.id;
    setConversationId(data.id);
    router.replace(`/dashboard?chat=${data.id}`);
    return data.id as string;
  }

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    let kbToUse = selectedKbId;
    if (!kbToUse && knowledgeBases.length > 0) {
      kbToUse = knowledgeBases[0].id;
      setSelectedKbId(kbToUse);
    }

    const assistantId = crypto.randomUUID();

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: prompt },
      { id: assistantId, role: "assistant", content: "", trace: null },
    ]);
    setInput("");
    setIsStreaming(true);

    try {
      const activeConversationId = await ensureConversation(prompt, kbToUse);
      const token = await getToken();
      const response = await fetch(getStreamingApiUrl(`/chat/conversations/${activeConversationId}/messages`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content: prompt,
          knowledge_base_id: kbToUse || null,
          answer_mode: answerMode,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          // Skip SSE keepalive comment lines (e.g. ": keepalive")
          if (chunk.trim().startsWith(":")) continue;

          const eventName = chunk.match(/^event:\s*(.+)$/m)?.[1];
          const dataLine = chunk.match(/^data:\s*(.*)$/m)?.[1] || "{}";

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(dataLine);
          } catch {
            continue; // skip malformed lines
          }

          if (eventName === "trace") {
            setSelectedTrace(payload as unknown as RetrievalTrace);
            setRightPanelOpen(true);
            // Extract any image paths from citations in trace
            const traceCitations = (payload as Record<string, unknown[]>).citations ?? [];
            const allImages = imagePathsFromCitations(traceCitations);
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, trace: payload as unknown as RetrievalTrace, image_paths: allImages }
                  : message
              )
            );
          }

          if (eventName === "status") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: (payload as { message?: string }).message ?? "Preparing your answer...",
                      streamingStatus: true,
                    }
                  : message
              )
            );
          }

          if (eventName === "token") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: message.streamingStatus
                        ? (payload as { token?: string }).token ?? ""
                        : `${message.content}${(payload as { token?: string }).token ?? ""}`,
                      streamingStatus: false,
                    }
                  : message
              )
            );
          }
        }
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: "Something went wrong. Please try again, or check that your files have finished uploading.",
              }
            : message
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-3xl text-center">
                <motion.div
                  className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-brand-600)] text-white"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <MessageSquareText className="h-8 w-8" />
                </motion.div>

                <h2 className="font-display text-3xl font-bold text-[var(--color-text-primary)]">
                  Chat with your files
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[var(--color-text-secondary)]">
                  Pick a workspace, ask anything, and get answers straight from your documents — with sources shown for every reply.
                </p>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <Link
                    href="/dashboard/knowledge"
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-5 text-left shadow-sm"
                  >
                    <Database className="h-5 w-5 text-[var(--color-brand-600)]" />
                    <p className="mt-4 font-semibold text-[var(--color-text-primary)]">
                      Create a workspace
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      Group your files by topic, project, or team.
                    </p>
                  </Link>

                  <Link
                    href="/dashboard/documents"
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-5 text-left shadow-sm"
                  >
                    <FileUp className="h-5 w-5 text-[var(--color-brand-600)]" />
                    <p className="mt-4 font-semibold text-[var(--color-text-primary)]">
                      Upload your files
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      Add PDFs, Word docs, spreadsheets and more.
                    </p>
                  </Link>

                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-5 text-left shadow-sm">
                    <Zap className="h-5 w-5 text-[var(--color-brand-600)]" />
                    <p className="mt-4 font-semibold text-[var(--color-text-primary)]">
                      See where answers come from
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      Click any reply to see which documents were used.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              <AnimatePresence>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => {
                      if (message.trace) {
                        setSelectedTrace(message.trace);
                      }
                    }}
                    className={cn(
                      "flex w-full gap-3 text-left",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" ? (
                      <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] text-white">
                        <Bot className="h-4 w-4" />
                      </div>
                    ) : null}

                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl border px-5 py-4 shadow-sm transition",
                        message.role === "user"
                          ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white"
                          : "border-[var(--color-border)] bg-[var(--color-surface-50)] hover:border-[var(--color-brand-500)]/30"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-content text-sm leading-7">
                          {message.content || (isStreaming ? "Generating answer..." : "")}
                        </ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                      )}

                      {/* Inline images from citations */}
                      {message.role === "assistant" && message.image_paths && message.image_paths.length > 0 ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {message.image_paths.slice(0, 4).map((imgPath, imgIdx) => (
                            <CitationImage
                              key={imgIdx}
                              path={imgPath}
                              alt={`Image from document (page image ${imgIdx + 1})`}
                            />
                          ))}
                        </div>
                      ) : null}

                      {message.role === "assistant" && message.trace ? (
                        <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
                          {message.trace.total_latency_ms}ms · {message.trace.retrieved_chunks.length} sources used
                        </div>
                      ) : null}

                      {message.role === "assistant" && message.trace?.web_sources?.length ? (
                        <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                            <Globe className="h-3.5 w-3.5 text-[var(--color-info)]" />
                            Web sources used for fact-checking
                          </div>
                          <div className="space-y-1.5">
                            {message.trace.web_sources.slice(0, 5).map((source) => (
                              <a
                                key={source.url}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--color-info)] transition hover:bg-[var(--color-surface-100)] hover:underline"
                              >
                                <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                <span className="line-clamp-2">{source.title || source.url}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {message.role === "user" ? (
                      <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-600)] text-xs font-bold text-white">
                        {user?.firstName?.charAt(0)?.toUpperCase() ||
                          user?.fullName?.charAt(0)?.toUpperCase() ||
                          "U"}
                      </div>
                    ) : null}
                  </motion.div>
                ))}
              </AnimatePresence>

              {isStreaming ? (
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              ) : null}

              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-50)]/90 p-4 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] shadow-sm">
            <div className="flex items-end gap-3 p-3.5">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                  placeholder={
                    selectedKb
                      ? `Ask anything about ${selectedKb.name}...`
                      : "Create a folder and upload files first..."
                  }
                rows={1}
                className="min-h-[42px] max-h-[160px] flex-1 resize-none bg-transparent py-2 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isStreaming || !selectedKbId}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition",
                  input.trim() && !isStreaming && selectedKbId
                    ? "bg-[var(--color-brand-600)] text-white"
                    : "bg-[var(--color-surface-100)] text-[var(--color-text-muted)]"
                )}
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-50)] px-4 py-3 text-xs">
              <div className="flex w-full flex-wrap items-center gap-2">
                <span className="mr-1 font-semibold text-[var(--color-text-secondary)]">Answer mode:</span>
                <button
                  type="button"
                  onClick={() => setAnswerMode("strict")}
                  disabled={isStreaming}
                  aria-pressed={answerMode === "strict"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-semibold transition",
                    answerMode === "strict"
                      ? "border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-700)]"
                      : "border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-100)]"
                  )}
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  Document only
                </button>
                <button
                  type="button"
                  onClick={() => setAnswerMode("normal")}
                  disabled={isStreaming}
                  aria-pressed={answerMode === "normal"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-semibold transition",
                    answerMode === "normal"
                      ? "border-purple-500/20 bg-purple-500/10 text-purple-400"
                      : "border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-100)]"
                  )}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Global AI
                </button>
                <span className="hidden text-[var(--color-text-muted)] sm:inline">
                  {answerMode === "strict"
                    ? "Use only the selected document"
                    : "Free-form AI — draws on its own global knowledge"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                <Database className="h-3.5 w-3.5" />
                <select
                  value={selectedKbId}
                  onChange={(event) => {
                    setSelectedKbId(event.target.value);
                    setConversationId(null);
                    setMessages([]);
                    setSelectedTrace(null);
                    router.push("/dashboard");
                  }}
                  className="bg-transparent outline-none"
                >
                  {knowledgeBases.length === 0 ? (
                    <option value="">No workspaces yet</option>
                  ) : (
                    knowledgeBases.map((kb) => (
                      <option key={kb.id} value={kb.id}>
                        {kb.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="text-[var(--color-text-muted)]">
                {selectedKb ? "Answers come from the files in your selected workspace." : "Upload files to start chatting."}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {rightPanelOpen ? (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="hidden overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-surface-50)] md:block"
          >
            <PipelineInspector trace={selectedTrace} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
// Wrap in Suspense because useSearchParams() requires it in Next.js App Router
export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-brand-600)]" />
      </div>
    }>
      <ChatPageInner />
    </Suspense>
  );
}
