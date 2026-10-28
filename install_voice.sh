#!/bin/bash
# Free realistic voices (Kokoro) that run on this Mac. One-time setup, about 400 MB.   ./install_voice.sh
# Needs Homebrew. Adds a separate Python 3.12 (your main Python stays as it is).
set -e
cd "$(dirname "$0")"
command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh"; exit 1; }
[ -x /opt/homebrew/opt/python@3.12/bin/python3.12 ] || brew install python@3.12
[ -d .voice-venv ] || /opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .voice-venv
.voice-venv/bin/pip install -q --upgrade pip
.voice-venv/bin/pip install -q kokoro-onnx soundfile numpy
mkdir -p data/kokoro
B=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
[ -s data/kokoro/kokoro-v1.0.onnx ] || curl -L --progress-bar -o data/kokoro/kokoro-v1.0.onnx $B/kokoro-v1.0.onnx
[ -s data/kokoro/voices-v1.0.bin ] || curl -L --progress-bar -o data/kokoro/voices-v1.0.bin $B/voices-v1.0.bin
echo "Done. Stop and run ./start.sh again. The session header will say: voice: Kokoro (local)."
