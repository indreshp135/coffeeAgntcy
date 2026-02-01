import { useState } from "react";
import { login, register, type LoginResponse } from "../api";
import { cn } from "../utils";

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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-surface-600 bg-surface-800/90 p-8 shadow-xl">
      <h2 className="text-xl font-bold text-zinc-100">
        {mode === "login" ? "Sign in" : "Create account"}
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        {mode === "login"
          ? "Use your username and password."
          : "Register as candidate or employer."}
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-surface-600 bg-surface-850 px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-accent-blue/50 focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
            placeholder="johndoe"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="mt-1 w-full rounded-lg border border-surface-600 bg-surface-850 px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-accent-blue/50 focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
            placeholder="••••••••"
          />
        </div>
        {mode === "register" && (
          <div>
            <label className="block text-sm font-medium text-zinc-300">Role</label>
            <div className="mt-2 flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  checked={role === "candidate"}
                  onChange={() => setRole("candidate")}
                  className="text-accent-blue"
                />
                <span className="text-zinc-200">Candidate</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  checked={role === "employer"}
                  onChange={() => setRole("employer")}
                  className="text-accent-blue"
                />
                <span className="text-zinc-200">Employer</span>
              </label>
            </div>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className={cn(
            "w-full rounded-lg bg-accent-blue px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-blue/90 disabled:opacity-60"
          )}
        >
          {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-zinc-400">
        {mode === "login" ? (
          <>
            No account?{" "}
            <button
              type="button"
              onClick={() => { setMode("register"); setError(null); }}
              className="text-accent-cyan hover:underline"
            >
              Register
            </button>
          </>
        ) : (
          <>
            Have an account?{" "}
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); }}
              className="text-accent-cyan hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
