# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import os
import logging
from typing import Any

logger = logging.getLogger("corto.exchange.email")

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
SENDGRID_FROM_NAME = os.getenv("SENDGRID_FROM_NAME", "Corto Recruitment")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")


def _client():
    if not SENDGRID_API_KEY:
        return None
    try:
        from sendgrid import SendGridAPIClient
        return SendGridAPIClient(SENDGRID_API_KEY)
    except Exception as e:
        logger.warning("SendGrid not available: %s", e)
        return None


def _send(to_email: str, subject: str, html_content: str, plain_content: str = "") -> bool:
    client = _client()
    if not client:
        logger.warning("SendGrid not configured; skipping email to %s", to_email)
        return False
    try:
        from sendgrid.helpers.mail import Mail, Email, To, Content
        message = Mail(
            from_email=Email(SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME),
            to_emails=To(to_email),
            subject=subject,
            plain_text_content=Content("text/plain", plain_content or subject),
            html_content=Content("text/html", html_content),
        )
        client.send(message)
        logger.info("Email sent to %s subject=%r", to_email, subject)
        return True
    except Exception as e:
        logger.exception("SendGrid send failed to %s subject=%r: %s", to_email, subject, e)
        return False


def send_job_opportunity_email(
    to_email: str,
    full_name: str,
    job_title: str,
    job_description_md: str,
    profile_summary: str,
) -> bool:
    """Email candidate: you have a job opportunity (job + profile). No interview link yet."""
    logger.debug("send_job_opportunity_email to=%s job_title=%r", to_email, job_title)
    subject = f"Job opportunity: {job_title}"
    # Simple HTML template
    jd_html = (job_description_md or "").replace("\n", "<br>\n")
    profile_html = (profile_summary or "—").replace("\n", "<br>\n")
    html = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
    <p>Hi {full_name or 'Candidate'},</p>
    <p>We have a job opportunity that matches your profile.</p>
    <h2>{job_title}</h2>
    <div style="white-space: pre-wrap;">{jd_html}</div>
    <h3>Your profile (as we have it)</h3>
    <div style="white-space: pre-wrap;">{profile_html}</div>
    <p>Log in to the <a href="{FRONTEND_BASE_URL}">Corto portal</a> to view this opportunity and swipe right if interested to receive your interview link.</p>
    <p>— Corto Recruitment</p>
    </body>
    </html>
    """
    return _send(to_email, subject, html, plain_content=f"Job opportunity: {job_title}\n\nLog in to {FRONTEND_BASE_URL} to view and respond.")


def send_interview_link_email(
    to_email: str,
    full_name: str,
    job_title: str,
    interview_link: str,
) -> bool:
    """Email candidate: interview link (after right swipe)."""
    logger.debug("send_interview_link_email to=%s job_title=%r", to_email, job_title)
    subject = f"Your interview link: {job_title}"
    html = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
    <p>Hi {full_name or 'Candidate'},</p>
    <p>You expressed interest in <strong>{job_title}</strong>. Here is your interview link:</p>
    <p><a href="{interview_link}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px;">Start interview</a></p>
    <p>Or copy this URL: {interview_link}</p>
    <p>— Corto Recruitment</p>
    </body>
    </html>
    """
    return _send(to_email, subject, html, plain_content=f"Your interview link: {interview_link}")
