#!/usr/bin/env bash
# Start Dojo: ./start.sh   (add "mock" to try it with no AI: ./start.sh mock)
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  echo "First run: setting up (about a minute)…"
  python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt || exit 1
fi
[ -f .env ] || cp .env.example .env
[ "$1" = "mock" ] && export LLM_PROVIDER=mock
echo "Dojo is starting at http://localhost:8000"
( sleep 2; command -v open >/dev/null && open http://localhost:8000 ) &
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
