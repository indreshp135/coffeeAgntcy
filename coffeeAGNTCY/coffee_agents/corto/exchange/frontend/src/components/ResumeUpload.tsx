import { useCallback, useState } from "react";
import { FileUp, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { extractResume } from "../api";
import { cn } from "../utils";

const ALLOWED = [".pdf", ".docx"];
const MAX_MB = 10;

export interface ResumeUploadProps {
  onExtracted: (text: string) => void;
  onIngestClick: (resumeText: string) => void;
  className?: string;
}

export function ResumeUpload({ onExtracted, onIngestClick, className }: ResumeUploadProps) {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  const validate = useCallback((file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED.includes(ext)) return `Use ${ALLOWED.join(" or ")}`;
    if (file.size > MAX_MB * 1024 * 1024) return `Max size ${MAX_MB} MB`;
    return null;
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const err = validate(file);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const { text, filename: name } = await extractResume(file);
        setExtracted(text);
        setFilename(name ?? file.name);
        onExtracted(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Extraction failed");
      } finally {
        setLoading(false);
      }
    },
    [validate, onExtracted]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-surface-600 bg-surface-800/80 backdrop-blur-sm transition-colors",
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-surface-600 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-blue/20 text-accent-blue">
          <FileUp className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-zinc-100">Resume</h3>
          <p className="text-sm text-zinc-400">Upload PDF or DOCX · text is extracted automatically</p>
        </div>
      </div>

      <div className="p-5">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={cn(
            "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all",
            drag ? "border-accent-blue bg-accent-blue/10" : "border-surface-600 bg-surface-750/50 hover:border-surface-500",
            loading && "pointer-events-none opacity-70"
          )}
        >
          <input
            type="file"
            accept={ALLOWED.join(",")}
            className="hidden"
            onChange={onInputChange}
            disabled={loading}
          />
          {loading ? (
            <Loader2 className="h-10 w-10 animate-spin text-accent-blue" />
          ) : (
            <FileUp className="h-10 w-10 text-zinc-500" />
          )}
          <span className="text-sm text-zinc-400">
            {loading ? "Extracting…" : "Drop file here or click to browse"}
          </span>
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {extracted && (
          <div className="mt-4 animate-slide-up">
            <button
              type="button"
              onClick={() => setShowText((s) => !s)}
              className="flex w-full items-center justify-between rounded-lg bg-surface-700/80 px-4 py-3 text-left text-sm font-medium text-zinc-200 hover:bg-surface-700"
            >
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-accent-emerald" />
                {filename ?? "Extracted"}
              </span>
              {showText ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showText && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-surface-850 p-4 font-mono text-xs text-zinc-400 whitespace-pre-wrap">
                {extracted}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onIngestClick(extracted)}
                className="rounded-lg bg-accent-emerald/20 px-4 py-2 text-sm font-medium text-accent-emerald hover:bg-accent-emerald/30"
              >
                Ingest this resume
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
