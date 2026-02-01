import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { FileText, Eye, Edit3 } from "lucide-react";
import { cn } from "../utils";

export interface JDEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function JDEditor({ value, onChange, placeholder, className }: JDEditorProps) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  return (
    <div
      className={cn(
        "rounded-2xl border border-surface-600 bg-surface-800/80 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-surface-600 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-cyan/20 text-accent-cyan">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-100">Job description</h3>
            <p className="text-sm text-zinc-400">Markdown supported</p>
          </div>
        </div>
        <div className="flex rounded-lg bg-surface-750 p-1">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "edit" ? "bg-surface-600 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "preview" ? "bg-surface-600 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        </div>
      </div>

      <div className="p-5">
        {tab === "edit" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              placeholder ??
              "Paste or type the job description in Markdown:\n\n# Senior Backend Engineer\n\n- 5+ years Python\n- AWS, Kubernetes\n..."
            }
            className="min-h-[200px] w-full resize-y rounded-xl border border-surface-600 bg-surface-850 px-4 py-3 font-mono text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/30"
            spellCheck={false}
          />
        ) : (
          <div className="min-h-[200px] rounded-xl border border-surface-600 bg-surface-850 px-4 py-3">
            {value ? (
              <div className="prose prose-invert max-w-none text-sm">
                <ReactMarkdown>{value}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-zinc-500">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
