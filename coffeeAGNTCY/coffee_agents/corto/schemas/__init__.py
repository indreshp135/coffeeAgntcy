# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import json
from typing import Any

# ---------------------------------------------------------------------------
# Resume schema: root has "resume" with personal_information, education,
# work_experience, skills, summary, additional_details.
# ---------------------------------------------------------------------------
RESUME_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "resume": {
            "type": "object",
            "properties": {
                "personal_information": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "email": {"type": "string", "format": "email"},
                        "phone": {"type": "string"},
                        "address": {
                            "type": "object",
                            "properties": {
                                "street": {"type": "string"},
                                "city": {"type": "string"},
                                "state": {"type": "string"},
                                "zip_code": {"type": "string"},
                                "country": {"type": "string"},
                            },
                            "required": ["street", "city", "state", "zip_code", "country"],
                        },
                    },
                    "required": ["name", "email", "phone", "address"],
                },
                "education": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "degree": {"type": "string"},
                            "major": {"type": "string"},
                            "school": {"type": "string"},
                            "graduation_year": {"type": "integer"},
                        },
                        "required": ["degree", "major", "school", "graduation_year"],
                    },
                },
                "work_experience": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "position": {"type": "string"},
                            "company": {"type": "string"},
                            "start_date": {"type": "string", "format": "date"},
                            "end_date": {"type": ["string", "null"], "format": "date"},
                            "responsibilities": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": ["position", "company", "start_date", "responsibilities"],
                    },
                },
                "skills": {"type": "array", "items": {"type": "string"}},
                "summary": {"type": "string"},
                "additional_details": {
                    "type": "object",
                    "properties": {
                        "languages": {"type": "array", "items": {"type": "string"}},
                        "certifications": {"type": "array", "items": {"type": "string"}},
                        "interests": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["languages", "certifications", "interests"],
                },
            },
            "required": [
                "personal_information",
                "education",
                "work_experience",
                "skills",
                "summary",
                "additional_details",
            ],
        },
    },
    "required": ["resume"],
}

RESUME_SCHEMA_JSON = json.dumps(RESUME_SCHEMA)


