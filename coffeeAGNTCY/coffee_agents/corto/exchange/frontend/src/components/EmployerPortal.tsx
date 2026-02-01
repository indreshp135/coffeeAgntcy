import { useCallback, useState, useEffect } from "react";
import { Plus, List, Loader2, Send, Sparkles, X, FileText, Calendar, ChevronRight } from "lucide-react";
import { JDEditor } from "./JDEditor";
import {
  employerCreateJob,
  employerGenerateJd,
  employerListJobs,
  employerGetJob,
  employerPublishJob,
  employerFinalizeJob,
  type JobSummary,
} from "../api";
import { cn } from "../utils";

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "employer-portal-status-pill capitalize",
        status === "draft" && "employer-portal-status-draft",
        status === "published" && "employer-portal-status-published",
        status === "closed" && "employer-portal-status-closed"
      )}
    >
      {status}
    </span>
  );
}

function EmployerPortal() {
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
  const [finalizingId, setFinalizingId] = useState<number | null>(null);

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

  const handleGenerateJd = useCallback(async () => {
    const prompt = createPrompt.trim();
    if (!prompt) return;
    setGenerating(true);
    try {
      const res = await employerGenerateJd(prompt);
      setTitle(res.title);
      setDescriptionMd(res.description_md);
      setGeneratedSchema(res.job_description);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }, [createPrompt]);

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

  const handleFinalize = async (id: number) => {
    setFinalizingId(id);
    try {
      const res = await employerFinalizeJob(id);
      await loadJobs();
      alert(`Job finalized. Top 3: ${res.top_3.join(", ") || "—"}`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Finalize failed");
    } finally {
      setFinalizingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-20">
      {/* Navigation — elegant underline tabs */}
      <nav className="flex flex-wrap gap-x-1 gap-y-2 border-b border-white/[0.06] pb-px" aria-label="Employer portal sections">
        {[
          { id: "create" as const, label: "New job", icon: Plus },
          { id: "list" as const, label: "My jobs", icon: List },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
              "employer-portal-nav-item flex items-center gap-2.5 px-5 py-4",
              section === id && "active"
            )}
          >
            <Icon className={cn("h-4 w-4 transition-colors", section === id ? "text-amber-400/90" : "text-zinc-500")} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-10 space-y-10">
        {section === "create" && (
          <>
            {/* AI Generate — premium card */}
            <article className="employer-portal-card overflow-hidden animate-slide-up">
              <header className="border-b border-white/[0.06] px-6 sm:px-8 py-6 flex flex-wrap items-center gap-4 bg-gradient-to-r from-amber-500/5 via-transparent to-cyan-500/5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/20 text-amber-400/90 ring-1 ring-amber-400/20">
                  <Sparkles className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="employer-portal-section-title">Generate with AI</h2>
                  <p className="mt-0.5 text-sm text-zinc-500 font-normal">
                    Describe the role in a few words and we&apos;ll draft the full job description.
                  </p>
                </div>
              </header>
              <div className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={createPrompt}
                    onChange={(e) => setCreatePrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleGenerateJd();
                      }
                    }}
                    placeholder="e.g. Senior Backend Engineer, remote, 5+ years Python, AWS"
                    className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/20 transition-colors"
                    disabled={generating}
                    aria-label="Prompt for AI job description"
                  />
                  <button
                    type="button"
                    onClick={() => void handleGenerateJd()}
                    disabled={generating || !createPrompt.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/20 px-5 py-3 text-sm font-medium text-amber-300 ring-1 ring-amber-400/25 hover:from-amber-500/30 hover:to-amber-600/30 hover:ring-amber-400/35 disabled:opacity-50 disabled:pointer-events-none transition-all shrink-0"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {generating ? "Generating…" : "Generate"}
                  </button>
                </div>
              </div>
            </article>

            {/* Post a job — premium card */}
            <article className="employer-portal-card overflow-hidden animate-slide-up">
              <header className="border-b border-white/[0.06] px-6 sm:px-8 py-6 flex flex-wrap items-center gap-4 bg-gradient-to-r from-cyan-500/5 via-transparent to-transparent">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-cyan-600/20 text-cyan-400 ring-1 ring-cyan-400/20">
                  <FileText className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="employer-portal-section-title">Post a job</h2>
                  <p className="mt-0.5 text-sm text-zinc-500 font-normal">
                    Enter title and job description (Markdown). Use AI above to draft one, or paste your own.
                  </p>
                </div>
              </header>
              <form onSubmit={handleCreateJob} className="p-6 sm:p-8 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 tracking-wide mb-2">Job title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setGeneratedSchema(null);
                    }}
                    required
                    placeholder="e.g. Senior Backend Engineer"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 tracking-wide mb-2">Job description (Markdown)</label>
                  <JDEditor
                    value={descriptionMd}
                    onChange={(v) => {
                      setDescriptionMd(v);
                      setGeneratedSchema(null);
                    }}
                    className="mt-0"
                  />
                </div>
                <div className="employer-portal-divider my-6" aria-hidden />
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-cyan-600/20 px-5 py-3 text-sm font-medium text-cyan-300 ring-1 ring-cyan-400/25 hover:from-cyan-500/30 hover:to-cyan-600/30 hover:ring-cyan-400/35 disabled:opacity-50 disabled:pointer-events-none transition-all"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {creating ? "Creating…" : "Create job (draft)"}
                </button>
              </form>
            </article>
          </>
        )}

        {section === "list" && (
          <article className="employer-portal-card overflow-hidden animate-slide-up">
            <header className="border-b border-white/[0.06] px-6 sm:px-8 py-6">
              <h2 className="employer-portal-section-title">My jobs</h2>
              <p className="mt-0.5 text-sm text-zinc-500 font-normal">Manage drafts, publish, and finalize positions.</p>
            </header>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
                <p className="text-sm text-zinc-500">Loading jobs…</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] text-zinc-600 mb-4">
                  <List className="h-8 w-8" />
                </div>
                <p className="text-zinc-400 font-medium">No jobs yet</p>
                <p className="mt-1 text-sm text-zinc-500 max-w-sm">Create your first job in the &quot;New job&quot; tab to get started.</p>
                <button
                  type="button"
                  onClick={() => setSection("create")}
                  className="mt-6 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition-colors"
                >
                  New job
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="group px-6 sm:px-8 py-5 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setSelectedId(job.id)}
                          className="text-left font-semibold text-zinc-100 hover:text-cyan-400 transition-colors flex items-center gap-2 w-full"
                        >
                          <span className="truncate">{job.title}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400/80" />
                        </button>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm">
                          <StatusPill status={job.status} />
                          <span className="flex items-center gap-1.5 text-zinc-500">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(job.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {job.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => handlePublish(job.id)}
                            disabled={publishingId === job.id}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-400 ring-1 ring-emerald-500/25 hover:bg-emerald-500/25 hover:ring-emerald-500/35 disabled:opacity-50 disabled:pointer-events-none transition-all"
                          >
                            {publishingId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Publish
                          </button>
                        )}
                        {job.status === "published" && (
                          <button
                            type="button"
                            onClick={() => handleFinalize(job.id)}
                            disabled={finalizingId === job.id}
                            className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm font-medium text-amber-300 ring-1 ring-amber-500/25 hover:bg-amber-500/25 hover:ring-amber-500/35 disabled:opacity-50 disabled:pointer-events-none transition-all"
                          >
                            {finalizingId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Finalize
                          </button>
                        )}
                        {job.status === "closed" && (
                          <span className="text-sm text-zinc-500 italic">Closed</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}
      </div>

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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="rounded-2xl border border-white/[0.08] bg-surface-800/95 shadow-2xl p-10" onClick={(e) => e.stopPropagation()}>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-800/95 shadow-2xl shadow-black/40 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 sm:px-8 py-6 shrink-0">
          <div>
            <h3 className="font-serif text-xl font-semibold tracking-tight text-zinc-100">{job.title}</h3>
            <div className="mt-2">
              <StatusPill status={job.status} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="overflow-y-auto flex-1 px-6 sm:px-8 py-6">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Description</p>
          <div className="prose prose-invert max-w-none text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {job.description_md || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

export { EmployerPortal };
export default EmployerPortal;
