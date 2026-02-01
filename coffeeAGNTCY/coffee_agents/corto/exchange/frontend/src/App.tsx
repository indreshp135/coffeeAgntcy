import { useCallback, useState, useEffect } from "react";
import { Auth } from "./components/Auth";
import { CandidatePortal } from "./components/CandidatePortal";
import { EmployerPortal } from "./components/EmployerPortal";
import { InterviewPage } from "./components/InterviewPage";
import type { LoginResponse } from "./api";

function App() {
  const [auth, setAuth] = useState<LoginResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [interviewToken, setInterviewToken] = useState<string | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (path === "/interview" && token) {
      setInterviewToken(token);
    }
  }, []);

  if (interviewToken) {
    return <InterviewPage token={interviewToken} />;
  }

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("role") as "candidate" | "employer" | null;
    const username = localStorage.getItem("username");
    if (token && role && username) {
      setAuth({ access_token: token, token_type: "bearer", username, role });
    }
    setChecking(false);
  }, []);

  const handleLoggedIn = useCallback((data: LoginResponse) => {
    setAuth(data);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    setAuth(null);
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
      </div>
    );
  }

  if (!auth) {
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
                <p className="text-sm text-zinc-500">Recruitment · Resumes, JD, Interviews</p>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-16 flex justify-center">
          <Auth onLoggedIn={handleLoggedIn} />
        </main>
      </div>
    );
  }

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
              <p className="text-sm text-zinc-500">
                {auth.role === "candidate" ? "Candidate portal" : "Employer portal"} · {auth.username}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-surface-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-surface-700 hover:text-zinc-100"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {auth.role === "candidate" ? <CandidatePortal /> : <EmployerPortal />}
      </main>
    </div>
  );
}

export default App;
