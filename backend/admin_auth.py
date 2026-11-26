"""Same-origin administrator operations, password-protected unless DKHUB_NO_AUTH=1."""
import ipaddress
import os
import secrets
import socket

from fastapi import Header, HTTPException, Request


def password_required() -> bool:
    return os.environ.get("DKHUB_NO_AUTH") != "1"


def local_host(hostname: str) -> bool:
    """Without a password, reject foreign domains that resolve to this server (DNS rebinding)."""
    own = socket.gethostname().lower()
    if hostname in {"localhost", own, f"{own}.local", f"{own}.fritz.box"}:
        return True
    try:
        ipaddress.ip_address(hostname)
        return True
    except ValueError:
        return False


def authorize(request: Request, password: str) -> None:
    if password_required():
        configured = os.environ.get("DKHUB_ADMIN_PASSWORD", "")
        if not configured:
            raise HTTPException(503, "Admin password not configured")
        if not secrets.compare_digest(password.encode(), configured.encode()):
            raise HTTPException(403, "Incorrect admin password")
    elif not local_host(request.url.hostname or ""):
        raise HTTPException(403, "Open DKHub by IP address or localhost")
    expected = f"{request.url.scheme}://{request.headers.get('host', '')}"
    if request.headers.get("origin") != expected:
        raise HTTPException(403, "Invalid origin")


def require_admin(request: Request, password: str = Header(default="", alias="X-DKHub-Admin")) -> None:
    authorize(request, password)
