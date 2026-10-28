# Dojo in Docker (Render, Hugging Face Spaces, anywhere). Listens on $PORT, default 7860. Only NEBIUS_API_KEY is a secret; everything else has a safe default here.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV LLM_PROVIDER=nebius \
    NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1/ \
    NEBIUS_MODEL_PLANNER=nvidia/Nemotron-3-Ultra-550b-a55b \
    NEBIUS_MODEL_COACH=nvidia/Nemotron-3-Ultra-550b-a55b \
    NEBIUS_MODEL_CASTER=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B \
    NEBIUS_MODEL_PERSONA=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B \
    NEBIUS_MODEL_DIRECTOR=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B \
    NEBIUS_EXTRA_PLANNER='{"chat_template_kwargs": {"enable_thinking": false}}' \
    NEBIUS_EXTRA_COACH='{"chat_template_kwargs": {"enable_thinking": true}}' \
    NEBIUS_EXTRA_CASTER='{"chat_template_kwargs": {"enable_thinking": false}}' \
    NEBIUS_EXTRA_PERSONA='{"chat_template_kwargs": {"enable_thinking": false}}' \
    NEBIUS_EXTRA_DIRECTOR='{"chat_template_kwargs": {"enable_thinking": false}}' \
    RATE_LIMIT_PER_HOUR=60 WORLD_RATE_PER_HOUR=6 DAILY_CALL_CAP=1500 WORLD_BUILD_CAP=30 \
    KOKORO=off DOJO_DB=/tmp/dojo.db
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
