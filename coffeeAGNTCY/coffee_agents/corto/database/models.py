# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="candidate")  # candidate | employer
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class CandidateProfile(Base):
    """Candidate profile: education, work_experience, skills, languages, projects, etc."""

    __tablename__ = "candidate_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True, index=True)

    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    education: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of {degree, institution, year, ...}
    work_experience: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of {role, company, duration, summary}
    skills: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of strings
    languages: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of strings or {language, proficiency}
    certifications: Mapped[list | None] = mapped_column(JSON, nullable=True)
    interests: Mapped[list | None] = mapped_column(JSON, nullable=True)
    projects: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of {name, description, ...}

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now)


class ResumeBlob(Base):
    """Last uploaded resume file, extracted text, and parsed resume schema per candidate."""

    __tablename__ = "resume_blobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    file_content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # { "resume": { ... } }
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # structured JD
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")  # draft | published | closed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now)


class JobCandidate(Base):
    """Link job to candidate; stores invite, decision, score."""

    __tablename__ = "job_candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False, index=True)
    candidate_profile_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.id"), nullable=False, index=True)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    invited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    interview_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float | None] = mapped_column(nullable=True)
    candidate_decision: Mapped[str | None] = mapped_column(String(32), nullable=True)  # interested | rejected
    company_decision: Mapped[str | None] = mapped_column(String(32), nullable=True)  # placed | rejected
    selected_top_3: Mapped[bool] = mapped_column(default=False, nullable=False)


class InterviewSession(Base):
    """Interview session per job_candidate: token, questions, transcript, recording."""

    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_candidate_id: Mapped[int] = mapped_column(ForeignKey("job_candidates.id"), nullable=False, unique=True, index=True)
    interview_link_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    questions: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of strings
    question_videos: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of paths
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float | None] = mapped_column(nullable=True)
    recording_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

