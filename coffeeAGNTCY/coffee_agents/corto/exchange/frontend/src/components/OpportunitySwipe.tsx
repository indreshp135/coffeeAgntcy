import { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { ThumbsDown, ThumbsUp, Link2, Loader2 } from "lucide-react";
import {
  candidateListInterviews,
  candidateRespondToInterview,
  type CandidateInterviewItem,
  type CandidateInterviewsResponse,
} from "../api";
import { cn } from "../utils";

const SWIPE_THRESHOLD = 80;
const MAX_DRAG_ROTATION = 12;

export function OpportunitySwipe() {
  const [data, setData] = useState<CandidateInterviewsResponse | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [responding, setResponding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await candidateListInterviews();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSwipe = useCallback(
    async (item: CandidateInterviewItem, interested: boolean) => {
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
    },
    [load]
  );

  if (data === undefined && !loading) {
    return (
      <article className="candidate-portal-card overflow-hidden p-10 text-center">
        <p className="text-zinc-500">Load your opportunities to swipe.</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="mt-5 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/10 hover:text-zinc-200 transition-all"
        >
          Load opportunities
        </button>
      </article>
    );
  }

  if (loading && !data) {
    return (
      <article className="candidate-portal-card flex items-center justify-center p-16">
        <div className="h-12 w-12 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
      </article>
    );
  }

  const open = data?.open ?? [];
  const history = data?.history ?? [];

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400/90" role="alert">
          {error}
        </p>
      )}

      {open.length > 0 && (
        <article className="candidate-portal-card overflow-hidden">
          <header className="border-b border-white/[0.06] px-6 sm:px-8 py-5">
            <h3 className="candidate-portal-section-title">Open opportunities</h3>
            <p className="mt-1 text-sm text-zinc-500 font-normal">
              Swipe right if interested, left to pass · Like Tinder for jobs
            </p>
          </header>
          <div className="p-6 sm:p-8">
            <SwipeableStack
              items={open}
              onSwipe={handleSwipe}
              respondingId={responding}
            />
          </div>
        </article>
      )}

      {open.length === 0 && !loading && (
        <article className="candidate-portal-card p-10 text-center">
          <p className="text-zinc-500">
            No open opportunities. When employers publish jobs matching your profile, they will appear here.
          </p>
        </article>
      )}

      {history.length > 0 && (
        <article className="candidate-portal-card overflow-hidden">
          <header className="border-b border-white/[0.06] px-6 sm:px-8 py-6">
            <h3 className="candidate-portal-section-title">History</h3>
          </header>
          <ul className="divide-y divide-white/[0.06]">
            {history.map((item) => (
              <li key={item.job_candidate_id} className="px-6 sm:px-8 py-5">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-zinc-200">{item.job_title}</span>
                  <span className="text-sm text-zinc-500 shrink-0">{item.status ?? "—"}</span>
                </div>
                {item.interview_link_token && item.candidate_decision === "interested" && (
                  <a
                    href={`${typeof window !== "undefined" ? window.location.origin : ""}/interview?token=${item.interview_link_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-sm text-accent-cyan hover:underline"
                  >
                    <Link2 className="h-4 w-4" strokeWidth={1.75} />
                    Open interview link
                  </a>
                )}
              </li>
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}

function SwipeableStack({
  items,
  onSwipe,
  respondingId,
}: {
  items: CandidateInterviewItem[];
  onSwipe: (item: CandidateInterviewItem, interested: boolean) => void;
  respondingId: number | null;
}) {
  const top = items[0];
  const rest = items.slice(1, 4); // up to 3 cards visible behind
  const isDisabled = respondingId !== null;

  if (!top) return null;

  return (
    <div className="relative mx-auto max-w-sm">
      {/* Stack of cards behind the top one */}
      <div className="relative aspect-[3/4] min-h-[380px] w-full max-w-sm mx-auto">
        {rest.map((item, i) => (
          <div
            key={item.job_candidate_id}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              zIndex: rest.length - i,
              top: (i + 1) * 8,
              left: 0,
              right: 0,
              transform: `scale(${1 - (i + 1) * 0.04})`,
              opacity: 1 - (i + 1) * 0.15,
            }}
          >
            <OpportunityCardContent item={item} isStack />
          </div>
        ))}
        {/* Top (swipeable) card */}
        <SwipeableCard
          item={top}
          onSwipe={onSwipe}
          disabled={isDisabled}
          responding={respondingId === top.job_candidate_id}
          zIndex={10}
        />
      </div>

      {/* Action buttons — Tinder style */}
      <div className="mt-8 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => onSwipe(top, false)}
          disabled={isDisabled}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all",
            "border-red-500/40 text-red-400/90 hover:bg-red-500/15 hover:border-red-500/60 hover:scale-110",
            "active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          )}
          title="Pass"
          aria-label="Pass on this opportunity"
        >
          {respondingId === top.job_candidate_id ? (
            <Loader2 className="h-7 w-7 animate-spin" strokeWidth={1.75} />
          ) : (
            <ThumbsDown className="h-7 w-7" strokeWidth={1.75} />
          )}
        </button>
        <button
          type="button"
          onClick={() => onSwipe(top, true)}
          disabled={isDisabled}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all",
            "border-accent-emerald/50 text-accent-emerald hover:bg-accent-emerald/15 hover:border-accent-emerald/70 hover:scale-110",
            "active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          )}
          title="Interested"
          aria-label="I'm interested"
        >
          {respondingId === top.job_candidate_id ? (
            <Loader2 className="h-7 w-7 animate-spin" strokeWidth={1.75} />
          ) : (
            <ThumbsUp className="h-7 w-7" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  );
}

function SwipeableCard({
  item,
  onSwipe,
  disabled,
  responding,
  zIndex,
}: {
  item: CandidateInterviewItem;
  onSwipe: (item: CandidateInterviewItem, interested: boolean) => void;
  disabled: boolean;
  responding: boolean;
  zIndex: number;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, isDragging: false });
  const startRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled || responding) return;
      startRef.current = { x: clientX, y: clientY };
      setDrag({ x: 0, y: 0, isDragging: true });
    },
    [disabled, responding]
  );

  const handleMove = useCallback((clientX: number, clientY: number) => {
    setDrag((prev) => {
      if (!prev.isDragging) return prev;
      const deltaX = clientX - startRef.current.x;
      const deltaY = clientY - startRef.current.y;
      return { ...prev, x: deltaX, y: deltaY };
    });
  }, []);

  const handleEnd = useCallback(() => {
    setDrag((prev) => {
      if (!prev.isDragging) return prev;
      const committed = Math.abs(prev.x) > SWIPE_THRESHOLD;
      if (committed) {
        onSwipe(item, prev.x > 0);
      }
      return { x: 0, y: 0, isDragging: false };
    });
  }, [item, onSwipe]);

  useEffect(() => {
    if (!drag.isDragging) return;
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleEnd();
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) handleMove(t.clientX, t.clientY);
    };
    const onTouchEnd = () => handleEnd();
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [drag.isDragging, handleMove, handleEnd]);

  const rotation = Math.max(-MAX_DRAG_ROTATION, Math.min(MAX_DRAG_ROTATION, (drag.x / 20)));
  const opacityOverlay = Math.min(1, Math.abs(drag.x) / SWIPE_THRESHOLD);

  return (
    <div
      ref={cardRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing select-none touch-none"
      style={{
        zIndex,
        transform: `translate(${drag.x}px, ${drag.y * 0.3}px) rotate(${rotation}deg)`,
        transition: drag.isDragging ? "none" : "transform 0.3s ease-out",
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        handleStart(e.clientX, e.clientY);
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) handleStart(t.clientX, t.clientY);
      }}
    >
      <div className="h-full w-full rounded-2xl overflow-hidden bg-surface-800/95 border border-white/[0.08] shadow-xl shadow-black/20">
        {/* Swipe overlays */}
        {drag.x < -20 && (
          <div
            className="absolute inset-0 flex items-center justify-start pl-6 z-10 pointer-events-none"
            style={{ opacity: opacityOverlay }}
          >
            <span
              className="rounded-lg border-2 border-red-500/80 px-4 py-2 text-lg font-bold uppercase tracking-wider text-red-400/90 rotate-[-12deg]"
              style={{ textShadow: "0 0 20px rgba(248,113,113,0.5)" }}
            >
              Nope
            </span>
          </div>
        )}
        {drag.x > 20 && (
          <div
            className="absolute inset-0 flex items-center justify-end pr-6 z-10 pointer-events-none"
            style={{ opacity: opacityOverlay }}
          >
            <span
              className="rounded-lg border-2 border-accent-emerald/80 px-4 py-2 text-lg font-bold uppercase tracking-wider text-accent-emerald rotate-[12deg]"
              style={{ textShadow: "0 0 20px rgba(16,185,129,0.4)" }}
            >
              Like
            </span>
          </div>
        )}

        {responding && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-surface-850/80">
            <Loader2 className="h-12 w-12 animate-spin text-accent-cyan" strokeWidth={1.5} />
          </div>
        )}

        <OpportunityCardContent item={item} />
      </div>
    </div>
  );
}

function OpportunityCardContent({
  item,
  isStack,
}: {
  item: CandidateInterviewItem;
  isStack?: boolean;
}) {
  const interviewLink = item.interview_link_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/interview?token=${item.interview_link_token}`
    : null;

  return (
    <div className="flex h-full flex-col p-6 text-left">
      <h4 className="font-serif text-xl font-semibold text-zinc-100 leading-tight shrink-0">
        {item.job_title ?? "Untitled role"}
      </h4>
      {item.description_md ? (
        <div className="mt-3 flex-1 min-h-0 flex flex-col shrink-0">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Job description</p>
          <div className="flex-1 min-h-0 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 prose prose-invert max-w-none text-sm overflow-auto">
            <ReactMarkdown>{item.description_md}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0" />
      )}
      {interviewLink && !isStack && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Interview link</p>
          <a
            href={interviewLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 inline-flex items-center gap-2 text-sm text-accent-cyan hover:underline"
          >
            <Link2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Open link
          </a>
        </div>
      )}
    </div>
  );
}
