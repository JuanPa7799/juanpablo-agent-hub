#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="/workspace/jetson-web"

api_ready() {
  curl -fsS "http://127.0.0.1:8000/api/health" >/dev/null 2>&1
}

if ! api_ready; then
  pkill -f "uvicorn main:app" >/dev/null 2>&1 || true
  cd "$WEB_DIR"
  nohup "$WEB_DIR/start-api.sh" > "$WEB_DIR/api.log" 2>&1 &
fi

if ! pgrep -f "cloudflared tunnel run jetson-agent-hub" >/dev/null 2>&1; then
  pkill cloudflared >/dev/null 2>&1 || true
  cd "$WEB_DIR"
  nohup "$WEB_DIR/start-cloudflare-stable.sh" > "$WEB_DIR/cloudflare-stable.log" 2>&1 &
fi

if ! pgrep -f "watch-agent-hub.sh" >/dev/null 2>&1; then
  cd "$WEB_DIR"
  nohup "$WEB_DIR/watch-agent-hub.sh" > "$WEB_DIR/watch-agent-hub.log" 2>&1 &
fi
