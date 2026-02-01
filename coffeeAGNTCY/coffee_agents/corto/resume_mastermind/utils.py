import json
import itertools
import networkx as nx
from fuzzywuzzy import fuzz
from pathlib import Path
from typing import Optional
from typing import List, Union, Optional
import google.generativeai as genai
# Round-robin API key manager
import json
import itertools

import requests
from chromadb.api.types import EmbeddingFunction

import time

class TimeoutError(Exception):
    pass

def _timeout_handler(signum, frame):
    raise TimeoutError("LLM call timed out")


def index_resume(text: str, doc_id: str, embedding_fn, collection, chroma_client):
    embeddings = embedding_fn([text])  # must pass a list
    collection.add(
        documents=[text],
        embeddings=embeddings,
        ids=[doc_id],
        metadatas=[{"type": "resume"}]
    )
    chroma_client.persist() 

# ---------------- LLM PARSER ----------------
PROMPT_TEMPLATE = """
You are an information extraction system.

Parse the following text into valid JSON that strictly follows this schema.
Return JSON only. No explanations.

Schema:
{schema}

Text:
{text}
"""



import signal


def _parse_with_structured_output(text: str, SCHEMA_JSON: dict) -> Optional[dict]:
    """Use common LLM structured output when schema is resume or job_description."""
    from langchain_core.messages import HumanMessage, SystemMessage

    props = SCHEMA_JSON.get("properties") or {}
    if "resume" in props:
        from common.llm import invoke_structured_with_retry, ResumeExtractOutput
        messages = [
            SystemMessage(content=PROMPT_TEMPLATE.format(schema=json.dumps(SCHEMA_JSON), text="(see next message)")),
            HumanMessage(content=text),
        ]
        try:
            result = invoke_structured_with_retry(messages, ResumeExtractOutput)
            return {"resume": result.resume}
        except Exception as e:
            print("❌ Structured resume parse failed:", e)
            return None
    if "job_description" in props:
        from common.llm import invoke_structured_with_retry, JobDescriptionExtractOutput
        messages = [
            SystemMessage(content=PROMPT_TEMPLATE.format(schema=json.dumps(SCHEMA_JSON), text="(see next message)")),
            HumanMessage(content=text),
        ]
        try:
            result = invoke_structured_with_retry(messages, JobDescriptionExtractOutput)
            return {"job_description": result.job_description}
        except Exception as e:
            print("❌ Structured JD parse failed:", e)
            return None
    return None


def parse_with_llm(text: str, retries: int = 3, timeout_sec: int = 15, key_manager=None, SCHEMA_JSON=None) -> Optional[dict]:
    if SCHEMA_JSON and (SCHEMA_JSON.get("properties") or {}).keys() & {"resume", "job_description"}:
        return _parse_with_structured_output(text, SCHEMA_JSON)

    for attempt in range(retries + 1):
        api_key = key_manager.get_key()  # rotates automatically
        print(f"Using API Key: {api_key}")

        genai.configure(api_key=api_key)

        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash-lite",
            generation_config={
                "temperature": 0,
                "response_mime_type": "application/json",
            }
        )

        prompt = PROMPT_TEMPLATE.format(
            text=text,
            schema=json.dumps(SCHEMA_JSON)
        )

        print(f"Parsing with LLM... attempt {attempt + 1}")
        print("Text", text[:10], "...")

        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(timeout_sec)

        try:
            response = model.generate_content(prompt)
            signal.alarm(0)  # cancel alarm

            raw = response.text
            return json.loads(raw)

        except TimeoutError:
            print("⏱️ LLM timed out, retrying with next key...")
            signal.alarm(0)
            continue

        except Exception as e:
            signal.alarm(0)
            print("❌ LLM parsing failed:", e)
            return None

    print("❌ All retries exhausted")
    return None


# ---------------- SKILL EXTRACTION ----------------
def extract_skills(parsed_json: dict) -> list[str]:
    """Extract skills from resume parsed JSON. Supports schema with root 'resume' (resume.skills array) or legacy top-level 'skills'."""
    skills = []
    if not parsed_json:
        return skills
    # New schema: { "resume": { "skills": ["a", "b", ...] } }
    if "resume" in parsed_json:
        resume = parsed_json["resume"]
        raw = resume.get("skills")
        if isinstance(raw, list):
            skills.extend(s for s in raw if isinstance(s, str) and s.strip())
        return list(set(s.strip().lower() for s in skills if s.strip()))
    # Legacy: top-level "skills" (list or dict of lists)
    if "skills" not in parsed_json:
        return skills
    sk = parsed_json["skills"]
    if isinstance(sk, list):
        skills.extend(s for s in sk if isinstance(s, str) and s.strip())
    elif isinstance(sk, dict):
        for value in sk.values():
            if isinstance(value, list):
                skills.extend(s for s in value if isinstance(s, str) and s.strip())
    return list(set(s.strip().lower() for s in skills if s.strip()))


