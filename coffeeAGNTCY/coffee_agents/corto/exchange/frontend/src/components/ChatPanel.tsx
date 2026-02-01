import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Loader2, User, Bot } from "lucide-react";
import { cn } from "../utils";
import type { Message } from "../types";

export interface ChatPanelProps {
  messages: Message[];
  loading: boolean;
  onSend: (prompt: string) => void;
  jdMarkdown: string;
  onQuickAction: (prompt: string) => void;
  className?: string;
}

export function ChatPanel({
  messages,
  loading,
  onSend,
  jdMarkdown,
  onQuickAction,
  className,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const submit = () => {
    const t = input.trim();
    if (!t || loading) return;
    onSend(t);
    setInput("");
  };

  const quickActions = [
    {
      label: "Best match for this JD",
      prompt: jdMarkdown
        ? `Who has the maximum match for this job description?\n\n${jdMarkdown}`
        : null,
    },
    {
      label: "Best candidates + interview questions",
      prompt: jdMarkdown
        ? `I have this job description. Find the best candidates and prepare interview questions for the top one.\n\n${jdMarkdown}`
        : null,
    },
  ];

  return (
    <div
      className={cn(
        "flex min-h-[560px] flex-col rounded-2xl border border-surface-600 bg-surface-800/80 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-surface-600 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-blue/20 text-accent-blue">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-zinc-100">Chat</h3>
          <p className="text-sm text-zinc-400">Ask for matches, interview prep, or anything else</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-5">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="mb-4 text-sm text-zinc-500">No messages yet.</p>
              <p className="mb-4 text-xs text-zinc-600">
                Add a job description above, then use quick actions or type your request.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {quickActions.map(
                  (a) =>
                    a.prompt && (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => onQuickAction(a.prompt!)}
                        className="rounded-lg border border-surface-600 bg-surface-750 px-4 py-2 text-sm text-zinc-300 hover:border-accent-blue/50 hover:bg-accent-blue/10 hover:text-zinc-100"
                      >
                        {a.label}
                      </button>
                    )
                )}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "mb-4 flex gap-3 animate-fade-in",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {m.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-blue/20 text-accent-blue">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3",
                  m.role === "user"
                    ? "bg-accent-blue/20 text-zinc-100"
                    : "bg-surface-700/80 text-zinc-200"
                )}
              >
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                ) : (
                  <div className="prose prose-invert max-w-none text-sm">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              {m.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-600 text-zinc-400">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="mb-4 flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-blue/20 text-accent-blue">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-surface-700/80 px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-accent-blue" />
                <span className="text-sm text-zinc-400">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-surface-600 p-4">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Type your message or use quick actions above…"
              rows={1}
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-surface-600 bg-surface-850 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-blue/50 focus:outline-none focus:ring-1 focus:ring-accent-blue/30 disabled:opacity-50"
              disabled={loading}
            />
            <button
              type="button"
              onClick={submit}
              disabled={!input.trim() || loading}
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-accent-blue text-white hover:bg-accent-blue/90 disabled:opacity-40 disabled:hover:bg-accent-blue"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
