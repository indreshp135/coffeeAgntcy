const API_BASE = "";

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
