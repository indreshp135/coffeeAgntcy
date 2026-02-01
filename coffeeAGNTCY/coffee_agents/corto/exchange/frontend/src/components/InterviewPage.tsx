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
      return;
    }
    awaitingRef.current = true;
    setDraft("");
    try {
      setListening(true);
      recognitionRef.current.start();
    } catch (e) {
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
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
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
        setDraft(interim.trim());
      }
      const trimmedFinal = finalText.trim();
      if (trimmedFinal && trimmedFinal !== lastFinalRef.current) {
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
      setListening(false);
      awaitingRef.current = false;
    };
    recognition.onend = () => {
      setListening(false);
      if (awaitingRef.current && !endingRef.current) {
        beginListening();
      }
    };
    recognitionRef.current = recognition;
    setSpeechSupported(true);
    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [sendMessageWithText, beginListening]);

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
          <a href="/" className="mt-4 inline-block text-sm text-accent-cyan hover:underline">
            Back to Corto
          </a>
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="min-h-screen bg-surface-850/95 bg-grid-pattern bg-[size:64px_64px] p-6 flex items-center justify-center">
        <div className="mx-auto max-w-md rounded-2xl border border-surface-600 bg-surface-800/90 p-8 shadow-xl text-center">
          <h1 className="text-2xl font-bold text-zinc-100">Interview complete</h1>
          <p className="mt-2 text-zinc-400">Thank you for completing your interview.</p>
          {score != null && (
            <p className="mt-4 text-lg text-accent-cyan">
              Your score: <strong>{score}</strong>/100
            </p>
          )}
          <a href="/" className="mt-6 inline-block text-sm text-zinc-400 hover:text-zinc-200">
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
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-surface-600 bg-surface-800/90 shadow-xl overflow-hidden">
          <div className="border-b border-surface-600 bg-surface-800 px-4 py-3 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-zinc-100 truncate">{data.job_title}</h1>
            <span className="text-zinc-400 text-sm">Candidate: {data.candidate_name}</span>
            {started && (
              <span className="flex items-center gap-1 text-amber-400 text-sm">
                <Clock className="h-4 w-4" />
                {timeStr}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
            {/* Video + start */}
            <div className="lg:col-span-1 flex flex-col items-center">
              <div className="relative w-full aspect-video max-w-sm rounded-xl bg-surface-900 border border-surface-600 overflow-hidden">
                {!started ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-4">
                    <Video className="h-12 w-12 mb-2" />
                    <p className="text-sm text-center">Camera will turn on when you start</p>
                    <button
                      type="button"
                      onClick={startInterview}
                      className="mt-4 px-6 py-2 rounded-lg bg-accent-cyan text-surface-900 font-medium hover:bg-accent-cyan/90"
                    >
                      Start interview
                    </button>
                    {videoError && <p className="mt-2 text-sm text-red-400">{videoError}</p>}
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-xs text-white flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      Recording
                    </div>
                  </>
                )}
              </div>
              {started && (
                <button
                  type="button"
                  onClick={endInterview}
                  className="mt-3 px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm"
                >
                  End interview
                </button>
              )}
            </div>

            {/* Chat */}
            <div className="lg:col-span-2 flex flex-col rounded-xl border border-surface-600 bg-surface-900 min-h-[320px]">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-600">
                <MessageSquare className="h-4 w-4 text-accent-cyan" />
                <span className="text-sm font-medium text-zinc-300">Interview conversation</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[360px]">
                {messages.length === 0 && started && (
                  <p className="text-zinc-500 text-sm">Say hello or answer the first question. The interviewer will respond.</p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === "candidate" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.role === "candidate"
                          ? "bg-accent-cyan/20 text-zinc-100"
                          : "bg-surface-700 text-zinc-200"
                      }`}
                    >
                      <span className="text-xs opacity-70 block mb-0.5">
                        {m.role === "interviewer" ? "Interviewer" : "You"}
                      </span>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              {started && (
                <div className="p-3 border-t border-surface-600 flex items-center justify-between gap-3 text-sm text-zinc-400">
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
              )}
            </div>
          </div>
        </div>

        {data.questions && data.questions.length > 0 && !started && (
          <div className="mt-4 rounded-xl border border-surface-600 bg-surface-800/80 p-4">
            <h2 className="text-sm font-semibold text-zinc-200 mb-2">Suggested questions (covered during interview)</h2>
            <ol className="list-decimal list-inside space-y-1 text-sm text-zinc-400">
              {data.questions.slice(0, 5).map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </div>
        )}

        <a href="/" className="mt-4 inline-block text-sm text-zinc-400 hover:text-zinc-200">
          Back to Corto
        </a>
      </div>
    </div>
  );
}
