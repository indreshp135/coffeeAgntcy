import { useCallback, useState, useEffect } from "react";
import { FileUp, User, FileText, Briefcase, Mail, Phone, MapPin, GraduationCap, Code, Edit2, Save, X, Plus, Trash2, Sparkles } from "lucide-react";
import { OpportunitySwipe } from "./OpportunitySwipe";
import {
  candidateUploadResume,
  candidateGetProfile,
  candidateUpdateProfile,
  candidateGetLastResume,
  candidateGetLastResumePdfBlob,
  type CandidateProfileData,
  type EducationEntry,
  type WorkExperienceEntry,
  type ProjectEntry,
} from "../api";
import { cn } from "../utils";

export function CandidatePortal() {
  const [profile, setProfile] = useState<CandidateProfileData | null | undefined>(undefined);
  const [lastResume, setLastResume] = useState<{ filename: string; text: string; uploaded_at: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileJustAutofilled, setProfileJustAutofilled] = useState(false);
  const [section, setSection] = useState<"profile" | "opportunities">("profile");

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const p = await candidateGetProfile();
      setProfile(p ?? null);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadLastResume = useCallback(async () => {
    try {
      const r = await candidateGetLastResume();
      setLastResume(r ?? null);
    } catch {
      setLastResume(null);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadLastResume();
  }, [loadProfile, loadLastResume]);

  const handleUploadResume = useCallback(
    async (file: File) => {
      const res = await candidateUploadResume(file);
      await loadProfile();
      await loadLastResume();
      if (res.profile_autofilled) {
        setProfileJustAutofilled(true);
      }
    },
    [loadProfile, loadLastResume]
  );

  const handleSaveProfile = useCallback(
    async (body: Partial<CandidateProfileData>) => {
      await candidateUpdateProfile(body);
      setProfileEditing(false);
      await loadProfile();
    },
    [loadProfile]
  );

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-20">
      {/* Navigation — elegant underline tabs */}
      <nav className="flex flex-wrap gap-x-1 gap-y-2 border-b border-white/[0.06] pb-px" aria-label="Portal sections">
        {[
          { id: "profile" as const, label: "Profile", icon: User },
          { id: "opportunities" as const, label: "Opportunities", icon: Briefcase },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSection(id);
              if (id !== "profile") setProfileJustAutofilled(false);
            }}
            className={cn(
              "candidate-portal-nav-item flex items-center gap-2.5 px-5 py-4",
              section === id && "active"
            )}
          >
            <Icon className={cn("h-4 w-4 transition-colors", section === id ? "text-accent-cyan" : "text-zinc-500")} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-10 space-y-10">

      {section === "profile" && (
        <article className="candidate-portal-card overflow-hidden">
          {/* ----- Profile (top) ----- */}
          <header className="border-b border-white/[0.06] px-6 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-white/[0.02] to-transparent">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-blue/90 to-accent-cyan/90 text-white shadow-lg shadow-accent-blue/20 ring-1 ring-white/10">
                <User className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="candidate-portal-section-title">Your profile</h2>
                <p className="text-sm text-zinc-500 font-normal mt-0.5">View and edit your candidate information</p>
              </div>
            </div>
            {!profileLoading && profile && (
              <button
                type="button"
                onClick={() => setProfileEditing((e) => !e)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all duration-200"
              >
                {profileEditing ? (
                  <>
                    <X className="h-4 w-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Edit2 className="h-4 w-4" />
                    Edit profile
                  </>
                )}
              </button>
            )}
          </header>
          <div className="p-6 sm:p-8">
            {profileJustAutofilled && (
              <div className="mb-8 rounded-xl bg-accent-blue/10 border border-accent-blue/20 px-5 py-4 flex items-center gap-3 animate-fade-in">
                <Sparkles className="h-5 w-5 text-accent-cyan flex-shrink-0" />
                <p className="text-sm text-zinc-200 font-medium">
                  Profile filled from your resume. You can edit any field below.
                </p>
              </div>
            )}
            {profileLoading ? (
              <div className="flex justify-center py-24">
                <div className="h-12 w-12 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
              </div>
            ) : profile ? (
              <ProfileView profile={profile} editing={profileEditing} onSave={handleSaveProfile} />
            ) : (
              <div className="text-center py-24">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 border border-white/10 mb-6">
                  <User className="h-10 w-10 text-zinc-500" strokeWidth={1.5} />
                </div>
                <p className="font-serif text-xl text-zinc-300">Upload a resume to create your profile</p>
                <p className="text-zinc-500 text-sm mt-2">Upload below</p>
              </div>
            )}
          </div>

          {/* ----- Resume (below) ----- */}
          <header className="border-t border-white/[0.06] px-6 sm:px-8 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-zinc-400">
                <FileUp className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="candidate-portal-section-title text-base">Resume</h3>
                <p className="text-sm text-zinc-500 font-normal mt-0.5">PDF or DOCX · We build your profile from it</p>
              </div>
            </div>
          </header>
          <div className="p-6 sm:p-8 pt-0 space-y-6">
            <ResumeUploadCandidate onUpload={handleUploadResume} />
            {lastResume ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-accent-cyan shrink-0" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-200 text-sm truncate">{lastResume.filename}</p>
                    <p className="text-xs text-zinc-500">
                      Uploaded {new Date(lastResume.uploaded_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </p>
                  </div>
                </div>
                <div className="h-[380px] overflow-auto border border-white/[0.08] border-t-0 bg-white">
                  <LastResumePdfView />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center">
                <FileText className="mx-auto h-10 w-10 text-zinc-600 mb-3" strokeWidth={1.5} />
                <p className="text-sm text-zinc-500">No resume uploaded yet. Upload above.</p>
              </div>
            )}
          </div>
        </article>
      )}

      {section === "opportunities" && (
        <div className="space-y-6">
          <OpportunitySwipe />
        </div>
      )}
      </div>
    </div>
  );
}

function ResumeUploadCandidate({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    if (![".pdf", ".docx"].includes(ext)) {
      setError("Use .pdf or .docx");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Max size 10 MB");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        className={cn(
          "flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-all duration-300",
          drag ? "border-accent-cyan/50 bg-accent-cyan/5" : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
          loading && "pointer-events-none opacity-60"
        )}
      >
        <input
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          disabled={loading}
        />
        {loading ? (
          <div className="h-12 w-12 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
            <FileUp className="h-7 w-7 text-zinc-400" strokeWidth={1.5} />
          </div>
        )}
        <span className="text-sm font-medium text-zinc-400">{loading ? "Uploading…" : "Drop PDF or DOCX here, or click to browse"}</span>
      </label>
      {error && <p className="text-sm text-red-400/90">{error}</p>}
    </div>
  );
}

function formatAddress(addr: CandidateProfileData["address"]): string {
  if (addr == null) return "";
  if (typeof addr === "string") return addr;
  const o = addr as Record<string, unknown>;
  const parts = [
    o.street,
    o.city,
    o.state,
    o.zip_code,
    o.country,
  ].filter(Boolean) as string[];
  return parts.join(", ");
}

function ProfileView({
  profile,
  editing,
  onSave,
}: {
  profile: CandidateProfileData;
  editing: boolean;
  onSave: (body: Partial<CandidateProfileData>) => Promise<void>;
}) {
  const [form, setForm] = useState<CandidateProfileData>(profile);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(profile);
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const setFormField = <K extends keyof CandidateProfileData>(
    key: K,
    value: CandidateProfileData[K]
  ) => setForm((f) => ({ ...f, [key]: value }));

  if (!editing) {
    const addr = formatAddress(profile.address);
    const initials = profile.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";
    
    return (
      <div className="space-y-10 animate-fade-in">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent p-8 sm:p-10">
          <div className="candidate-portal-divider absolute left-0 right-0 top-0" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-8">
            <div className="relative shrink-0">
              <div className="h-28 w-28 rounded-2xl bg-gradient-to-br from-accent-blue/90 to-accent-cyan/90 flex items-center justify-center text-3xl font-semibold text-white tracking-tight shadow-xl shadow-accent-blue/20 ring-1 ring-white/20">
                {initials}
              </div>
              <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-accent-emerald/90 border-2 border-[rgb(18,18,22)] ring-1 ring-white/10" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-100 mb-2 truncate">
                {profile.full_name || "Your Name"}
              </h1>
              {profile.summary && (
                <p className="text-zinc-400 text-sm leading-relaxed line-clamp-3 max-w-2xl">{profile.summary}</p>
              )}
            </div>
          </div>
        </div>

        {/* Contact */}
        {(profile.email || profile.phone || addr) && (
          <section className="space-y-4">
            <h2 className="candidate-portal-section-title flex items-center gap-2">
              <span className="h-px w-8 bg-gradient-to-r from-accent-cyan/60 to-transparent rounded-full" />
              Contact
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {profile.email && (
                <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-white/10 hover:bg-white/[0.04] transition-all duration-200 group">
                  <div className="h-11 w-11 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center shrink-0 group-hover:bg-accent-blue/15 transition-colors">
                    <Mail className="h-5 w-5 text-accent-blue" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Email</p>
                    <p className="text-sm font-medium text-zinc-200 truncate">{profile.email}</p>
                  </div>
                </div>
              )}
              {profile.phone && (
                <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-white/10 hover:bg-white/[0.04] transition-all duration-200 group">
                  <div className="h-11 w-11 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center shrink-0 group-hover:bg-accent-cyan/15 transition-colors">
                    <Phone className="h-5 w-5 text-accent-cyan" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Phone</p>
                    <p className="text-sm font-medium text-zinc-200 truncate">{profile.phone}</p>
                  </div>
                </div>
              )}
              {addr && (
                <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-white/10 hover:bg-white/[0.04] transition-all duration-200 group sm:col-span-2">
                  <div className="h-11 w-11 rounded-xl bg-accent-emerald/10 border border-accent-emerald/20 flex items-center justify-center shrink-0 group-hover:bg-accent-emerald/15 transition-colors">
                    <MapPin className="h-5 w-5 text-accent-emerald" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Address</p>
                    <p className="text-sm font-medium text-zinc-200">{addr}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Summary */}
        {profile.summary && (
          <section className="space-y-4">
            <h2 className="candidate-portal-section-title flex items-center gap-2">
              <span className="h-px w-8 bg-gradient-to-r from-accent-cyan/60 to-transparent rounded-full" />
              Professional summary
            </h2>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
              <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-sm">{profile.summary}</p>
            </div>
          </section>
        )}

        {/* Skills */}
        {(profile.skills?.length ?? 0) > 0 && (
          <section className="space-y-4">
            <h2 className="candidate-portal-section-title flex items-center gap-2">
              <span className="h-px w-8 bg-gradient-to-r from-accent-blue/60 to-transparent rounded-full" />
              Skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.skills!.map((skill, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-4 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-medium text-zinc-300 hover:border-accent-blue/30 hover:bg-accent-blue/5 transition-all duration-200"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Work Experience */}
        {(profile.work_experience?.length ?? 0) > 0 && (
          <section className="space-y-4">
            <h2 className="candidate-portal-section-title flex items-center gap-2">
              <span className="h-px w-8 bg-gradient-to-r from-accent-emerald/60 to-transparent rounded-full" />
              Work experience
            </h2>
            <div className="space-y-5">
              {(profile.work_experience as WorkExperienceEntry[])!.map((e, i) => (
                <div
                  key={i}
                  className="relative pl-6 border-l border-white/10 last:border-l-0"
                >
                  <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-accent-blue ring-4 ring-[rgb(18,18,22)]" />
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 hover:border-white/10 transition-all duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                      <div>
                        <h3 className="font-serif text-lg font-semibold text-zinc-100">{e.role || e.position}</h3>
                        <p className="text-accent-cyan/90 text-sm font-medium mt-0.5">{e.company}</p>
                      </div>
                      {e.duration && (
                        <span className="text-xs font-medium text-zinc-500 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0">
                          {e.duration}
                        </span>
                      )}
                    </div>
                    {e.summary && (
                      <p className="text-zinc-400 text-sm mb-3 leading-relaxed">{e.summary}</p>
                    )}
                    {Array.isArray(e.responsibilities) && e.responsibilities.length > 0 && (
                      <ul className="space-y-2">
                        {e.responsibilities.map((r, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm text-zinc-400">
                            <span className="text-accent-blue/80 mt-1 shrink-0">·</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Education */}
        {(profile.education?.length ?? 0) > 0 && (
          <section className="space-y-4">
            <h2 className="candidate-portal-section-title flex items-center gap-2">
              <span className="h-px w-8 bg-gradient-to-r from-accent-cyan/60 to-transparent rounded-full" />
              Education
            </h2>
            <div className="space-y-5">
              {(profile.education as EducationEntry[])!.map((e, i) => (
                <div
                  key={i}
                  className="relative pl-6 border-l border-white/10 last:border-l-0"
                >
                  <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-accent-cyan ring-4 ring-[rgb(18,18,22)]" />
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 hover:border-white/10 transition-all duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div>
                        <h3 className="font-serif text-lg font-semibold text-zinc-100">
                          {e.degree}
                          {e.major && <span className="text-accent-cyan/90 font-normal"> · {e.major}</span>}
                        </h3>
                        {(e.institution || e.school) && (
                          <p className="text-zinc-400 font-medium text-sm mt-1">{e.institution || e.school}</p>
                        )}
                      </div>
                      {e.year != null && (
                        <span className="text-xs font-medium text-zinc-500 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0">
                          {e.year}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Projects */}
        {(profile.projects?.length ?? 0) > 0 && (
          <section className="space-y-4">
            <h2 className="candidate-portal-section-title flex items-center gap-2">
              <span className="h-px w-8 bg-gradient-to-r from-accent-blue/60 to-transparent rounded-full" />
              Projects
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {(profile.projects as ProjectEntry[])!.map((p, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 hover:border-white/10 hover:bg-white/[0.04] transition-all duration-200"
                >
                  {p.name && (
                    <h3 className="font-serif text-base font-semibold text-zinc-100 mb-2">{p.name}</h3>
                  )}
                  {p.description && (
                    <p className="text-sm text-zinc-400 leading-relaxed">{p.description}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Additional Info Grid */}
        {((profile.languages?.length ?? 0) > 0 || (profile.certifications?.length ?? 0) > 0 || (profile.interests?.length ?? 0) > 0) && (
          <div className="grid gap-8 sm:grid-cols-3">
            {(profile.languages?.length ?? 0) > 0 && (
              <section className="space-y-4">
                <h2 className="candidate-portal-section-title flex items-center gap-2 text-base">
                  <span className="h-px w-6 bg-gradient-to-r from-accent-cyan/60 to-transparent rounded-full" />
                  Languages
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.languages!.map((lang, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-medium text-zinc-400"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {(profile.certifications?.length ?? 0) > 0 && (
              <section className="space-y-4">
                <h2 className="candidate-portal-section-title flex items-center gap-2 text-base">
                  <span className="h-px w-6 bg-gradient-to-r from-accent-emerald/60 to-transparent rounded-full" />
                  Certifications
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.certifications!.map((cert, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-medium text-zinc-400"
                    >
                      {cert}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {(profile.interests?.length ?? 0) > 0 && (
              <section className="space-y-4">
                <h2 className="candidate-portal-section-title flex items-center gap-2 text-base">
                  <span className="h-px w-6 bg-gradient-to-r from-accent-blue/60 to-transparent rounded-full" />
                  Interests
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.interests!.map((interest, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-medium text-zinc-400"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    );
  }

  const inputClass = "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-accent-cyan/30 focus:border-accent-cyan/50 transition-all duration-200";
  const labelClass = "block text-sm font-medium text-zinc-400 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-10 animate-fade-in">
      {/* Basic Information */}
      <section className="space-y-4">
        <h2 className="candidate-portal-section-title flex items-center gap-2">
          <span className="h-px w-8 bg-gradient-to-r from-accent-blue/60 to-transparent rounded-full" />
          Basic information
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Full name</label>
            <input
              type="text"
              value={form.full_name ?? ""}
              onChange={(e) => setFormField("full_name", e.target.value)}
              className={inputClass}
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setFormField("email", e.target.value)}
              className={inputClass}
              placeholder="john.doe@example.com"
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="text"
              value={form.phone ?? ""}
              onChange={(e) => setFormField("phone", e.target.value)}
              className={inputClass}
              placeholder="+1 (555) 123-4567"
            />
          </div>
          <div>
            <label className={labelClass}>Address</label>
            <input
              type="text"
              value={typeof form.address === "string" ? form.address ?? "" : formatAddress(form.address ?? null)}
              onChange={(e) => setFormField("address", e.target.value)}
              className={inputClass}
              placeholder="Street, city, state, zip, country"
            />
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-accent-cyan/20 flex items-center justify-center">
            <FileText className="h-4 w-4 text-accent-cyan" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-100">Professional Summary</h2>
        </div>
        <div>
          <label className={labelClass}>Summary</label>
          <textarea
            value={form.summary ?? ""}
            onChange={(e) => setFormField("summary", e.target.value)}
            rows={5}
            className={inputClass}
            placeholder="Write a brief summary of your professional background and expertise..."
          />
        </div>
      </section>

      {/* Skills & Additional Info */}
      <section className="space-y-4">
        <h2 className="candidate-portal-section-title flex items-center gap-2">
          <span className="h-px w-8 bg-gradient-to-r from-accent-blue/60 to-transparent rounded-full" />
          Skills & additional information
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Skills (comma-separated)</label>
            <input
              type="text"
              value={(form.skills ?? []).join(", ")}
              onChange={(e) => setFormField("skills", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              className={inputClass}
              placeholder="e.g. Python, React, Leadership"
            />
          </div>
          <div>
            <label className={labelClass}>Languages (comma-separated)</label>
            <input
              type="text"
              value={(form.languages ?? []).join(", ")}
              onChange={(e) => setFormField("languages", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              className={inputClass}
              placeholder="e.g. English, Spanish, French"
            />
          </div>
          <div>
            <label className={labelClass}>Certifications (comma-separated)</label>
            <input
              type="text"
              value={(form.certifications ?? []).join(", ")}
              onChange={(e) => setFormField("certifications", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              className={inputClass}
              placeholder="e.g. AWS Certified, PMP"
            />
          </div>
          <div>
            <label className={labelClass}>Interests (comma-separated)</label>
            <input
              type="text"
              value={(form.interests ?? []).join(", ")}
              onChange={(e) => setFormField("interests", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              className={inputClass}
              placeholder="e.g. Photography, Reading, Travel"
            />
          </div>
        </div>
      </section>

      {/* Education */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-accent-cyan/20 flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-accent-cyan" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-100">Education</h2>
        </div>
        <div className="space-y-4">
          {(form.education ?? []).map((entry, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-4 hover:border-white/10 transition-all duration-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Education #{i + 1}</span>
                <button
                  type="button"
                  onClick={() => setFormField("education", (form.education ?? []).filter((_, j) => j !== i))}
                  className="flex items-center gap-1 text-xs text-red-400/90 hover:text-red-300 hover:bg-red-400/10 px-2 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Degree</label>
                  <input
                    type="text"
                    placeholder="Bachelor of Science"
                    value={(entry as EducationEntry).degree ?? ""}
                    onChange={(e) => {
                      const edu = [...(form.education ?? [])] as EducationEntry[];
                      edu[i] = { ...edu[i], degree: e.target.value };
                      setFormField("education", edu);
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Institution / School</label>
                  <input
                    type="text"
                    placeholder="University Name"
                    value={(entry as EducationEntry).institution ?? (entry as EducationEntry).school ?? ""}
                    onChange={(e) => {
                      const edu = [...(form.education ?? [])] as EducationEntry[];
                      edu[i] = { ...edu[i], institution: e.target.value, school: e.target.value };
                      setFormField("education", edu);
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Major / Field</label>
                  <input
                    type="text"
                    placeholder="Computer Science"
                    value={(entry as EducationEntry).major ?? ""}
                    onChange={(e) => {
                      const edu = [...(form.education ?? [])] as EducationEntry[];
                      edu[i] = { ...edu[i], major: e.target.value };
                      setFormField("education", edu);
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Year</label>
                  <input
                    type="text"
                    placeholder="2020"
                    value={(entry as EducationEntry).year != null ? String((entry as EducationEntry).year) : ""}
                    onChange={(e) => {
                      const edu = [...(form.education ?? [])] as EducationEntry[];
                      const v = e.target.value;
                      edu[i] = { ...edu[i], year: v === "" ? null : /^\d+$/.test(v) ? parseInt(v, 10) : v };
                      setFormField("education", edu);
                    }}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFormField("education", [...(form.education ?? []), { degree: "", institution: "", major: "", year: null }])}
            className="w-full rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-zinc-500 hover:border-accent-cyan/30 hover:text-accent-cyan hover:bg-accent-cyan/5 transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add education entry
          </button>
        </div>
      </section>

      {/* Work Experience */}
      <section className="space-y-4">
        <h2 className="candidate-portal-section-title flex items-center gap-2">
          <span className="h-px w-8 bg-gradient-to-r from-accent-emerald/60 to-transparent rounded-full" />
          Work experience
        </h2>
        <div className="space-y-4">
          {(form.work_experience ?? []).map((entry, i) => (
            <div key={i} className="rounded-xl border border-surface-600 bg-surface-850/50 p-5 space-y-4 hover:border-accent-emerald/30 transition-all duration-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Experience #{i + 1}</span>
                <button
                  type="button"
                  onClick={() => setFormField("work_experience", (form.work_experience ?? []).filter((_, j) => j !== i))}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 px-2 py-1 rounded transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Role / Position</label>
                  <input
                    type="text"
                    placeholder="Software Engineer"
                    value={(entry as WorkExperienceEntry).role ?? (entry as WorkExperienceEntry).position ?? ""}
                    onChange={(e) => {
                      const we = [...(form.work_experience ?? [])] as WorkExperienceEntry[];
                      we[i] = { ...we[i], role: e.target.value, position: e.target.value };
                      setFormField("work_experience", we);
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Company</label>
                  <input
                    type="text"
                    placeholder="Company Name"
                    value={(entry as WorkExperienceEntry).company ?? ""}
                    onChange={(e) => {
                      const we = [...(form.work_experience ?? [])] as WorkExperienceEntry[];
                      we[i] = { ...we[i], company: e.target.value };
                      setFormField("work_experience", we);
                    }}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Duration</label>
                  <input
                    type="text"
                    placeholder="Jan 2020 – Dec 2023"
                    value={(entry as WorkExperienceEntry).duration ?? ""}
                    onChange={(e) => {
                      const we = [...(form.work_experience ?? [])] as WorkExperienceEntry[];
                      we[i] = { ...we[i], duration: e.target.value };
                      setFormField("work_experience", we);
                    }}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Summary / Responsibilities</label>
                <textarea
                  placeholder="Describe your role, achievements, and key responsibilities..."
                  value={(entry as WorkExperienceEntry).summary ?? ""}
                  onChange={(e) => {
                    const we = [...(form.work_experience ?? [])] as WorkExperienceEntry[];
                    we[i] = { ...we[i], summary: e.target.value };
                    setFormField("work_experience", we);
                  }}
                  rows={4}
                  className={inputClass}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFormField("work_experience", [...(form.work_experience ?? []), { role: "", company: "", duration: "", summary: "" }])}
            className="w-full rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-zinc-500 hover:border-accent-emerald/30 hover:text-accent-emerald hover:bg-accent-emerald/5 transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add work experience
          </button>
        </div>
      </section>

      {/* Projects */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-accent-blue/20 flex items-center justify-center">
            <Code className="h-4 w-4 text-accent-blue" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-100">Projects</h2>
        </div>
        <div className="space-y-4">
          {(form.projects ?? []).map((entry, i) => (
            <div key={i} className="rounded-xl border border-surface-600 bg-surface-850/50 p-5 space-y-4 hover:border-accent-blue/30 transition-all duration-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Project #{i + 1}</span>
                <button
                  type="button"
                  onClick={() => setFormField("projects", (form.projects ?? []).filter((_, j) => j !== i))}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 px-2 py-1 rounded transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>
              <div>
                <label className={labelClass}>Project Name</label>
                <input
                  type="text"
                  placeholder="My Awesome Project"
                  value={(entry as ProjectEntry).name ?? ""}
                  onChange={(e) => {
                    const pr = [...(form.projects ?? [])] as ProjectEntry[];
                    pr[i] = { ...pr[i], name: e.target.value };
                    setFormField("projects", pr);
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  placeholder="Describe the project, technologies used, and your contributions..."
                  value={(entry as ProjectEntry).description ?? ""}
                  onChange={(e) => {
                    const pr = [...(form.projects ?? [])] as ProjectEntry[];
                    pr[i] = { ...pr[i], description: e.target.value };
                    setFormField("projects", pr);
                  }}
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFormField("projects", [...(form.projects ?? []), { name: "", description: "" }])}
            className="w-full rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-zinc-500 hover:border-accent-blue/30 hover:text-accent-blue hover:bg-accent-blue/5 transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add project
          </button>
        </div>
      </section>

      {/* Submit */}
      <div className="pt-8 mt-2 border-t border-white/[0.06]">
        <div className="flex justify-end pt-6">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-blue/90 to-accent-cyan/90 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-blue/20 hover:shadow-xl hover:shadow-accent-cyan/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-white/10"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" strokeWidth={1.75} />
                Save profile
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

function LastResumePdfView() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    candidateGetLastResumePdfBlob()
      .then((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .finally(() => setLoading(false));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="h-10 w-10 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
    </div>
  );
  if (!url) return (
    <p className="text-sm text-zinc-500 py-4">Last resume is not a PDF or not available.</p>
  );
  return (
    <iframe
      src={url}
      title="Last resume PDF"
      className="h-[520px] w-full rounded-xl border border-white/[0.08] bg-white shadow-inner"
    />
  );
}
