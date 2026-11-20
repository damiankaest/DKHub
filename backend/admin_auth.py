"""Same-origin, password-protected administrator operations."""
import os
import secrets

from fastapi import Header, HTTPException, Request


def authorize(request: Request, password: str) -> None:
    configured = os.environ.get("DKHUB_ADMIN_PASSWORD", "")
    if not configured:
        raise HTTPException(503, "Admin password not configured")
    if not secrets.compare_digest(password.encode(), configured.encode()):
        raise HTTPException(403, "Incorrect admin password")
    expected = f"{request.url.scheme}://{request.headers.get('host', '')}"
    if request.headers.get("origin") != expected:
        raise HTTPException(403, "Invalid origin")


def require_admin(request: Request, password: str = Header(default="", alias="X-DKHub-Admin")) -> None:
    authorize(request, password)
