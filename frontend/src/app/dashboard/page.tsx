"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppAuth, useAppUser } from "@/hooks/use-auth";
import { Bot, Database, FileUp, Loader2, MessageSquareText, Send, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";
import { PipelineInspector } from "@/components/chat/pipeline-inspector";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";
import { useSearchParams, useRouter } from "next/navigation";
import type { KnowledgeBase, RetrievalTrace } from "@/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: RetrievalTrace | null;
};

export default function ChatPage() {
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
  const { getToken } = useAppAuth();
  const { user } = useAppUser();
  const { rightPanelOpen, setRightPanelOpen } = useThemeStore();
  const endRef = useRef<HTMLDivElement>(null);

  const selectedKb = useMemo(
    () => knowledgeBases.find((kb) => kb.id === selectedKbId) || null,
    [knowledgeBases, selectedKbId]
  );

  async function loadKnowledgeBases() {
    try {
      const { data } = await apiClient.get("/knowledge-bases");
      const items = data.items || [];
      setKnowledgeBases(items);
      if (!chatId) {
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
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    async function loadConversation() {
      if (chatId) {
        try {
          const { data: convs } = await apiClient.get("/chat/conversations");
          const targetConv = convs.find((c: Record<string, unknown>) => c.id === chatId);
          
          if (targetConv && targetConv.knowledge_base_id) {
            setSelectedKbId(targetConv.knowledge_base_id as string);
            setConversationId(chatId);
            const { data: msgs } = await apiClient.get(`/chat/conversations/${chatId}/messages`);
            const formattedMsgs = msgs.map((m: Record<string, unknown>) => ({
               ...m,
               trace: m.pipeline_trace || m.trace || null
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
        setConversationId(null);
        setMessages([]);
        setSelectedTrace(null);
      }
    }
    
    void loadConversation();
  }, [chatId, router]);

  async function ensureConversation(title: string) {
    if (conversationId) return conversationId;

    const { data } = await apiClient.post("/chat/conversations", {
      title: title.slice(0, 80),
      knowledge_base_id: selectedKbId || null,
    });

    setConversationId(data.id);
    router.replace(`/dashboard?chat=${data.id}`);
    return data.id as string;
  }

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    if (!selectedKbId) {
      toast.error("Please create or select a workspace first.");
      return;
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
      const activeConversationId = await ensureConversation(prompt);
      const token = await getToken();
      const response = await fetch(`/api/v1/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content: prompt,
          knowledge_base_id: selectedKbId,
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
          const eventName = chunk.match(/^event:\s*(.+)$/m)?.[1];
          const dataLine = chunk.match(/^data:\s*(.*)$/m)?.[1] || "{}";
          const payload = JSON.parse(dataLine);

          if (eventName === "trace") {
            setSelectedTrace(payload);
            setRightPanelOpen(true);
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, trace: payload } : message
              )
            );
          }

          if (eventName === "token") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}${payload.token}` }
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
                  <motion.button
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

                      {message.role === "assistant" && message.trace ? (
                        <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
                          {message.trace.total_latency_ms}ms · {message.trace.retrieved_chunks.length} sources used
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
                  </motion.button>
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
              <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                <Database className="h-3.5 w-3.5" />
                <select
                  value={selectedKbId}
                  onChange={(event) => {
                    setSelectedKbId(event.target.value);
                    setConversationId(null);
                    setSelectedTrace(null);
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
