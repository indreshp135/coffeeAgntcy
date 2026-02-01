const API_BASE = "http://localhost:8000";

export interface LoginResponse {
  access_token: string;
  token_type?: string;
  username: string;
  role: string;
  user_id?: number;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Login failed");
  }
  return res.json();
}

export async function register(
  username: string,
  password: string,
  role: "candidate" | "employer"
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Registration failed");
  }
  return res.json();
}

export async function extractResume(file: File): Promise<{ text: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/agent/extract-resume`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to extract resume");
  }
  return res.json();
}

export async function sendPrompt(prompt: string): Promise<{ response: string; session_id: string }> {
  const res = await fetch(`${API_BASE}/agent/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export async function getSuggestedPrompts(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/suggested-prompts`);
  if (!res.ok) return [];
  return res.json();
}

// ---------- Candidate (auth required) ----------
function authHeaders(): HeadersInit {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function authHeadersNoContentType(): HeadersInit {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface EducationEntry {
  degree?: string | null;
  major?: string | null;
  institution?: string | null;
  school?: string | null;
  year?: number | string | null;
  field?: string | null;
}

export interface WorkExperienceEntry {
  role?: string | null;
  position?: string | null;
  company?: string | null;
  duration?: string | null;
  summary?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  responsibilities?: string[];
}

export interface ProjectEntry {
  name?: string | null;
  description?: string | null;
}

export interface CandidateProfileData {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | Record<string, unknown> | null;
  summary?: string | null;
  education?: EducationEntry[];
  work_experience?: WorkExperienceEntry[];
  skills?: string[];
  languages?: string[];
  certifications?: string[];
  interests?: string[];
  projects?: ProjectEntry[];
}

export async function candidateUploadResume(
  file: File
): Promise<{ message: string; filename: string; profile_autofilled?: boolean }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/candidate/resume/upload`, {
    method: "POST",
    headers: authHeadersNoContentType(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function candidateGetProfile(): Promise<CandidateProfileData | null> {
  const res = await fetch(`${API_BASE}/candidate/profile`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load profile");
  }
  const data = await res.json();
  return data === null ? null : data;
}

export async function candidateUpdateProfile(body: Partial<CandidateProfileData>): Promise<void> {
  const res = await fetch(`${API_BASE}/candidate/profile`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Update failed");
  }
}

export async function candidateGetLastResume(): Promise<{
  filename: string;
  text: string;
  uploaded_at: string;
} | null> {
  const res = await fetch(`${API_BASE}/candidate/resume/last`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load resume");
  }
  const data = await res.json();
  return data === null ? null : data;
}

export async function candidateGetLastResumePdfBlob(): Promise<Blob | null> {
  const res = await fetch(`${API_BASE}/candidate/resume/last/pdf`, { headers: authHeadersNoContentType() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load PDF");
  }
  return res.blob();
}

// ---------- Candidate interviews ----------

export interface CandidateInterviewItem {
  job_candidate_id: number;
  job_id: number;
  job_title: string | null;
  description_md: string;
  invited_at: string | null;
  interview_completed_at: string | null;
  score: number | null;
  interview_link_token: string | null;
  candidate_decision: string | null;
  company_decision: string | null;
  status?: string;
}

export interface CandidateInterviewsResponse {
  open: CandidateInterviewItem[];
  history: CandidateInterviewItem[];
}

export async function candidateListInterviews(): Promise<CandidateInterviewsResponse> {
  const res = await fetch(`${API_BASE}/candidate/interviews`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load opportunities");
  }
  return res.json();
}

export async function candidateRespondToInterview(
  job_candidate_id: number,
  interested: boolean
): Promise<void> {
  const res = await fetch(`${API_BASE}/candidate/interviews/${job_candidate_id}/respond`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ interested }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
}

// ---------- Employer jobs (auth required) ----------
export interface JobSummary {
  id: number;
  title: string | null;
  status: string;
  created_at: string;
}

export interface JobDetail {
  id: number;
  title: string | null;
  description_md: string | null;
  description_schema: unknown;
  status: string;
}

export interface GenerateJDResponse {
  title: string;
  description_md: string;
  job_description: unknown;
}

export async function employerGenerateJd(prompt: string): Promise<GenerateJDResponse> {
  const res = await fetch(`${API_BASE}/employer/generate-jd`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ prompt: prompt.trim() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "JD generation failed");
  }
  return res.json();
}

export async function employerCreateJob(
  title: string,
  descriptionMd: string,
  jobDescription?: unknown
): Promise<{ id: number; title: string | null; status: string }> {
  const body: { title: string; description_md: string; job_description?: unknown } = {
    title,
    description_md: descriptionMd,
  };
  if (jobDescription != null) body.job_description = jobDescription;
  const res = await fetch(`${API_BASE}/employer/jobs`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Create failed");
  }
  return res.json();
}

export async function employerListJobs(): Promise<JobSummary[]> {
  const res = await fetch(`${API_BASE}/employer/jobs`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load jobs");
  }
  return res.json();
}

export async function employerGetJob(jobId: number): Promise<JobDetail> {
  const res = await fetch(`${API_BASE}/employer/jobs/${jobId}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load job");
  }
  return res.json();
}

export async function employerUpdateJob(
  jobId: number,
  body: { title?: string; description_md?: string; job_description?: unknown }
): Promise<JobDetail> {
  const res = await fetch(`${API_BASE}/employer/jobs/${jobId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Update failed");
  }
  return res.json();
}

export async function employerPublishJob(jobId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/employer/jobs/${jobId}/publish`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Publish failed");
  }
}

export interface EmployerFinalizeResponse {
  message: string;
  top_3: string[];
}

export async function employerFinalizeJob(jobId: number): Promise<EmployerFinalizeResponse> {
  const res = await fetch(`${API_BASE}/employer/jobs/${jobId}/finalize`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Finalize failed");
  }
  return res.json();
}

// ---------- Interview (public, no auth) ----------
export interface InterviewJoinResponse {
  job_id: number;
  job_candidate_id: number;
  job_title: string;
  description_md: string;
  candidate_name: string;
  profile_summary: unknown;
  questions: string[];
  question_video_urls: string[];
}

export async function interviewJoin(token: string): Promise<InterviewJoinResponse> {
  const params = new URLSearchParams({ token });
  const res = await fetch(`${API_BASE}/interview/join?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Invalid or expired interview link.");
  }
  return res.json();
}

export async function interviewStart(token: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/interview/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to start interview.");
  }
  return res.json();
}

export interface InterviewChatResponse {
  reply: string;
}

export async function interviewChat(
  token: string,
  transcriptSoFar: string,
  candidateMessage: string
): Promise<InterviewChatResponse> {
  const res = await fetch(`${API_BASE}/interview/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      transcript_so_far: transcriptSoFar,
      candidate_message: candidateMessage,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to get interviewer response.");
  }
  return res.json();
}

export interface InterviewCompleteResponse {
  message: string;
  score: number | null;
}

export async function interviewComplete(
  token: string,
  transcript: string
): Promise<InterviewCompleteResponse> {
  const res = await fetch(`${API_BASE}/interview/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, transcript }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to complete interview.");
  }
  return res.json();
}

export async function interviewUploadRecording(
  token: string,
  file: File
): Promise<{ recording_url: string }> {
  const form = new FormData();
  form.append("token", token);
  form.append("file", file);
  const res = await fetch(`${API_BASE}/interview/upload-recording`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to upload recording.");
  }
  return res.json();
}
