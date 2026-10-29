# Deploy the demo on Render (free or Starter)

Dojo is one Docker service. The Dockerfile listens on `$PORT` (default 7860), so it also runs on Hugging Face Spaces, Fly.io or any Docker host.

1. Push this repo to GitHub (public).
2. On https://render.com choose **New, Web Service**, pick the repo, runtime **Docker**. The free plan works; Starter ($7/month) never sleeps.
3. Under **Environment** add:
   - `NEBIUS_API_KEY` (required): a Token Factory key. Use one with a low spend limit.
   - `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` (optional): neural voices from the free Azure Speech tier. Without them the browser's voices are used.
   - `TAVILY_API_KEY` (optional): turns on live web research and "practise on a real prospect".
4. Set the **Health Check Path** to `/healthz`.
5. Deploy. Your demo URL is shown on the service page. A free service sleeps when idle; a free uptime monitor pinging `/healthz` every 5 minutes keeps it awake.

Spend is limited by the caps in the Dockerfile (`DAILY_CALL_CAP`, `WORLD_BUILD_CAP`, per-visitor hourly limits) and the monthly character caps for voices. Data (built worlds, history) lives in `/tmp` and resets whenever the service restarts; the ready-made worlds are loaded from the repo every time.
