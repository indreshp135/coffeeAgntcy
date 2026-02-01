import { useCallback, useState, useEffect } from "react";
import { Plus, List, Loader2, Send, Sparkles } from "lucide-react";
import { JDEditor } from "./JDEditor";
import {
  employerCreateJob,
  employerGenerateJd,
  employerListJobs,
  employerGetJob,
  employerUpdateJob,
  employerPublishJob,
  type JobSummary,
} from "../api";
import { cn } from "../utils";

export function EmployerPortal() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<"create" | "list">("create");
  const [title, setTitle] = useState("");
  const [descriptionMd, setDescriptionMd] = useState("");
  const [generatedSchema, setGeneratedSchema] = useState<unknown>(null);
  const [createPrompt, setCreatePrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [publishingId, setPublishingId] = useState<number | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const list = await employerListJobs();
      setJobs(list);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleGenerateJd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createPrompt.trim()) return;
    setGenerating(true);
    try {
      const res = await employerGenerateJd(createPrompt.trim());
      setTitle(res.title);
      setDescriptionMd(res.description_md);
      setGeneratedSchema(res.job_description);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await employerCreateJob(title.trim(), descriptionMd, generatedSchema ?? undefined);
      setTitle("");
      setDescriptionMd("");
      setGeneratedSchema(null);
      await loadJobs();
      setSection("list");
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handlePublish = async (id: number) => {
    setPublishingId(id);
    try {
      await employerPublishJob(id);
      await loadJobs();
    } catch (err) {
      console.error(err);
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap gap-2 border-b border-surface-600 pb-4">
        <button
          type="button"
          onClick={() => setSection("create")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            section === "create" ? "bg-accent-blue/20 text-accent-blue" : "text-zinc-400 hover:bg-surface-700 hover:text-zinc-200"
          )}
        >
          <Plus className="h-4 w-4" />
          New job
        </button>
        <button
          type="button"
          onClick={() => setSection("list")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            section === "list" ? "bg-accent-blue/20 text-accent-blue" : "text-zinc-400 hover:bg-surface-700 hover:text-zinc-200"
          )}
        >
          <List className="h-4 w-4" />
          My jobs
        </button>
      </div>

      {section === "create" && (
        <div className="rounded-2xl border border-surface-600 bg-surface-800/80 overflow-hidden">
          <div className="border-b border-surface-600 px-5 py-4">
            <h2 className="font-semibold text-zinc-100">Post a job</h2>
            <p className="text-sm text-zinc-400">Enter title and job description (Markdown). We extract skills and notify top 5 candidates.</p>
          </div>
          <form onSubmit={handleCreateJob} className="p-5 space-y-4">
            <div className="rounded-xl border border-surface-600 bg-surface-850/80 p-4 space-y-3">
              <div className="flex items-center gap-2 text-accent-amber/90">
                <Sparkles className="h-5 w-5" />
                <span className="font-medium text-zinc-200">Generate with AI</span>
              </div>
              <p className="text-sm text-zinc-400">
                Describe the role in a few words (e.g. &quot;Senior Python backend, remote, fintech&quot;) and we&apos;ll draft the full JD.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleGenerateJd(e as unknown as React.FormEvent))}
                  placeholder="e.g. Senior Backend Engineer, remote, 5+ years Python, AWS"
                  className="flex-1 rounded-lg border border-surface-600 bg-surface-800 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-amber/50 focus:outline-none focus:ring-1 focus:ring-accent-amber/30"
                  disabled={generating}
                />
                <button
                  type="button"
                  onClick={(e) => handleGenerateJd(e as unknown as React.FormEvent)}
                  disabled={generating || !createPrompt.trim()}
                  className="rounded-lg bg-accent-amber/20 px-4 py-2.5 text-sm font-medium text-accent-amber hover:bg-accent-amber/30 disabled:opacity-60 flex items-center gap-2"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generating ? "Generating…" : "Generate"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Job title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setGeneratedSchema(null);
                }}
                required
                placeholder="e.g. Senior Backend Engineer"
                className="mt-1 w-full rounded-lg border border-surface-600 bg-surface-850 px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Job description (Markdown)</label>
              <JDEditor
                value={descriptionMd}
                onChange={(v) => {
                  setDescriptionMd(v);
                  setGeneratedSchema(null);
                }}
                className="mt-1"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-accent-cyan/20 px-4 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/30 disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create job (draft)"}
            </button>
          </form>
        </div>
      )}

      {section === "list" && (
        <div className="rounded-2xl border border-surface-600 bg-surface-800/80 overflow-hidden">
          <div className="border-b border-surface-600 px-5 py-4">
            <h2 className="font-semibold text-zinc-100">My jobs</h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent-blue" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">No jobs yet. Create one above.</div>
          ) : (
            <ul className="divide-y divide-surface-600">
              {jobs.map((job) => (
                <li key={job.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setSelectedId(job.id)}
                        className="text-left font-medium text-zinc-100 hover:text-accent-cyan hover:underline"
                      >
                        {job.title}
                      </button>
                      <p className="text-sm text-zinc-500">
                        {job.status} · {new Date(job.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {job.status === "draft" && (
                        <button
                          type="button"
                          onClick={() => handlePublish(job.id)}
                          disabled={publishingId === job.id}
                          className="flex items-center gap-2 rounded-lg bg-accent-emerald/20 px-4 py-2 text-sm font-medium text-accent-emerald hover:bg-accent-emerald/30 disabled:opacity-60"
                        >
                          {publishingId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Publish
                        </button>
                      )}
                      {job.status === "published" && (
                        <span className="text-sm text-accent-emerald">Published</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selectedId !== null && (
        <JobDetailModal
          jobId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={loadJobs}
        />
      )}
    </div>
  );
}

function JobDetailModal({
  jobId,
  onClose,
  onUpdated,
}: {
  jobId: number;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [job, setJob] = useState<{ id: number; title: string; description_md: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    employerGetJob(jobId).then(setJob).finally(() => setLoading(false));
  }, [jobId]);

  if (loading || !job) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="rounded-2xl border border-surface-600 bg-surface-800 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-accent-blue" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl border border-surface-600 bg-surface-800 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-100">{job.title}</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-200">×</button>
        </div>
        <p className="text-sm text-zinc-500 mb-2">Status: {job.status}</p>
        <div className="prose prose-invert max-w-none text-sm text-zinc-300 whitespace-pre-wrap">
          {job.description_md || "—"}
        </div>
      </div>
    </div>
  );
}
