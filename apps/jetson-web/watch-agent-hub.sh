#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="/workspace/jetson-web"
INTERVAL_SECONDS="${WATCH_INTERVAL_SECONDS:-120}"

mkdir -p "$WEB_DIR"

while true; do
  bash "$WEB_DIR/ensure-services.sh" >> "$WEB_DIR/ensure-services.log" 2>&1 || true
  sleep "$INTERVAL_SECONDS"
done