def extract_jd_skills(jd_schema: dict) -> list[str]:
    """
    Extract skills from JD schema (schemas.job_description format).
    Expects root with 'job_description' containing requirements (technical_skills, soft_skills, certifications)
    and optional preferred_qualifications.
    """
    skills = []
    jd = (jd_schema or {}).get("job_description") or jd_schema
    if not jd:
        return skills
    req = jd.get("requirements") or {}
    for key in ("technical_skills", "soft_skills", "certifications"):
        for s in (req.get(key) or []):
            if isinstance(s, str) and s.strip():
                skills.append(s.strip().lower())
    for s in (jd.get("preferred_qualifications") or []):
        if isinstance(s, str) and s.strip():
            skills.append(s.strip().lower())
    return list(set(skills))

# ---------------- INDEX & PARSE RESUMES ----------------
def index_and_parse_resumes(resume_id: str, raw_text: str, collection, resume_tracker, SCHEMA_JSON):
    """
    Parse provided raw text → LLM JSON → store in Chroma.
    Uses provided resume_id as unique ID. Skips already-processed files.
    """
    # Skip if already processed
    if resume_tracker.is_processed(resume_id):
        print(f"Skipping already-processed resume: {resume_id}")
        r = collection.get(ids=[resume_id])
        if r:
            print(json.loads(r["documents"][0])["basics"]["name"], "found in Chroma.")
        return

    if not raw_text.strip():
        print(f"Empty text for resume: {resume_id}")
        return

    parsed_json = parse_with_llm(raw_text, SCHEMA_JSON)
    if parsed_json is None:
        print(f"Failed to parse {resume_id}")
        return

    # Convert parsed JSON to string for embedding
    json_text = json.dumps(parsed_json)

    # Add to Chroma collection using provided ID
    collection.add(
        documents=[json_text],
        ids=[resume_id],
        metadatas=[{"type": "resume"}]
    )
    
    # Mark as processed and store parsed data
    resume_tracker.mark_processed(resume_id, parsed_json)
    print(f"Parsed & indexed: {resume_id}")

# ---------------- PIPELINE ----------------
def parse_and_index_jd(jd_text: str, jd_filename: str, jd_tracker, SCHEMA_JSON) -> Optional[dict]:
    """
    Parse JD text and store result if not already processed.
    Uses JD filename as unique ID.
    
    Returns:
        Parsed JD JSON or None
    """
    # Skip if already processed
    if jd_tracker.is_processed(jd_filename):
        print(f"Skipping already-processed JD: {jd_filename}")
        parsed_jd = jd_tracker.get_parsed_data(jd_filename)
        return parsed_jd
    
    parsed_jd = parse_with_llm(jd_text, SCHEMA_JSON)
    
    if parsed_jd is not None:
        # Mark as processed and store parsed data
        jd_tracker.mark_processed(jd_filename, parsed_jd)
        print(f"Parsed & indexed JD: {jd_filename}")
    else:
        print(f"Failed to parse JD: {jd_filename}")
    
    return parsed_jd


def rank_resumes_for_jd(parsed_jd: dict, collection):
    """
    Full JD → CV ranking pipeline.
    Accepts JD in schema format (root key 'job_description') or legacy resume-style parsed JD.
    """

    # 1️⃣ Extract JD skills: schema format (job_description) or legacy (skills)
    if parsed_jd and "job_description" in parsed_jd:
        jd_skills = extract_jd_skills(parsed_jd)
    else:
        jd_skills = extract_skills(parsed_jd)

    # 2️⃣ Semantic search using embeddings
    chroma_results = collection.query(
        query_texts=[json.dumps(parsed_jd)],
        n_results=len(collection.get()["ids"][0]),  # get all
        include=["documents", "metadatas", "distances"]
    )

    candidate_texts = chroma_results["documents"][0]  # JSON strings of resumes
    candidate_ids = chroma_results["ids"][0]
    dist = chroma_results["distances"][0]
    embed_results = {cid: dist[i] for i, cid in enumerate(candidate_ids)}
    metadatas = chroma_results.get("metadatas") or ([[]] * len(candidate_ids))
    meta_list = metadatas[0] if metadatas else []
    id_to_metadata = {candidate_ids[i]: (meta_list[i] if i < len(meta_list) else {}) for i in range(len(candidate_ids))}

    ## 3️⃣ Fuzzy skill matching. jd skills vs resume skills (All resumes IN MAIN DB)
    ## not reranking. this another score to show along with embedding score
    fuzzy_results  = {}
    all_docs = collection.get()
    for i, doc_text in enumerate(all_docs["documents"]):
        ids = all_docs["ids"][i]
        doc_json = json.loads(doc_text)
        resume_skills = extract_skills(doc_json)
        fuzzy_matches = fuzzy_skill_match(jd_skills, resume_skills)
        fuzzy_results[ids] = fuzzy_matches
    

    ## sort embed_results by score descending
    embed_results = dict(sorted(embed_results.items(), key=lambda item: item[1], reverse=True))
    fuzzy_results = dict(sorted(fuzzy_results.items(), key=lambda item: item[1], reverse=True))

    return {
        "jd_skills": jd_skills,
        "embed_results": embed_results,
        "fuzzy_results": fuzzy_results,
        "id_to_metadata": id_to_metadata,
    }
    
