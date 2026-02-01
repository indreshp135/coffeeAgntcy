# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.session import get_session
from database.models import User

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-use-long-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))


class AuthService:
    """Simple JWT auth: register (username/password) and login. No email verification."""

    async def register(self, username: str, password: str, role: str = "candidate") -> dict:
        if not username or not username.strip():
            raise ValueError("Username is required")
        if not password or len(password) < 6:
            raise ValueError("Password must be at least 6 characters")
        role = (role or "candidate").lower()
        if role not in ("candidate", "employer"):
            raise ValueError("Role must be 'candidate' or 'employer'")

        async with get_session() as session:
            existing = (
                await session.execute(select(User).where(User.username == username.strip()))
            ).scalar_one_or_none()
            if existing:
                raise ValueError("Username already taken")

            password_hash = bcrypt.hashpw(
                password.encode("utf-8"), bcrypt.gensalt()
            ).decode("utf-8")
            user = User(
                username=username.strip(),
                password_hash=password_hash,
                role=role,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)

        return self._token_response(user)

    async def login(self, username: str, password: str) -> dict:
        if not username or not password:
            raise ValueError("Username and password are required")

        async with get_session() as session:
            user = (
                await session.execute(select(User).where(User.username == username.strip()))
            ).scalar_one_or_none()
            if not user or not bcrypt.checkpw(
                password.encode("utf-8"), user.password_hash.encode("utf-8")
            ):
                raise ValueError("Invalid username or password")

        return self._token_response(user)

    def _token_response(self, user: User) -> dict:
        expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
        payload = {
            "sub": str(user.id),
            "username": user.username,
            "role": user.role,
            "exp": expire,
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": user.username,
            "role": user.role,
            "user_id": user.id,
        }
