import { useState, useEffect } from "react";
import { interviewJoin, type InterviewJoinResponse } from "../api";
import { Loader2, ExternalLink } from "lucide-react";

export interface InterviewPageProps {
  token: string;
}

export function InterviewPage({ token }: InterviewPageProps) {
  const [data, setData] = useState<InterviewJoinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    interviewJoin(token)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-850">
        <Loader2 className="h-12 w-12 animate-spin text-accent-blue" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-850 p-4">
        <div className="rounded-2xl border border-red-500/30 bg-surface-800 p-8 text-center max-w-md">
          <p className="text-red-400">{error ?? "Invalid or expired interview link."}</p>
          <a href="/" className="mt-4 inline-block text-sm text-accent-cyan hover:underline">Back to Corto</a>
        </div>
      </div>
    );
  }

  const interviewUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/interview?token=${token}`;

  return (
    <div className="min-h-screen bg-surface-850/95 bg-grid-pattern bg-[size:64px_64px] p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border border-surface-600 bg-surface-800/90 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-zinc-100">{data.job_title}</h1>
        <p className="mt-2 text-zinc-400">Candidate: {data.candidate_name}</p>
        {data.questions && data.questions.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-zinc-200">Interview questions</h2>
            <ol className="mt-2 list-inside list-decimal space-y-2 text-zinc-300">
              {data.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </div>
        )}
        <div className="mt-8 rounded-lg bg-accent-cyan/10 p-4">
          <p className="text-sm font-medium text-accent-cyan">Use this link to start or continue your interview:</p>
          <a
            href={interviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-2 text-sm text-accent-cyan hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            {interviewUrl}
          </a>
        </div>
        <a href="/" className="mt-6 inline-block text-sm text-zinc-400 hover:text-zinc-200">Back to Corto</a>
      </div>
    </div>
  );
}
