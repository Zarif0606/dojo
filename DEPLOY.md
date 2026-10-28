# Deploy the demo on Hugging Face Spaces (free)

1. Make a free account at huggingface.co, then New Space: name `dojo`, SDK **Docker** (blank), hardware **CPU basic (free)**, visibility **Public**.
2. In the Space, open Settings, then **Variables and secrets**, and add one **secret**: `NEBIUS_API_KEY` = your Token Factory key. (Use a key with a low spend limit.)
3. Push this repo to the Space (the Space is a git repo):
   ```
   git remote add space https://huggingface.co/spaces/<your-username>/dojo
   git push space main
   ```
   When asked for a password, use a Hugging Face access token with write permission (Settings, Access Tokens).
4. Wait for the build (a few minutes). Your demo URL is `https://<your-username>-dojo.hf.space`. Open that direct URL, not the embedded huggingface.co page, so the microphone works.
5. A free Space sleeps when unused and wakes on the next visit (up to a minute). Open it just before you submit and during judging.

Spend is limited by the caps set in the Dockerfile (`DAILY_CALL_CAP`, `WORLD_BUILD_CAP`, per-visitor hourly limits). The hosted version uses the browser voice; the realistic local voice needs `./install_voice.sh` on your own machine.
