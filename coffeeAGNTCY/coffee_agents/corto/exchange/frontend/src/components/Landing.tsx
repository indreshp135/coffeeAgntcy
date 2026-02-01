import { FileText, Briefcase, MessageCircle, ArrowRight, Sparkles } from "lucide-react";

export interface LandingProps {
  onGetStarted: () => void;
}

const features = [
  {
    icon: FileText,
    title: "Resumes that stand out",
    description: "AI refines your experience into a compelling narrative. Upload once, tailor for every role.",
  },
  {
    icon: Briefcase,
    title: "Job descriptions that attract",
    description: "Craft precise, inclusive JDs that attract the right candidates—fast and consistent.",
  },
  {
    icon: MessageCircle,
    title: "Interviews that matter",
    description: "Structured, fair interviews with AI assistance. Focus on the human, not the paperwork.",
  },
];

export function Landing({ onGetStarted }: LandingProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient orbs */}
      <div
        className="pointer-events-none absolute -left-1/4 top-0 h-[80vmin] w-[80vmin] animate-float rounded-full opacity-[0.35] blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, rgba(99, 102, 241, 0.5) 0%, rgba(34, 211, 238, 0.2) 40%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -right-1/4 top-1/3 h-[60vmin] w-[60vmin] animate-float rounded-full opacity-20 blur-[100px] [animation-duration:22s] [animation-direction:reverse]"
        style={{
          background:
            "radial-gradient(circle, rgba(34, 211, 238, 0.4) 0%, rgba(16, 185, 129, 0.15) 50%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute bottom-1/4 left-1/2 h-[40vmin] w-[40vmin] -translate-x-1/2 animate-float rounded-full opacity-[0.12] blur-[80px] [animation-duration:15s] [animation-delay:2s]"
        style={{
          background: "radial-gradient(circle, rgba(99, 102, 241, 0.5) 0%, transparent 60%)",
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.015)_1px,transparent_1px)] bg-[size:72px_72px]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-12 pb-24 md:px-8 md:pt-20">
        {/* Nav */}
        <nav className="mb-20 flex items-center justify-between md:mb-28">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-blue to-accent-cyan text-white shadow-lg shadow-accent-blue/25">
              <span className="text-lg font-bold">C</span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-zinc-100">Corto</span>
          </div>
          <button
            type="button"
            onClick={onGetStarted}
            className="rounded-full border border-zinc-600/80 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-200 backdrop-blur-sm transition-colors hover:border-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-100"
          >
            Sign in
          </button>
        </nav>

        {/* Hero */}
        <header className="text-center">
          <p
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-600/60 bg-zinc-900/40 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-zinc-400 backdrop-blur-sm animate-fade-in"
            style={{ animationDelay: "0ms", animationFillMode: "backwards" }}
          >
            <Sparkles className="h-3.5 w-3.5 text-accent-cyan/80" />
            Recruitment, reimagined
          </p>
          <h1
            className="font-serif text-6xl font-light tracking-tight sm:text-7xl md:text-8xl lg:text-8xl animate-fade-in"
            style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
          >
            <span className="bg-gradient-to-r from-zinc-100 via-accent-cyan to-accent-emerald bg-clip-text text-transparent">
              Corto
            </span>
          </h1>
          <p
            className="mx-auto mt-8 max-w-xl text-lg text-zinc-400 sm:text-xl animate-fade-in"
            style={{ animationDelay: "160ms", animationFillMode: "backwards" }}
          >
            Resumes. Job descriptions. Interviews. One intelligent flow for candidates and employers.
          </p>
          <div
            className="mt-12 animate-fade-in sm:mt-14"
            style={{ animationDelay: "240ms", animationFillMode: "backwards" }}
          >
            <button
              type="button"
              onClick={onGetStarted}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-accent-blue to-accent-cyan px-8 py-4 text-base font-semibold text-white shadow-xl shadow-accent-blue/25 transition-all duration-300 hover:shadow-accent-blue/40 hover:shadow-2xl active:scale-[0.98]"
            >
              Get started
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </header>

        {/* Features */}
        <section className="mt-32 md:mt-44">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }, i) => (
              <article
                key={title}
                className="group relative rounded-2xl border border-zinc-700/60 bg-zinc-900/40 p-8 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600/80 hover:bg-zinc-900/60 animate-fade-in"
                style={{
                  animationDelay: `${320 + i * 80}ms`,
                  animationFillMode: "backwards",
                }}
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent-blue/20 to-accent-cyan/20 text-accent-cyan transition-colors group-hover:from-accent-blue/30 group-hover:to-accent-cyan/30">
                  <Icon className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mt-32 text-center md:mt-40">
          <p className="text-zinc-500">Ready to streamline hiring?</p>
          <button
            type="button"
            onClick={onGetStarted}
            className="mt-4 text-sm font-medium text-accent-cyan transition-colors hover:text-accent-cyan/80 hover:underline"
          >
            Sign in or create an account →
          </button>
        </section>
      </div>
    </div>
  );
}
