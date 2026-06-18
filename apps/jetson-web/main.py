import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "agentes_datos.db"
ENV_PATH = BASE_DIR / ".env"
SESSION_COOKIE = "jetson_web_session"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key.strip(), value)


load_env(ENV_PATH)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "poolside/laguna-m.1:free")
WEB_USER = os.getenv("JETSON_WEB_USER", "juanpablo")
WEB_PASSWORD = os.getenv("JETSON_WEB_PASSWORD", "doctorado2026")
SESSION_SECRET = os.getenv("JETSON_WEB_SESSION_SECRET", "change-this-session-secret")
APP_TOKEN = os.getenv("JETSON_WEB_APP_TOKEN", "")
AUTH_ENABLED = os.getenv("JETSON_WEB_AUTH_ENABLED", "true").lower() != "false"


class LoginRequest(BaseModel):
    username: str
    password: str


class AIRequest(BaseModel):
    prompt: str
    system_prompt: Optional[str] = None
    is_json: bool = False
    model: Optional[str] = None


class StateRequest(BaseModel):
    state: Dict[str, Any]


class BitacoraRequest(BaseModel):
    fecha: str
    contenido: str


app = FastAPI(title="Jetson Web API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://192.168.1.230:8000",
        "https://juanpa7799.github.io",
        "https://JuanPa7799.github.io",
    ],
    allow_origin_regex=r"https://[-a-zA-Z0-9]+\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db() -> None:
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                app_id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS bitacoras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id TEXT NOT NULL,
                fecha TEXT NOT NULL,
                contenido TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )


def sign_session(username: str, issued_at: Optional[int] = None) -> str:
    ts = issued_at or int(time.time())
    payload = f"{username}:{ts}"
    signature = hmac.new(
        SESSION_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}:{signature}"


def verify_session(token: str) -> bool:
    try:
        username, ts_text, signature = token.split(":", 2)
        ts = int(ts_text)
    except ValueError:
        return False
    if username != WEB_USER:
        return False
    if int(time.time()) - ts > 60 * 60 * 24 * 14:
        return False
    expected = sign_session(username, ts).rsplit(":", 1)[1]
    return hmac.compare_digest(expected, signature)


def require_auth(
    x_app_token: Optional[str] = Header(None),
    x_session_token: Optional[str] = Header(None),
    session: Optional[str] = Cookie(None, alias=SESSION_COOKIE),
) -> None:
    if not AUTH_ENABLED:
        return
    if APP_TOKEN and x_app_token and hmac.compare_digest(APP_TOKEN, x_app_token):
        return
    if x_session_token and verify_session(x_session_token):
        return
    if session and verify_session(session):
        return
    raise HTTPException(status_code=401, detail="No autorizado")


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "openrouter_configured": bool(OPENROUTER_API_KEY),
        "model": OPENROUTER_MODEL,
        "database": str(DB_PATH),
    }


@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response) -> Dict[str, Any]:
    if payload.username != WEB_USER or payload.password != WEB_PASSWORD:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    session_token = sign_session(WEB_USER)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 14,
    )
    return {"ok": True, "session_token": session_token}


@app.post("/api/auth/logout")
def logout(response: Response) -> Dict[str, Any]:
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.get("/api/auth/status")
def auth_status(
    x_session_token: Optional[str] = Header(None),
    session: Optional[str] = Cookie(None, alias=SESSION_COOKIE),
) -> Dict[str, Any]:
    authenticated = bool(
        (x_session_token and verify_session(x_session_token))
        or (session and verify_session(session))
    )
    return {"authenticated": authenticated}


@app.post("/api/ai/chat")
async def ai_chat(payload: AIRequest, _: None = Depends(require_auth)) -> Dict[str, Any]:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY no configurada")

    system_prompt = payload.system_prompt or (
        "Eres un asistente experto, claro y práctico. Responde en español."
    )
    user_prompt = payload.prompt
    if payload.is_json:
        user_prompt += "\n\nDevuelve únicamente JSON válido, sin explicación adicional."

    request_body = {
        "model": payload.model or OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.4,
        "max_tokens": 1800,
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://192.168.1.230:8000",
        "X-Title": "Jetson Predoctorado",
    }

    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=request_body,
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text[:500])

    data = response.json()
    text = data["choices"][0]["message"]["content"]
    return {"text": text, "model": data.get("model") or request_body["model"]}


@app.get("/api/state/{app_id}")
def get_state(app_id: str, _: None = Depends(require_auth)) -> Dict[str, Any]:
    with db() as conn:
        row = conn.execute(
            "SELECT state_json, updated_at FROM app_state WHERE app_id = ?",
            (app_id,),
        ).fetchone()
    if not row:
        return {"state": None, "updated_at": None}
    return {"state": json.loads(row["state_json"]), "updated_at": row["updated_at"]}


@app.put("/api/state/{app_id}")
def put_state(app_id: str, payload: StateRequest, _: None = Depends(require_auth)) -> Dict[str, Any]:
    updated_at = int(time.time())
    with db() as conn:
        conn.execute(
            """
            INSERT INTO app_state(app_id, state_json, updated_at)
            VALUES(?, ?, ?)
            ON CONFLICT(app_id) DO UPDATE SET
                state_json = excluded.state_json,
                updated_at = excluded.updated_at
            """,
            (app_id, json.dumps(payload.state, ensure_ascii=False), updated_at),
        )
    return {"ok": True, "updated_at": updated_at}


@app.post("/api/bitacora")
def save_bitacora(payload: BitacoraRequest, _: None = Depends(require_auth)) -> Dict[str, Any]:
    created_at = int(time.time())
    with db() as conn:
        cur = conn.execute(
            """
            INSERT INTO bitacoras(app_id, fecha, contenido, created_at)
            VALUES(?, ?, ?, ?)
            """,
            ("predoctorado", payload.fecha, payload.contenido, created_at),
        )
    return {"ok": True, "id": cur.lastrowid, "created_at": created_at}


if not PUBLIC_DIR.exists():
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
