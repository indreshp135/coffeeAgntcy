import { useState } from "react";
import { login, register, type LoginResponse } from "../api";
import { cn } from "../utils";
import { User, Lock, Briefcase, UserCircle, Sparkles } from "lucide-react";

export interface AuthProps {
  onLoggedIn: (data: LoginResponse) => void;
}

export function Auth({ onLoggedIn }: AuthProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"candidate" | "employer">("candidate");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const data = await login(username, password);
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("username", data.username);
        onLoggedIn(data);
      } else {
        const data = await register(username, password, role);
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("username", data.username);
        onLoggedIn(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setError(null);
  };

  return (
    <div className="relative w-full max-w-md">
      {/* Ambient glow behind card */}
      <div
        className="pointer-events-none absolute -inset-4 rounded-[2rem] opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99, 102, 241, 0.25), transparent 60%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(34, 211, 238, 0.12), transparent 50%)",
        }}
        aria-hidden
      />

      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border border-white/10 bg-surface-850/90 shadow-2xl backdrop-blur-2xl",
          "ring-1 ring-white/5",
          shake && "animate-shake"
        )}
      >
        {/* Gradient top strip */}
        <div
          className="h-1 w-full"
          style={{
            background: "linear-gradient(90deg, rgb(99 102 241), rgb(34 211 238), rgb(16 185 129))",
          }}
        />

        <div className="px-8 pt-8 pb-8 sm:px-10 sm:pt-10 sm:pb-10">
          {/* Header */}
          <div className="text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-blue to-accent-cyan text-white shadow-lg shadow-accent-blue/30">
              <Sparkles className="h-6 w-6" strokeWidth={2} />
            </div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              {mode === "login"
                ? "Sign in to continue to Corto"
                : "Join as a candidate or employer—one account, your journey."}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="mt-8 flex rounded-2xl bg-surface-800/80 p-1 ring-1 ring-white/5">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all duration-300",
                mode === "login"
                  ? "text-white shadow-lg"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {mode === "login" && (
                <span
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent-blue to-accent-blue/80 shadow-inner"
                  style={{ boxShadow: "0 0 20px -4px rgba(99, 102, 241, 0.4)" }}
                />
              )}
              <User className={cn("relative h-4 w-4", mode === "login" && "text-white")} strokeWidth={2} />
              <span className="relative">Sign in</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all duration-300",
                mode === "register"
                  ? "text-white shadow-lg"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {mode === "register" && (
                <span
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-emerald shadow-inner"
                  style={{ boxShadow: "0 0 20px -4px rgba(34, 211, 238, 0.35)" }}
                />
              )}
              <UserCircle className={cn("relative h-4 w-4", mode === "register" && "text-white")} strokeWidth={2} />
              <span className="relative">Register</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Username */}
            <div className="group">
              <label className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                <User className="h-3.5 w-3.5 text-accent-blue/80" strokeWidth={2} />
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="johndoe"
                className={cn(
                  "w-full rounded-xl border bg-surface-800/60 px-4 py-3.5 text-zinc-100 placeholder:text-zinc-500",
                  "transition-all duration-200",
                  "border-surface-600 focus:border-accent-blue/60 focus:outline-none focus:ring-2 focus:ring-accent-blue/25",
                  "hover:border-surface-500"
                )}
              />
            </div>

            {/* Password */}
            <div className="group">
              <label className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                <Lock className="h-3.5 w-3.5 text-accent-cyan/80" strokeWidth={2} />
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className={cn(
                  "w-full rounded-xl border bg-surface-800/60 px-4 py-3.5 text-zinc-100 placeholder:text-zinc-500",
                  "transition-all duration-200",
                  "border-surface-600 focus:border-accent-cyan/60 focus:outline-none focus:ring-2 focus:ring-accent-cyan/25",
                  "hover:border-surface-500"
                )}
              />
            </div>

            {/* Role (register only) */}
            {mode === "register" && (
              <div className="animate-fade-in">
                <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-zinc-400">
                  I am a…
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole("candidate")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200",
                      role === "candidate"
                        ? "border-accent-blue bg-accent-blue/10 ring-2 ring-accent-blue/30"
                        : "border-surface-600 bg-surface-800/60 text-zinc-400 hover:border-surface-500 hover:text-zinc-200"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        role === "candidate"
                          ? "bg-accent-blue/20 text-accent-blue"
                          : "bg-surface-700 text-zinc-500"
                      )}
                    >
                      <UserCircle className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-medium text-zinc-100">Candidate</span>
                      <span className="block text-xs text-zinc-500">Find roles, ace interviews</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("employer")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200",
                      role === "employer"
                        ? "border-accent-emerald bg-accent-emerald/10 ring-2 ring-accent-emerald/30"
                        : "border-surface-600 bg-surface-800/60 text-zinc-400 hover:border-surface-500 hover:text-zinc-200"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        role === "employer"
                          ? "bg-accent-emerald/20 text-accent-emerald"
                          : "bg-surface-700 text-zinc-500"
                      )}
                    >
                      <Briefcase className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-medium text-zinc-100">Employer</span>
                      <span className="block text-xs text-zinc-500">Post jobs, hire talent</span>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div
                className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                role="alert"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "relative w-full overflow-hidden rounded-xl py-4 font-semibold text-white transition-all duration-300",
                "bg-gradient-to-r from-accent-blue via-accent-blue to-accent-cyan",
                "shadow-lg shadow-accent-blue/30 hover:shadow-accent-blue/40 hover:shadow-xl",
                "focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 focus:ring-offset-2 focus:ring-offset-surface-850",
                "disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none",
                loading && "animate-glow"
              )}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Please wait…
                </span>
              ) : (
                <span className="relative z-10">
                  {mode === "login" ? "Sign in" : "Create account"}
                </span>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-medium text-accent-cyan transition-colors hover:text-accent-cyan/90 hover:underline"
                >
                  Register
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-medium text-accent-cyan transition-colors hover:text-accent-cyan/90 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