# ---------------- CHROMA + EMBEDDINGS ----------------
class ChromaLlamaEmbedding(EmbeddingFunction):
    def __init__(self, embed_model):
        self.embed_model = embed_model

    def __call__(self, input: List[str]) -> List[List[float]]:
        # embed_documents expects a list of strings
        return self.embed_model.embed_documents(input)

    def name(self):
        return "llama_cpp"
    
    
class LlamaServerEmbedding(EmbeddingFunction):
    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8080",
        model: str = "Qwen3-Embedding-8B",
        timeout: int = 60,
    ):
        self.url = f"{base_url}/v1/embeddings"
        self.model = model
        self.timeout = timeout

    def __call__(self, input: List[str]) -> List[List[float]]:
        payload = {
            "model": self.model,
            "input": input,
        }

        resp = requests.post(
            self.url,
            json=payload,
            timeout=self.timeout,
        )
        resp.raise_for_status()

        data = resp.json()["data"]
        return [item["embedding"] for item in data]

    def embed(self, input: str | List[str]) -> List[float] | List[List[float]]:
        """Embed one or more texts. Single string -> one vector; list -> list of vectors."""
        if isinstance(input, str):
            return self([input])[0]
        return self(input)

    def name(self) -> str:
        return "llama_server"


class APIKeyManager:
    """
    Cycles through API keys in a round-robin fashion.
    Supports apikey.json in two formats:
      1. Plain list: ["key1", "key2", ...]
      2. Nested dict: {"apiKeys": ["key1", "key2", ...]}
    """

    def __init__(self, api_key_file: str):
        with open(api_key_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Handle nested format
        if isinstance(data, dict) and "apiKeys" in data:
            keys = data["apiKeys"]
        elif isinstance(data, list):
            keys = data
        else:
            raise ValueError("apikey.json must be a non-empty list or a dict with 'apiKeys'")

        if not keys:
            raise ValueError("apikey.json must contain at least one API key")

        self._cycle = itertools.cycle(keys)

    def get_key(self) -> str:
        """Return the next API key in round-robin order."""
        return next(self._cycle)


from rapidfuzz import process, fuzz

def fuzzy_skill_match(list1, list2):
    """
    Compute the average of the best fuzzy match scores from list1 to list2.

    Args:
        list1 (list of str): Skills to match
        list2 (list of str): Skills to match against

    Returns:
        float: Average best match score (0-100)
    """
    if not list1 or not list2:
        return 0.0  # handle empty lists
    
    def normalize(skill):
        return skill.lower().replace("-", " ").replace(".", "").strip()
    
    list1_norm = [normalize(s) for s in list1]
    list2_norm = [normalize(s) for s in list2]

    best_scores = []
    for skill in list1_norm:
        match, score, _ = process.extractOne(
            skill,
            list2_norm,
            scorer=fuzz.token_set_ratio
        )
        best_scores.append(score)
    
    average_score = sum(best_scores) / len(best_scores)
    return average_score




# ============ FILE PROCESSING TRACKER ============
class ProcessedFileTracker:
    """
    Tracks processed files to avoid reprocessing.
    Uses filename as unique ID.
    """

    def __init__(self, tracker_file: str):
        self.tracker_file = tracker_file
        self.processed = self._load()

    def _load(self) -> dict:
        """Load processed files from tracker file."""
        if not Path(self.tracker_file).exists():
            return {}
        try:
            with open(self.tracker_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}

    def _save(self):
        """Save processed files to tracker file."""
        with open(self.tracker_file, "w", encoding="utf-8") as f:
            json.dump(self.processed, f, indent=2)

    def is_processed(self, filename: str) -> bool:
        """Check if file has been processed."""
        return filename in self.processed

    def mark_processed(self, filename: str, parsed_data: dict = None):
        """Mark file as processed and optionally store parsed data."""
        self.processed[filename] = {
            "parsed": parsed_data if parsed_data else None,
            "timestamp": str(Path(filename).stat().st_mtime) if Path(filename).exists() else None
        }
        self._save()

    def get_parsed_data(self, filename: str) -> Optional[dict]:
        """Get stored parsed data for a file."""
        if filename in self.processed:
            return self.processed[filename].get("parsed")
        return None


# ============ TRACKER INSTANCES ============
def create_trackers(resume_tracker_file: str = ".processed_resumes.json", 
                   jd_tracker_file: str = ".processed_jds.json"):
    """Create tracker instances for resumes and JDs."""
    return {
        "resume": ProcessedFileTracker(resume_tracker_file),
        "jd": ProcessedFileTracker(jd_tracker_file)
    }