def _get(d: dict[str, Any] | None, *keys: str) -> Any:
    """Get first present value from d for any of the given keys (supports snake_case and camelCase)."""
    if not d or not isinstance(d, dict):
        return None
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def resume_schema_to_profile(resume_data: dict[str, Any]) -> dict[str, Any]:
    """Map resume schema (root with 'resume' key) to flat CandidateProfile fields.
    Accepts both snake_case and camelCase, and nested (personal_information) or flatter shapes.
    """
    resume = (resume_data or {}).get("resume") or resume_data
    if not resume or not isinstance(resume, dict):
        return {}
    # Personal info: nested personal_information / personalInformation, or top-level name/email/phone/address
    pi = (
        resume.get("personal_information")
        or resume.get("personalInformation")
        or {}
    )
    if not isinstance(pi, dict):
        pi = {}
    if not pi:
        pi = {
            "name": _get(resume, "name", "full_name"),
            "email": _get(resume, "email"),
            "phone": _get(resume, "phone"),
            "address": _get(resume, "address"),
        }
    addr = pi.get("address") if isinstance(pi, dict) else {}
    if isinstance(addr, dict):
        pass
    elif addr is None and isinstance(pi, dict):
        addr = {}
    else:
        addr = addr if isinstance(addr, dict) else {}
    addr_str = None
    if isinstance(addr, dict) and any(v for v in (addr.values() if addr else [])):
        parts = [
            addr.get("street"),
            addr.get("city"),
            addr.get("state"),
            addr.get("zip_code"),
            addr.get("country"),
        ]
        addr_str = ", ".join(p for p in parts if p)
    elif isinstance(addr, str):
        addr_str = addr
    addl = resume.get("additional_details") or resume.get("additionalDetails") or {}
    edu = resume.get("education") or []
    if not isinstance(edu, list):
        edu = []
    education_flat = [
        {
            "degree": _get(e, "degree"),
            "major": _get(e, "major", "field"),
            "institution": _get(e, "school", "institution"),
            "school": _get(e, "school", "institution"),
            "year": _get(e, "graduation_year", "graduationYear", "year"),
            "field": _get(e, "major", "field"),
        }
        for e in edu
        if isinstance(e, dict)
    ]
    work = resume.get("work_experience") or resume.get("workExperience") or []
    if not isinstance(work, list):
        work = []
    work_flat = []
    for w in work:
        if not isinstance(w, dict):
            continue
        start = _get(w, "start_date", "startDate")
        end = _get(w, "end_date", "endDate")
        duration = None
        if start or end:
            duration = " – ".join(
                p
                for p in (
                    str(start) if start else "",
                    str(end) if end else "Present",
                )
                if p
            )
        work_flat.append({
            "role": _get(w, "position", "role", "title"),
            "position": _get(w, "position", "role", "title"),
            "company": _get(w, "company", "employer"),
            "start_date": start,
            "end_date": end,
            "responsibilities": w.get("responsibilities") or w.get("responsibility") or [],
            "duration": duration,
            "summary": " ".join((w.get("responsibilities") or w.get("responsibility") or [])[:3])
            if (w.get("responsibilities") or w.get("responsibility"))
            else None,
        })
    full_name = _get(pi, "name", "full_name") if isinstance(pi, dict) else None
    email = pi.get("email") if isinstance(pi, dict) else None
    phone = pi.get("phone") if isinstance(pi, dict) else None
    return {
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "address": addr_str or (addr if isinstance(addr, str) else None),
        "summary": _get(resume, "summary"),
        "education": education_flat,
        "work_experience": work_flat,
        "skills": resume.get("skills") or [],
        "languages": (addl.get("languages") or []) if isinstance(addl, dict) else [],
        "certifications": (addl.get("certifications") or []) if isinstance(addl, dict) else [],
        "interests": (addl.get("interests") or []) if isinstance(addl, dict) else [],
        "projects": [],  # not in resume schema
    }


# ---------------------------------------------------------------------------
# Job description schema: root has "job_description" with company_information,
# job_details, summary, responsibilities, requirements, etc.
# ---------------------------------------------------------------------------
JD_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "job_description": {
            "type": "object",
            "properties": {
                "company_information": {
                    "type": "object",
                    "properties": {
                        "company_name": {"type": "string"},
                        "industry": {"type": "string"},
                        "website": {"type": "string", "format": "uri"},
                        "location": {
                            "type": "object",
                            "properties": {
                                "city": {"type": "string"},
                                "state": {"type": "string"},
                                "country": {"type": "string"},
                                "remote": {"type": "boolean"},
                            },
                            "required": ["city", "state", "country", "remote"],
                        },
                    },
                    "required": ["company_name", "location"],
                },
                "job_details": {
                    "type": "object",
                    "properties": {
                        "job_title": {"type": "string"},
                        "department": {"type": "string"},
                        "employment_type": {
                            "type": "string",
                            "enum": [
                                "Full-time",
                                "Part-time",
                                "Internship",
                                "Contract",
                                "Temporary",
                                "Freelance",
                            ],
                        },
                        "experience_level": {
                            "type": "string",
                            "enum": [
                                "Entry",
                                "Junior",
                                "Mid",
                                "Senior",
                                "Lead",
                                "Manager",
                            ],
                        },
                        "posted_date": {"type": "string", "format": "date"},
                        "application_deadline": {"type": ["string", "null"], "format": "date"},
                    },
                    "required": ["job_title", "employment_type"],
                },
                "summary": {"type": "string"},
                "responsibilities": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "requirements": {
                    "type": "object",
                    "properties": {
                        "education": {"type": "string"},
                        "experience_years": {"type": "integer", "minimum": 0},
                        "technical_skills": {"type": "array", "items": {"type": "string"}},
                        "soft_skills": {"type": "array", "items": {"type": "string"}},
                        "certifications": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["technical_skills"],
                },
                "preferred_qualifications": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "compensation": {
                    "type": "object",
                    "properties": {
                        "salary_min": {"type": "number"},
                        "salary_max": {"type": "number"},
                        "currency": {"type": "string"},
                        "benefits": {"type": "array", "items": {"type": "string"}},
                    },
                },
                "application_information": {
                    "type": "object",
                    "properties": {
                        "apply_link": {"type": "string", "format": "uri"},
                        "contact_email": {"type": "string", "format": "email"},
                        "instructions": {"type": "string"},
                    },
                },
            },
            "required": [
                "company_information",
                "job_details",
                "summary",
                "responsibilities",
                "requirements",
            ],
        },
    },
    "required": ["job_description"],
}

