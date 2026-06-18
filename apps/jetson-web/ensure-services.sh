#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="/workspace/jetson-web"
REPO_DIR="/workspace/juanpablo-agent-hub"
REMOTE_URL="git@github.com:JuanPa7799/juanpablo-agent-hub.git"
API_URL="http://127.0.0.1:8000"
CF_LOG="$WEB_DIR/cloudflare.log"
CF_PID="$WEB_DIR/cloudflared.pid"
API_LOG="$WEB_DIR/api.log"
GIT_KEY="/jetson_real/home/jetsonclaw/.ssh/id_rsa"

export GIT_SSH_COMMAND="ssh -i $GIT_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

log() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*"
}

api_ready() {
  curl -fsS "$API_URL/api/health" >/dev/null 2>&1
}

ensure_api() {
  if api_ready; then
    log "FastAPI OK"
    return
  fi

  log "FastAPI not responding; restarting"
  pkill -f "uvicorn main:app" >/dev/null 2>&1 || true
  cd "$WEB_DIR"
  nohup "$WEB_DIR/start-api.sh" > "$API_LOG" 2>&1 &

  for _ in $(seq 1 30); do
    sleep 2
    if api_ready; then
      log "FastAPI restarted"
      return
    fi
  done

  log "FastAPI failed to become ready"
  return 1
}

ensure_repo() {
  mkdir -p "$(dirname "$REPO_DIR")"
  if [ ! -d "$REPO_DIR/.git" ]; then
    log "Cloning repo into $REPO_DIR"
    rm -rf "$REPO_DIR"
    git clone "$REMOTE_URL" "$REPO_DIR"
  else
    log "Repo exists; pulling latest"
    git -C "$REPO_DIR" fetch origin main
    git -C "$REPO_DIR" checkout main
    git -C "$REPO_DIR" pull --ff-only origin main
  fi

  git -C "$REPO_DIR" config user.name "Jetson Agent Hub"
  git -C "$REPO_DIR" config user.email "jetson-agent-hub@users.noreply.github.com"
}

extract_tunnel_url() {
  grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | tail -1 || true
}

tunnel_healthy() {
  local url="$1"
  [ -n "$url" ] || return 1
  if curl -fsS "$url/api/health" >/dev/null 2>&1; then
    return 0
  fi
  # Quick trycloudflare URLs can take time to resolve from the Jetson/local DNS.
  # If cloudflared is alive and emitted a URL, publish it and let GitHub Pages catch up.
  [ -f "$CF_PID" ] && kill -0 "$(cat "$CF_PID")" >/dev/null 2>&1
}

start_cloudflared() {
  log "Starting cloudflared temporary tunnel"
  pkill cloudflared >/dev/null 2>&1 || true
  : > "$CF_LOG"
  nohup cloudflared tunnel --url "$API_URL" > "$CF_LOG" 2>&1 &
  echo "$!" > "$CF_PID"
}

ensure_cloudflared() {
  local current_url
  current_url="$(extract_tunnel_url)"

  if [ -f "$CF_PID" ] && kill -0 "$(cat "$CF_PID")" >/dev/null 2>&1 && tunnel_healthy "$current_url"; then
    log "Cloudflare tunnel OK: $current_url"
    printf '%s\n' "$current_url"
    return
  fi

  start_cloudflared

  for _ in $(seq 1 60); do
    sleep 2
    current_url="$(extract_tunnel_url)"
    if tunnel_healthy "$current_url"; then
      log "Cloudflare tunnel ready: $current_url"
      printf '%s\n' "$current_url"
      return
    fi
  done

  log "Cloudflare tunnel failed to become healthy"
  tail -80 "$CF_LOG" || true
  return 1
}

update_github_pages_config() {
  local public_url="$1"
  local config_path="$REPO_DIR/docs/config.js"

  python3 - "$config_path" "$public_url" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
url = sys.argv[2]
text = path.read_text(encoding="utf-8")
new_text = re.sub(
    r'window\.JETSON_API_BASE\s*=\s*"[^"]*";',
    f'window.JETSON_API_BASE = "{url}";',
    text,
)
if new_text != text:
    path.write_text(new_text, encoding="utf-8")
PY

  if git -C "$REPO_DIR" diff --quiet -- docs/config.js; then
    log "GitHub Pages config already points to $public_url"
    return
  fi

  log "Updating GitHub Pages config to $public_url"
  git -C "$REPO_DIR" add docs/config.js
  git -C "$REPO_DIR" commit -m "Update Jetson API tunnel URL"
  git -C "$REPO_DIR" push origin main
}

main() {
  ensure_api
  ensure_repo
  local public_url
  public_url="$(ensure_cloudflared | tail -1)"
  update_github_pages_config "$public_url"
  log "Agent Hub automation completed"
}

main "$@"
