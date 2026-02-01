import { useCallback, useState, useEffect } from "react";
import { FileUp, User, FileText, Briefcase, Loader2 } from "lucide-react";
import { ResumeUpload } from "./ResumeUpload";
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
  const [section, setSection] = useState<"resume" | "profile" | "last-resume" | "opportunities">("resume");

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
        setSection("profile");
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
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap gap-2 border-b border-surface-600 pb-4">
        {[
          { id: "resume" as const, label: "Resume", icon: FileUp },
          { id: "profile" as const, label: "Profile", icon: User },
          { id: "last-resume" as const, label: "Last resume", icon: FileText },
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
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              section === id ? "bg-accent-blue/20 text-accent-blue" : "text-zinc-400 hover:bg-surface-700 hover:text-zinc-200"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {section === "resume" && (
        <div className="rounded-2xl border border-surface-600 bg-surface-800/80 overflow-hidden">
          <div className="border-b border-surface-600 px-5 py-4">
            <h2 className="font-semibold text-zinc-100">Upload resume</h2>
            <p className="text-sm text-zinc-400">PDF or DOCX. We extract text and build your profile.</p>
          </div>
          <div className="p-5">
            <ResumeUploadCandidate onUpload={handleUploadResume} />
          </div>
        </div>
      )}

      {section === "profile" && (
        <div className="rounded-2xl border border-surface-600 bg-surface-800/80 overflow-hidden">
          <div className="border-b border-surface-600 px-5 py-4 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-100">Your profile</h2>
            {!profileLoading && profile && (
              <button
                type="button"
                onClick={() => setProfileEditing((e) => !e)}
                className="text-sm font-medium text-accent-cyan hover:underline"
              >
                {profileEditing ? "Cancel" : "Edit"}
              </button>
            )}
          </div>
          <div className="p-5">
            {profileJustAutofilled && (
              <p className="mb-4 rounded-lg bg-accent-blue/10 px-4 py-2 text-sm text-accent-blue">
                Profile filled from your resume. You can edit any field below.
              </p>
            )}
            {profileLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-accent-blue" />
              </div>
            ) : profile ? (
              <ProfileView profile={profile} editing={profileEditing} onSave={handleSaveProfile} />
            ) : (
              <p className="text-zinc-400">Upload a resume to create your profile, or edit after upload.</p>
            )}
          </div>
        </div>
      )}

      {section === "last-resume" && (
        <div className="rounded-2xl border border-surface-600 bg-surface-800/80 overflow-hidden">
          <div className="border-b border-surface-600 px-5 py-4">
            <h2 className="font-semibold text-zinc-100">Last uploaded resume</h2>
          </div>
          <div className="p-5">
            {lastResume ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  {lastResume.filename} · {new Date(lastResume.uploaded_at).toLocaleDateString()}
                </p>
                <LastResumePdfView />
                {lastResume.text && (
                  <details className="rounded-lg bg-surface-850 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-zinc-300">Extracted text</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-zinc-400">
                      {lastResume.text}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <p className="text-zinc-400">No resume uploaded yet.</p>
            )}
          </div>
        </div>
      )}

      {section === "opportunities" && <OpportunitySwipe />}
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
          "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all",
          drag ? "border-accent-blue bg-accent-blue/10" : "border-surface-600 bg-surface-750/50 hover:border-surface-500",
          loading && "pointer-events-none opacity-70"
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
          <Loader2 className="h-10 w-10 animate-spin text-accent-blue" />
        ) : (
          <FileUp className="h-10 w-10 text-zinc-500" />
        )}
        <span className="text-sm text-zinc-400">{loading ? "Uploading…" : "Drop PDF/DOCX or click"}</span>
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
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
    return (
      <div className="space-y-4 text-sm">
        <section className="grid gap-1">
          {profile.full_name != null && profile.full_name !== "" && (
            <p><span className="text-zinc-500">Name:</span> {profile.full_name}</p>
          )}
          {profile.email != null && profile.email !== "" && (
            <p><span className="text-zinc-500">Email:</span> {profile.email}</p>
          )}
          {profile.phone != null && profile.phone !== "" && (
            <p><span className="text-zinc-500">Phone:</span> {profile.phone}</p>
          )}
          {addr !== "" && (
            <p><span className="text-zinc-500">Address:</span> {addr}</p>
          )}
        </section>
        {profile.summary != null && profile.summary !== "" && (
          <section>
            <p className="text-zinc-500">Summary</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-200">{profile.summary}</p>
          </section>
        )}
        {(profile.skills?.length ?? 0) > 0 && (
          <section>
            <p className="text-zinc-500">Skills</p>
            <p className="mt-1 text-zinc-200">{profile.skills!.join(", ")}</p>
          </section>
        )}
        {(profile.education?.length ?? 0) > 0 && (
          <section>
            <p className="text-zinc-500">Education</p>
            <ul className="mt-1 space-y-2">
              {(profile.education as EducationEntry[])!.map((e, i) => (
                <li key={i} className="rounded-lg bg-surface-750/50 p-3">
                  <span className="font-medium text-zinc-200">{e.degree}{e.major ? `, ${e.major}` : ""}</span>
                  {e.institution || e.school ? <span className="text-zinc-400"> · {e.institution || e.school}</span> : null}
                  {e.year != null ? <span className="text-zinc-400"> · {e.year}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        )}
        {(profile.work_experience?.length ?? 0) > 0 && (
          <section>
            <p className="text-zinc-500">Work experience</p>
            <ul className="mt-1 space-y-2">
              {(profile.work_experience as WorkExperienceEntry[])!.map((e, i) => (
                <li key={i} className="rounded-lg bg-surface-750/50 p-3">
                  <span className="font-medium text-zinc-200">{e.role || e.position} at {e.company}</span>
                  {e.duration != null && e.duration !== "" && (
                    <span className="text-zinc-400"> · {e.duration}</span>
                  )}
                  {e.summary != null && e.summary !== "" && (
                    <p className="mt-1 text-zinc-300">{e.summary}</p>
                  )}
                  {Array.isArray(e.responsibilities) && e.responsibilities.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-zinc-400">
                      {e.responsibilities.map((r, j) => <li key={j}>{r}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {(profile.languages?.length ?? 0) > 0 && (
          <section>
            <p className="text-zinc-500">Languages</p>
            <p className="mt-1 text-zinc-200">{profile.languages!.join(", ")}</p>
          </section>
        )}
        {(profile.certifications?.length ?? 0) > 0 && (
          <section>
            <p className="text-zinc-500">Certifications</p>
            <p className="mt-1 text-zinc-200">{profile.certifications!.join(", ")}</p>
          </section>
        )}
        {(profile.interests?.length ?? 0) > 0 && (
          <section>
            <p className="text-zinc-500">Interests</p>
            <p className="mt-1 text-zinc-200">{profile.interests!.join(", ")}</p>
          </section>
        )}
        {(profile.projects?.length ?? 0) > 0 && (
          <section>
            <p className="text-zinc-500">Projects</p>
            <ul className="mt-1 space-y-2">
              {(profile.projects as ProjectEntry[])!.map((p, i) => (
                <li key={i} className="rounded-lg bg-surface-750/50 p-3">
                  {p.name != null && p.name !== "" && <span className="font-medium text-zinc-200">{p.name}</span>}
                  {p.description != null && p.description !== "" && (
                    <p className="mt-1 text-zinc-300">{p.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const inputClass = "mt-1 w-full rounded-lg border border-surface-600 bg-surface-850 px-3 py-2 text-zinc-100";
  const labelClass = "block text-sm text-zinc-400";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Full name</label>
          <input
            type="text"
            value={form.full_name ?? ""}
            onChange={(e) => setFormField("full_name", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setFormField("email", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input
            type="text"
            value={form.phone ?? ""}
            onChange={(e) => setFormField("phone", e.target.value)}
            className={inputClass}
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
      <div>
        <label className={labelClass}>Summary</label>
        <textarea
          value={form.summary ?? ""}
          onChange={(e) => setFormField("summary", e.target.value)}
          rows={4}
          className={inputClass}
        />
      </div>
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
        />
      </div>
      <div>
        <label className={labelClass}>Certifications (comma-separated)</label>
        <input
          type="text"
          value={(form.certifications ?? []).join(", ")}
          onChange={(e) => setFormField("certifications", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Interests (comma-separated)</label>
        <input
          type="text"
          value={(form.interests ?? []).join(", ")}
          onChange={(e) => setFormField("interests", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          className={inputClass}
        />
      </div>

      <section>
        <p className="mb-2 text-sm font-medium text-zinc-400">Education</p>
        <div className="space-y-3">
          {(form.education ?? []).map((entry, i) => (
            <div key={i} className="rounded-lg border border-surface-600 bg-surface-850/50 p-3 space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setFormField("education", (form.education ?? []).filter((_, j) => j !== i))}
                  className="text-xs text-red-400 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Degree"
                  value={(entry as EducationEntry).degree ?? ""}
                  onChange={(e) => {
                    const edu = [...(form.education ?? [])] as EducationEntry[];
                    edu[i] = { ...edu[i], degree: e.target.value };
                    setFormField("education", edu);
                  }}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Institution / School"
                  value={(entry as EducationEntry).institution ?? (entry as EducationEntry).school ?? ""}
                  onChange={(e) => {
                    const edu = [...(form.education ?? [])] as EducationEntry[];
                    edu[i] = { ...edu[i], institution: e.target.value, school: e.target.value };
                    setFormField("education", edu);
                  }}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Major / Field"
                  value={(entry as EducationEntry).major ?? ""}
                  onChange={(e) => {
                    const edu = [...(form.education ?? [])] as EducationEntry[];
                    edu[i] = { ...edu[i], major: e.target.value };
                    setFormField("education", edu);
                  }}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Year"
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
          ))}
          <button
            type="button"
            onClick={() => setFormField("education", [...(form.education ?? []), { degree: "", institution: "", major: "", year: null }])}
            className="rounded-lg border border-dashed border-surface-500 px-3 py-2 text-sm text-zinc-400 hover:border-surface-400 hover:text-zinc-300"
          >
            + Add education
          </button>
        </div>
      </section>

      <section>
        <p className="mb-2 text-sm font-medium text-zinc-400">Work experience</p>
        <div className="space-y-3">
          {(form.work_experience ?? []).map((entry, i) => (
            <div key={i} className="rounded-lg border border-surface-600 bg-surface-850/50 p-3 space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setFormField("work_experience", (form.work_experience ?? []).filter((_, j) => j !== i))}
                  className="text-xs text-red-400 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Role / Position"
                  value={(entry as WorkExperienceEntry).role ?? (entry as WorkExperienceEntry).position ?? ""}
                  onChange={(e) => {
                    const we = [...(form.work_experience ?? [])] as WorkExperienceEntry[];
                    we[i] = { ...we[i], role: e.target.value, position: e.target.value };
                    setFormField("work_experience", we);
                  }}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Company"
                  value={(entry as WorkExperienceEntry).company ?? ""}
                  onChange={(e) => {
                    const we = [...(form.work_experience ?? [])] as WorkExperienceEntry[];
                    we[i] = { ...we[i], company: e.target.value };
                    setFormField("work_experience", we);
                  }}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Duration (e.g. 2020 – 2023)"
                  value={(entry as WorkExperienceEntry).duration ?? ""}
                  onChange={(e) => {
                    const we = [...(form.work_experience ?? [])] as WorkExperienceEntry[];
                    we[i] = { ...we[i], duration: e.target.value };
                    setFormField("work_experience", we);
                  }}
                  className={inputClass}
                />
              </div>
              <textarea
                placeholder="Summary / responsibilities"
                value={(entry as WorkExperienceEntry).summary ?? ""}
                onChange={(e) => {
                  const we = [...(form.work_experience ?? [])] as WorkExperienceEntry[];
                  we[i] = { ...we[i], summary: e.target.value };
                  setFormField("work_experience", we);
                }}
                rows={2}
                className={inputClass}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFormField("work_experience", [...(form.work_experience ?? []), { role: "", company: "", duration: "", summary: "" }])}
            className="rounded-lg border border-dashed border-surface-500 px-3 py-2 text-sm text-zinc-400 hover:border-surface-400 hover:text-zinc-300"
          >
            + Add work experience
          </button>
        </div>
      </section>

      <section>
        <p className="mb-2 text-sm font-medium text-zinc-400">Projects</p>
        <div className="space-y-3">
          {(form.projects ?? []).map((entry, i) => (
            <div key={i} className="rounded-lg border border-surface-600 bg-surface-850/50 p-3 space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setFormField("projects", (form.projects ?? []).filter((_, j) => j !== i))}
                  className="text-xs text-red-400 hover:underline"
                >
                  Remove
                </button>
              </div>
              <input
                type="text"
                placeholder="Project name"
                value={(entry as ProjectEntry).name ?? ""}
                onChange={(e) => {
                  const pr = [...(form.projects ?? [])] as ProjectEntry[];
                  pr[i] = { ...pr[i], name: e.target.value };
                  setFormField("projects", pr);
                }}
                className={inputClass}
              />
              <textarea
                placeholder="Description"
                value={(entry as ProjectEntry).description ?? ""}
                onChange={(e) => {
                  const pr = [...(form.projects ?? [])] as ProjectEntry[];
                  pr[i] = { ...pr[i], description: e.target.value };
                  setFormField("projects", pr);
                }}
                rows={2}
                className={inputClass}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFormField("projects", [...(form.projects ?? []), { name: "", description: "" }])}
            className="rounded-lg border border-dashed border-surface-500 px-3 py-2 text-sm text-zinc-400 hover:border-surface-400 hover:text-zinc-300"
          >
            + Add project
          </button>
        </div>
      </section>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
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

  if (loading) return <p className="text-sm text-zinc-400">Loading PDF…</p>;
  if (!url) return <p className="text-sm text-zinc-400">Last resume is not a PDF or not available.</p>;
  return (
    <iframe
      src={url}
      title="Last resume PDF"
      className="h-[480px] w-full rounded-lg border border-surface-600 bg-white"
    />
  );
}