JD_SCHEMA_JSON = json.dumps(JD_SCHEMA)


def job_description_to_markdown(data: dict[str, Any] | None) -> str:
    """Convert job_description schema dict to markdown. Accepts root with 'job_description' key."""
    if not data:
        return ""
    jd = data.get("job_description") or data
    lines = []

    company = jd.get("company_information") or {}
    if company.get("company_name"):
        lines.append(f"# {company.get('company_name', '')}")
    if company.get("industry"):
        lines.append(f"**Industry:** {company['industry']}")
    if company.get("website"):
        lines.append(f"**Website:** {company['website']}")
    loc = company.get("location") or {}
    if isinstance(loc, dict) and (loc.get("city") or loc.get("country")):
        parts = [loc.get("city"), loc.get("state"), loc.get("country")]
        lines.append("**Location:** " + ", ".join(p for p in parts if p))
    if loc.get("remote"):
        lines.append("**Remote:** Yes")

    details = jd.get("job_details") or {}
    title = details.get("job_title")
    if title:
        lines.append(f"\n## {title}")
    if details.get("department"):
        lines.append(f"**Department:** {details['department']}")
    if details.get("employment_type"):
        lines.append(f"**Employment type:** {details['employment_type']}")
    if details.get("experience_level"):
        lines.append(f"**Experience level:** {details['experience_level']}")

    if jd.get("summary"):
        lines.append(f"\n### Summary\n{jd['summary']}")

    resp = jd.get("responsibilities") or []
    if resp:
        lines.append("\n### Responsibilities")
        for r in resp:
            lines.append(f"- {r}")

    req = jd.get("requirements") or {}
    if req:
        lines.append("\n### Requirements")
        if req.get("technical_skills"):
            lines.append("- **Technical skills:** " + ", ".join(req["technical_skills"]))
        if req.get("soft_skills"):
            lines.append("- **Soft skills:** " + ", ".join(req["soft_skills"]))
        if req.get("certifications"):
            lines.append("- **Certifications:** " + ", ".join(req["certifications"]))
        if req.get("experience_years") is not None:
            lines.append(f"- **Experience:** {req['experience_years']} years")
        if req.get("education"):
            lines.append(f"- **Education:** {req['education']}")

    pref = jd.get("preferred_qualifications") or []
    if pref:
        lines.append("\n### Preferred")
        for p in pref:
            lines.append(f"- {p}")

    comp = jd.get("compensation") or {}
    if comp.get("salary_min") or comp.get("salary_max"):
        s = f"{comp.get('currency', '')} {comp.get('salary_min', '')}-{comp.get('salary_max', '')}".strip()
        if s.strip("-"):
            lines.append(f"\n**Compensation:** {s}")
    if comp.get("benefits"):
        lines.append("**Benefits:** " + ", ".join(comp["benefits"]))

    app_info = jd.get("application_information") or {}
    if app_info.get("apply_link"):
        lines.append(f"\n**Apply:** {app_info['apply_link']}")
    if app_info.get("contact_email"):
        lines.append(f"**Contact:** {app_info['contact_email']}")
    if app_info.get("instructions"):
        lines.append(f"\n### How to apply\n{app_info['instructions']}")

    return "\n".join(lines).strip()
