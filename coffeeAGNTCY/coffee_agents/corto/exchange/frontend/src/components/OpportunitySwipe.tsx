import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ThumbsDown, ThumbsUp, Link2, Loader2 } from "lucide-react";
import { useEffect } from "react";
import {
  candidateListInterviews,
  candidateRespondToInterview,
  type CandidateInterviewItem,
  type CandidateInterviewsResponse,
} from "../api";
import { cn } from "../utils";

export function OpportunitySwipe() {
  const [data, setData] = useState<CandidateInterviewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [responding, setResponding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await candidateListInterviews();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (data === null && !loading) load();
  }, []);

  const handleSwipe = async (item: CandidateInterviewItem, interested: boolean) => {
    setResponding(item.job_candidate_id);
    setError(null);
    try {
      await candidateRespondToInterview(item.job_candidate_id, interested);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setResponding(null);
    }
  };

  if (data === null && !loading) {
    return (
      <div className="rounded-2xl border border-surface-600 bg-surface-800/80 p-8 text-center">
        <p className="text-zinc-400">Load your opportunities to swipe.</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="mt-4 rounded-lg bg-accent-blue/20 px-4 py-2 text-sm font-medium text-accent-blue hover:bg-accent-blue/30"
        >
          Load opportunities
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-surface-600 bg-surface-800/80 p-12">
        <Loader2 className="h-10 w-10 animate-spin text-accent-blue" />
      </div>
    );
  }

  const open = data?.open ?? [];
  const history = data?.history ?? [];

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {open.length > 0 && (
        <div className="rounded-2xl border border-surface-600 bg-surface-800/80 overflow-hidden">
          <div className="border-b border-surface-600 px-5 py-4">
            <h3 className="font-semibold text-zinc-100">Open opportunities</h3>
            <p className="text-sm text-zinc-400">Swipe right if interested to get your interview link</p>
          </div>
          <div className="divide-y divide-surface-600">
            {open.map((item) => (
              <OpportunityCard
                key={item.job_candidate_id}
                item={item}
                onSwipe={handleSwipe}
                responding={responding === item.job_candidate_id}
              />
            ))}
          </div>
        </div>
      )}

      {open.length === 0 && (
        <div className="rounded-2xl border border-surface-600 bg-surface-800/80 p-8 text-center">
          <p className="text-zinc-400">No open opportunities. When employers publish jobs matching your profile, they will appear here.</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-2xl border border-surface-600 bg-surface-800/80 overflow-hidden">
          <div className="border-b border-surface-600 px-5 py-4">
            <h3 className="font-semibold text-zinc-100">History</h3>
          </div>
          <ul className="divide-y divide-surface-600">
            {history.map((item) => (
              <li key={item.job_candidate_id} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-200">{item.job_title}</span>
                  <span className="text-sm text-zinc-500">{item.status ?? "—"}</span>
                </div>
                {item.interview_link_token && item.candidate_decision === "interested" && (
                  <a
                    href={`${typeof window !== "undefined" ? window.location.origin : ""}/interview?token=${item.interview_link_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-sm text-accent-cyan hover:underline"
                  >
                    <Link2 className="h-4 w-4" />
                    Open interview link
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OpportunityCard({
  item,
  onSwipe,
  responding,
}: {
  item: CandidateInterviewItem;
  onSwipe: (item: CandidateInterviewItem, interested: boolean) => void;
  responding: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const interviewLink = item.interview_link_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/interview?token=${item.interview_link_token}`
    : null;

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-zinc-100">{item.job_title}</h4>
          {item.description_md && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="mt-1 text-sm text-zinc-400 hover:text-zinc-200"
              >
                {expanded ? "Hide description" : "Show description"}
              </button>
              {expanded && (
                <div className="mt-2 rounded-lg bg-surface-850 p-4 prose prose-invert max-w-none text-sm">
                  <ReactMarkdown>{item.description_md}</ReactMarkdown>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onSwipe(item, false)}
            disabled={responding}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border-2 border-red-500/50 text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            )}
            title="Not interested"
          >
            <ThumbsDown className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onSwipe(item, true)}
            disabled={responding}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border-2 border-accent-emerald/50 text-accent-emerald transition-colors hover:bg-accent-emerald/20 disabled:opacity-50"
            )}
            title="Interested"
          >
            {responding ? <Loader2 className="h-5 w-5 animate-spin" /> : <ThumbsUp className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {interviewLink && (
        <div className="mt-3 rounded-lg bg-accent-cyan/10 px-4 py-2">
          <p className="text-sm font-medium text-accent-cyan">Your interview link (also sent by email):</p>
          <a
            href={interviewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block truncate text-sm text-accent-cyan hover:underline"
          >
            {interviewLink}
          </a>
        </div>
      )}
    </div>
  );
}
