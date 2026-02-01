import { useState, useEffect, useRef, useCallback } from "react";
import {
  interviewJoin,
  interviewStart,
  interviewChat,
  interviewComplete,
  interviewUploadRecording,
  type InterviewJoinResponse,
} from "../api";
import { Loader2, ExternalLink, Video, MessageSquare, Clock, Mic, MicOff } from "lucide-react";

const INTERVIEW_DURATION_SEC = 10 * 60; // 10 minutes

export interface InterviewPageProps {
  token: string;
}

interface ChatMessage {
  role: "interviewer" | "candidate";
  text: string;
}

export function InterviewPage({ token }: InterviewPageProps) {
  const [data, setData] = useState<InterviewJoinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [ended, setEnded] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(INTERVIEW_DURATION_SEC);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [draft, setDraft] = useState("");
  const [textInput, setTextInput] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const lastFinalRef = useRef<string>("");
  const awaitingRef = useRef(false);

  useEffect(() => {
    interviewJoin(token)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  const speakText = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!ttsSupported || typeof window === "undefined" || !("speechSynthesis" in window)) {
          resolve();
          return;
        }
        const synth = window.speechSynthesis;
        synth.cancel();
        synth.resume();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.volume = 1;
        utterance.rate = 1;
        utterance.pitch = 1;
        const voice =
          voicesRef.current.find((v) => v.lang === "en-US") ||
          voicesRef.current.find((v) => v.lang?.startsWith("en")) ||
          voicesRef.current[0];
        if (voice) utterance.voice = voice;
        utterance.onstart = () => setTtsSpeaking(true);
        utterance.onend = () => {
          setTtsSpeaking(false);
          resolve();
        };
        utterance.onerror = () => {
          setTtsSpeaking(false);
          resolve();
        };
        synth.speak(utterance);
      }),
    [ttsSupported]
  );

  const beginListening = useCallback(() => {
    if (
      !speechSupported ||
      !recognitionRef.current ||
      !started ||
      sending ||
      ttsSpeaking ||
      endingRef.current
    ) {
      console.log("[Interview STT] Not starting recognition", {
        speechSupported,
        hasRecognition: Boolean(recognitionRef.current),
        started,
        sending,
        ttsSpeaking,
        ending: endingRef.current,
      });
      return;
    }
    awaitingRef.current = true;
    setDraft("");
    try {
      console.log("[Interview STT] Starting speech recognition");
      setListening(true);
      recognitionRef.current.start();
    } catch (e) {
      console.warn("[Interview STT] Failed to start recognition", e);
      setListening(false);
      awaitingRef.current = false;
    }
  }, [speechSupported, started, sending, ttsSpeaking]);

  const startInterview = useCallback(async () => {
    if (!data || started) return;
    try {
      await interviewStart(token);
      setStarted(true);
      setSecondsLeft(INTERVIEW_DURATION_SEC);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.start(1000);

      const tid = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            if (tid) clearInterval(tid);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      timerRef.current = tid;

      try {
        const { reply } = await interviewChat(token, "", "");
        if (reply) {
          const interviewerLine = `Interviewer: ${reply}`;
          setTranscript(interviewerLine);
          setMessages([{ role: "interviewer", text: reply }]);
          await speakText(reply);
          beginListening();
        }
      } catch (e) {
        const fallback = "Welcome! We'll begin shortly. Please introduce yourself to get started.";
        const interviewerLine = `Interviewer: ${fallback}`;
        setTranscript(interviewerLine);
        setMessages([{ role: "interviewer", text: fallback }]);
        await speakText(fallback);
        beginListening();
      }
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "Could not start camera or interview");
    }
  }, [data, started, token, speakText, beginListening]);

  const doCompleteAndUpload = useCallback(
    async (finalTranscript: string) => {
      try {
        const res = await interviewComplete(token, finalTranscript);
        setScore(res.score ?? null);
        setEnded(true);
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        if (blob.size > 0) {
          const file = new File([blob], "interview.webm", { type: "video/webm" });
          await interviewUploadRecording(token, file);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to complete interview");
      }
    },
    [token]
  );

  const endInterview = useCallback(() => {
    if (endingRef.current) return;
    endingRef.current = true;
    awaitingRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = () => {
        const finalTranscript = transcript;
        doCompleteAndUpload(finalTranscript);
      };
      rec.stop();
    } else {
      doCompleteAndUpload(transcript);
    }
  }, [transcript, doCompleteAndUpload]);

  useEffect(() => {
    if (started && secondsLeft <= 0 && !endingRef.current) {
      endInterview();
    }
  }, [started, secondsLeft, endInterview]);

  const sendMessageWithText = useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || sending || !started) return;
      setSending(true);
      awaitingRef.current = false;
      setDraft("");
      const candidateLine = `Candidate: ${msg}`;
      const newTranscript = transcript ? `${transcript}\n${candidateLine}` : candidateLine;
      setTranscript(newTranscript);
      setMessages((m) => [...m, { role: "candidate", text: msg }]);

      try {
        const { reply } = await interviewChat(token, newTranscript, msg);
        const interviewerLine = `Interviewer: ${reply}`;
        setTranscript((t) => (t ? `${t}\n${interviewerLine}` : interviewerLine));
        setMessages((m) => [...m, { role: "interviewer", text: reply }]);
        await speakText(reply);
        beginListening();
      } catch (e) {
        setMessages((m) => [
          ...m,
          { role: "interviewer", text: "Sorry, I couldn't process that. Please try again." },
        ]);
        beginListening();
      } finally {
        setSending(false);
      }
    },
    [sending, started, token, transcript, speakText, beginListening]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    setTtsSupported(true);
    const updateVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[Interview STT] SpeechRecognition not supported in this browser");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      console.log("[Interview STT] onresult fired", {
        resultIndex: event.resultIndex,
        length: event.results?.length,
      });
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcriptPiece = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += transcriptPiece;
        } else {
          interim += transcriptPiece;
        }
      }
      if (interim) {
        console.log("[Interview STT] interim", interim.trim());
      }
      if (interim) {
        setDraft(interim.trim());
      }
      const trimmedFinal = finalText.trim();
      if (trimmedFinal && trimmedFinal !== lastFinalRef.current) {
        console.log("[Interview STT] final", trimmedFinal);
        lastFinalRef.current = trimmedFinal;
        setDraft(trimmedFinal);
        try {
          recognition.stop();
        } catch (e) {
          // no-op
        }
        sendMessageWithText(trimmedFinal);
      }
    };
    recognition.onerror = () => {
      console.warn("[Interview STT] recognition error");
      setListening(false);
      awaitingRef.current = false;
    };
    recognition.onend = () => {
      console.log("[Interview STT] recognition ended", {
        awaiting: awaitingRef.current,
        ending: endingRef.current,
      });
      setListening(false);
      if (awaitingRef.current && !endingRef.current) {
        beginListening();
      }
    };
    recognitionRef.current = recognition;
    console.log("[Interview STT] SpeechRecognition ready", {
      lang: recognition.lang,
      interimResults: recognition.interimResults,
      continuous: recognition.continuous,
    });
    setSpeechSupported(true);
    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [sendMessageWithText, beginListening]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-850 bg-grid-pattern bg-[size:64px_64px]">
        <div className="flex items-center gap-4 rounded-2xl border border-surface-600/60 bg-surface-900/80 px-6 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <Loader2 className="h-6 w-6 animate-spin text-accent-blue" />
          <div className="text-sm text-zinc-300">
            Preparing your interview experience
            <span className="block text-xs text-zinc-500">Warming up the room and camera checks.</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-850 bg-grid-pattern bg-[size:64px_64px] p-4">
        <div className="max-w-md rounded-3xl border border-red-500/30 bg-surface-900/80 p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10">
            <ExternalLink className="h-5 w-5 text-red-300" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">Interview link issue</h1>
          <p className="mt-2 text-sm text-red-300">{error ?? "Invalid or expired interview link."}</p>
          <a href="/" className="mt-5 inline-flex items-center gap-2 text-sm text-accent-cyan hover:text-accent-cyan/80">
            Back to Corto
          </a>
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="min-h-screen bg-surface-850/95 bg-grid-pattern bg-[size:64px_64px] p-6 flex items-center justify-center">
        <div className="mx-auto max-w-lg rounded-3xl border border-surface-600 bg-surface-900/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10">
            <MessageSquare className="h-5 w-5 text-emerald-300" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100">Interview complete</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Thank you for taking the time. Your responses have been securely recorded.
          </p>
          {score != null && (
            <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-emerald-200">
              <span className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Score</span>
              <div className="text-2xl font-semibold">
                {score}
                <span className="text-base text-emerald-200/70">/100</span>
              </div>
            </div>
          )}
          <a href="/" className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200">
            Back to Corto
          </a>
        </div>
      </div>
    );
  }

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeStr = `${minutes}:${secs.toString().padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-surface-850/95 bg-grid-pattern bg-[size:64px_64px] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[32px] border border-surface-600 bg-gradient-to-br from-surface-900/90 via-surface-900/80 to-surface-800/90 shadow-[0_24px_80px_rgba(0,0,0,0.45)] overflow-hidden">
          <div className="px-6 py-5 md:px-8 md:py-6 border-b border-surface-600/80">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.35em] text-zinc-400">Live interview</span>
                <h1 className="text-2xl md:text-3xl font-semibold text-zinc-100 tracking-tight">{data.job_title}</h1>
                <span className="text-sm text-zinc-400">Candidate: {data.candidate_name}</span>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-surface-600 bg-surface-900/60 px-3 py-1 text-xs text-zinc-300">
                  {started ? "Live session" : "Ready to start"}
                </span>
                {started && (
                  <span className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                    <Clock className="h-4 w-4" />
                    {timeStr}
                  </span>
                )}
                <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                  {ttsSpeaking ? "Speaking" : listening ? "Listening" : sending ? "Processing" : "Idle"}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-surface-600/80 bg-surface-900/70 px-4 py-3">
                <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Interview mode</span>
                <div className="mt-1 text-sm text-zinc-200">Voice or text — video recorded</div>
                <div className="text-xs text-zinc-500">Use mic or type; both work. Transcript and follow-ups.</div>
              </div>
              <div className="rounded-2xl border border-surface-600/80 bg-surface-900/70 px-4 py-3">
                <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Time limit</span>
                <div className="mt-1 text-sm text-zinc-200">10 minutes total</div>
                <div className="text-xs text-zinc-500">You can end early</div>
              </div>
              <div className="rounded-2xl border border-surface-600/80 bg-surface-900/70 px-4 py-3">
                <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Status</span>
                <div className="mt-1 text-sm text-zinc-200">
                  {started ? "Session in progress" : "Waiting for you to begin"}
                </div>
                <div className="text-xs text-zinc-500">Secure recording enabled</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.9fr] gap-6 p-6 md:p-8">
            <div className="space-y-4">
              <div className="rounded-3xl border border-surface-600/80 bg-surface-900/70 p-4">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="uppercase tracking-[0.2em]">Camera preview</span>
                  <span className="flex items-center gap-1">
                    <Video className="h-4 w-4" />
                    HD capture
                  </span>
                </div>
                <div className="relative mt-3 w-full aspect-video rounded-2xl overflow-hidden border border-surface-700 bg-surface-950">
                  {!started ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 p-5">
                      <div className="rounded-full border border-surface-600/80 bg-surface-900/60 p-3">
                        <Video className="h-6 w-6" />
                      </div>
                      <p className="mt-3 text-sm text-center">
                        Camera will activate when you start the interview.
                      </p>
                      <button
                        type="button"
                        onClick={startInterview}
                        className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent-cyan px-6 py-2.5 text-sm font-semibold text-surface-900 shadow-[0_12px_30px_rgba(34,211,238,0.35)] hover:bg-accent-cyan/90"
                      >
                        Start interview
                      </button>
                      {videoError && <p className="mt-3 text-xs text-red-400">{videoError}</p>}
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute left-3 top-3 rounded-full border border-red-500/40 bg-black/60 px-3 py-1 text-xs text-red-200">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        Recording
                      </div>
                      <div className="absolute bottom-3 right-3 rounded-full border border-surface-600/60 bg-black/50 px-3 py-1 text-xs text-zinc-200">
                        Mic enabled
                      </div>
                    </>
                  )}
                </div>
                {started && (
                  <button
                    type="button"
                    onClick={endInterview}
                    className="mt-4 w-full rounded-xl border border-red-500/50 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    End interview
                  </button>
                )}
              </div>

              <div className="rounded-3xl border border-surface-600/80 bg-surface-900/70 p-4">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="uppercase tracking-[0.2em]">Session cues</span>
                  <span className="h-px flex-1 bg-surface-700" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-400">
                  <div className="rounded-xl border border-surface-700 bg-surface-950/60 p-3">
                    <div className="flex items-center gap-2 text-zinc-300">
                      {listening ? <Mic className="h-4 w-4 text-amber-300" /> : <MicOff className="h-4 w-4" />}
                      <span>{listening ? "Listening" : "Mic idle"}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">Speak or type in the box below</div>
                  </div>
                  <div className="rounded-xl border border-surface-700 bg-surface-950/60 p-3">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <MessageSquare className="h-4 w-4 text-accent-cyan" />
                      <span>{ttsSpeaking ? "Interviewer speaking" : "Awaiting response"}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">Follow-up questions auto-play</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-surface-600/80 bg-surface-900/70 p-4 md:p-5">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="uppercase tracking-[0.2em]">Live transcript</span>
                  <span className="h-px flex-1 bg-surface-700" />
                </div>
                <div className="mt-3 rounded-2xl border border-surface-700 bg-surface-950/60 p-5 min-h-[140px]">
                  {started ? (
                    <>
                      <p className={`text-lg leading-relaxed ${draft ? "text-zinc-100" : "text-zinc-500"}`}>
                        {draft || "Start speaking — your words will appear here, or type in the box below."}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">Voice and text both work — use whichever is available.</p>
                    </>
                  ) : (
                    <p className="text-lg text-zinc-500">Start the interview to enable live voice transcription.</p>
                  )}
                </div>
                {started && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          listening ? "bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.8)]" : "bg-zinc-600"
                        }`}
                      />
                      <span>
                        {ttsSpeaking
                          ? "Interviewer speaking"
                          : listening
                          ? "Listening to you"
                          : sending
                          ? "Sending your response"
                          : "Preparing next question"}
                      </span>
                    </div>
                    <span className="text-zinc-500">Audio-led interview • video recorded</span>
                    {draft && <span className="text-zinc-500 truncate max-w-[40%]">{draft}</span>}
                  </div>
                )}
              </div>

              <div className="flex flex-col rounded-3xl border border-surface-600/80 bg-surface-900/70 min-h-[320px]">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-surface-600/80">
                  <MessageSquare className="h-4 w-4 text-accent-cyan" />
                  <span className="text-sm font-medium text-zinc-300">Interview conversation</span>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[220px] max-h-[420px]">
                  {messages.length === 0 && started && (
                    <p className="text-zinc-500 text-sm">
                      Say hello or type your answer below. The interviewer will respond.
                    </p>
                  )}
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === "candidate" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-[0_10px_25px_rgba(0,0,0,0.2)] ${
                          m.role === "candidate"
                            ? "bg-accent-cyan/20 text-zinc-100 border border-accent-cyan/30"
                            : "bg-surface-700 text-zinc-200 border border-surface-600/80"
                        }`}
                      >
                        <span className="text-[11px] uppercase tracking-[0.18em] opacity-70 block mb-1">
                          {m.role === "interviewer" ? "Interviewer" : "You"}
                        </span>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
                {started && (
                  <div className="px-5 py-3 border-t border-surface-600/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
                      <div className="flex items-center gap-2">
                        {listening ? <Mic className="h-4 w-4 text-amber-300" /> : <MicOff className="h-4 w-4" />}
                        <span>
                          {ttsSpeaking
                            ? "Interviewer speaking..."
                            : listening
                            ? "Listening for your answer..."
                            : sending
                            ? "Sending your response..."
                            : "Preparing next question..."}
                        </span>
                      </div>
                      {draft && <span className="text-xs text-zinc-500 truncate max-w-[45%]">{draft}</span>}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            const msg = textInput.trim();
                            if (msg && !sending) {
                              sendMessageWithText(msg);
                              setTextInput("");
                            }
                          }
                        }}
                        placeholder="Type your answer here (mic doesn't work in all browsers)"
                        disabled={sending}
                        className="flex-1 min-w-0 rounded-xl border border-surface-600 bg-surface-950 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-accent-cyan/30 focus:border-accent-cyan/50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const msg = textInput.trim();
                          if (msg && !sending) {
                            sendMessageWithText(msg);
                            setTextInput("");
                          }
                        }}
                        disabled={sending || !textInput.trim()}
                        className="shrink-0 rounded-xl bg-accent-cyan px-4 py-2.5 text-sm font-semibold text-surface-900 hover:bg-accent-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {data.questions && data.questions.length > 0 && !started && (
          <div className="mt-5 rounded-3xl border border-surface-600/80 bg-surface-900/70 p-5">
            <h2 className="text-sm font-semibold text-zinc-200 mb-2">Suggested questions (covered during interview)</h2>
            <ol className="list-decimal list-inside space-y-1 text-sm text-zinc-400">
              {data.questions.slice(0, 5).map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </div>
        )}

        <a href="/" className="mt-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200">
          Back to Corto
        </a>
      </div>
    </div>
  );
}
