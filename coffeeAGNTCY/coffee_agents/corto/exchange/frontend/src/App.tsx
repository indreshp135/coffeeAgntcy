import { useCallback, useState } from "react";
import { ResumeUpload } from "./components/ResumeUpload";
import { JDEditor } from "./components/JDEditor";
import { ChatPanel } from "./components/ChatPanel";
import { sendPrompt } from "./api";
import { generateId } from "./utils";
import type { Message } from "./types";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [jdMarkdown, setJdMarkdown] = useState("");

  const handleSend = useCallback(async (prompt: string) => {
    setMessages((prev) => [
      ...prev,
      { id: generateId(), role: "user", content: prompt, timestamp: Date.now() },
    ]);
    setLoading(true);
    try {
      const { response } = await sendPrompt(prompt);
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "assistant", content: response, timestamp: Date.now() },
      ]);
    } catch (e) {
      const err = e instanceof Error ? e.message : "Request failed";
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "assistant", content: `Error: ${err}`, timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleIngest = useCallback(
    (resumeText: string) => {
      const prompt = `Here is a resume. Extract and store it.\n\n${resumeText}`;
      handleSend(prompt);
    },
    [handleSend]
  );

  return (
    <div className="min-h-screen bg-surface-850/95 bg-grid-pattern bg-[size:64px_64px]">
      <header className="border-b border-surface-700/80 bg-surface-850/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-blue to-accent-cyan text-white shadow-lg shadow-accent-blue/20">
              <span className="text-xl font-bold">C</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-100">Corto</h1>
              <p className="text-sm text-zinc-500">Recruitment AI · Resumes, JD, Interviews</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-12">
          <aside className="space-y-6 lg:col-span-4">
            <ResumeUpload
              onExtracted={() => {}}
              onIngestClick={handleIngest}
            />
            <JDEditor value={jdMarkdown} onChange={setJdMarkdown} />
          </aside>
          <section className="lg:col-span-8">
            <ChatPanel
              messages={messages}
              loading={loading}
              onSend={handleSend}
              jdMarkdown={jdMarkdown}
              onQuickAction={handleSend}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
