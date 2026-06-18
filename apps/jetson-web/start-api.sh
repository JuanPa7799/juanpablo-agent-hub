#!/usr/bin/env bash
set -euo pipefail

cd /workspace/jetson-web
exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
