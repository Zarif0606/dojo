"""Run with: python -m unittest discover tests   (no network, no API key needed)"""
import os
import unittest

os.environ["LLM_PROVIDER"] = "mock"

from app import llm, worlds  # noqa: E402


class Repair(unittest.TestCase):
    def test_plan_is_repaired(self):
        messy = {"title": "T", "scenarios": [{"id": "A B", "label": "A", "scene": "mars"}, {"id": "A B", "label": "B"}],
                 "buyers": [{"scenario": "nope", "difficulty": "9", "age": "x", "gender": "x"}], "rubric": [{"id": "Trust!", "label": "Trust"}],
                 "live_meters": ["ghost", "trust"], "objections": ["a"] * 20}
        w = worlds.normalize_plan(messy, "selling solar")
        ids = [s["id"] for s in w["scenarios"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(s["scene"] in worlds.SCENES for s in w["scenarios"]))
        self.assertEqual(len(w["rubric"]), 6)
        self.assertEqual(len(w["live_meters"]), 3)
        self.assertTrue(set(w["live_meters"]) <= {r["id"] for r in w["rubric"]})
        self.assertGreaterEqual(len(w["buyers"]), 4)
        self.assertTrue(all(b["scenario"] in ids and 1 <= b["difficulty"] <= 5 for b in w["buyers"]))
        self.assertLessEqual(len(w["objections"]), 8)

    def test_refusal(self):
        with self.assertRaises(llm.LLMError):
            worlds.normalize_plan({"refuse": "That is a scam."}, "x")

    def test_persona_always_renders(self):
        sketch = {"scenario": "s", "role": "Owner", "personality": "blunt", "difficulty": 3, "gender": "f", "age": 70, "angle": ""}
        p = worlds.normalize_persona({"appearance": {"skin": "purple", "hairStyle": "mohawk", "facialHair": "beard"}, "accent": "en-XX"}, sketch, "w1", 0)
        a = p["appearance"]
        for k, allowed in worlds.FACE.items():
            self.assertIn(a[k], allowed)
        self.assertEqual(a["facialHair"], "none")  # adjusted to the person's gender
        self.assertIn(a["hairColor"], ("grey", "white"))  # adjusted to the person's age
        self.assertIn(p["accent"], worlds.ACCENTS)

    def test_world_ids_ignore_case_and_punctuation(self):
        self.assertEqual(worlds.world_id("Selling Solar!"), worlds.world_id("selling   solar"))


class Typography(unittest.TestCase):
    def test_closing_quotes_stay_closing(self):
        from app.typo import clean
        self.assertEqual(clean('He said "I can\'t promise a number." Then left.', "sentence"), "He said “I can’t promise a number.” Then left.")
        self.assertEqual(clean('Say "yes," then stop', "sentence"), "Say “yes,” then stop.")

    def test_kinds(self):
        from app.typo import clean
        self.assertEqual(clean("Selling Rooftop Solar Door To Door", "title"), "Selling rooftop solar door to door")
        self.assertEqual(clean("B2B Sales To CFOs.", "label"), "B2B sales to CFOs")
        self.assertEqual(clean("it's too expensive.", "quote"), "It’s too expensive")
        self.assertEqual(clean("a clear — confident start", "sentence"), "A clear, confident start.")
        self.assertEqual(clean("kind but wary.", "phrase"), "kind but wary")
        self.assertEqual(clean("Analytical, founder-friendly, long-term view", "trait"), "analytical, founder-friendly, long-term view")
        self.assertEqual(clean("B2B buyer, skeptical", "trait"), "B2B buyer, skeptical")
        self.assertEqual(clean("mark phillips", "name"), "Mark Phillips")
        self.assertEqual(clean("Ana de la Cruz", "name"), "Ana de la Cruz")


class Thinking(unittest.TestCase):
    def test_stream_filter_handles_split_tags(self):
        f, out = llm.ThinkFilter(), ""
        for chunk in ["Hi <thi", "nk>secret plan</th", "ink> there"]:
            out += f.feed(chunk)
        out += f.flush()
        self.assertEqual(out.replace("  ", " "), "Hi there")

    def test_parse_json_with_fences_and_thinking(self):
        self.assertEqual(llm.parse_json('<think>x</think>```json\n{"a": 1}\n```'), {"a": 1})


class AzureVoice(unittest.TestCase):
    P = {"id": "p1", "gender": "f", "age": 40, "accent": "en-GB", "personality": "kind"}

    def test_voice_matches_accent_and_gender(self):
        from app import tts_azure
        self.assertTrue(tts_azure.voice_for(self.P).startswith("en-GB-"))
        self.assertTrue(tts_azure.voice_for({**self.P, "accent": "en-scotland"}).startswith("en-GB-"))
        self.assertTrue(tts_azure.voice_for({**self.P, "accent": "en-XX", "gender": "m"}).startswith("en-US-"))

    def test_monthly_cap_and_ssml(self):
        from unittest import mock
        from app import tts_azure
        tts_azure.REGION, tts_azure.KEY = "canadacentral", "k"
        tts_azure._month, tts_azure.chars_used = "", 0
        sent = {}

        class R:
            status_code, content = 200, b"mp3"
        def fake(url, content, **kw):
            sent["body"] = content.decode(); return R()
        with mock.patch.object(tts_azure.httpx, "post", fake):
            self.assertEqual(tts_azure.speak(self.P, "Fine & <ok>", "neutral"), b"mp3")
            self.assertIn("Fine &amp; &lt;ok&gt;", sent["body"])
            tts_azure.chars_used = tts_azure.MONTHLY_CAP
            with self.assertRaises(tts_azure.AzureTTSError):
                tts_azure.speak(self.P, "more")


    def test_hd_for_us_then_falls_back_at_cap(self):
        from unittest import mock
        from app import tts_azure
        tts_azure.REGION, tts_azure.KEY = "canadacentral", "k"
        tts_azure._month, tts_azure.chars_used, tts_azure.hd_used = "", 0, 0
        seen = []

        class R:
            status_code, content = 200, b"mp3"
        def fake(url, content, **kw):
            seen.append(content.decode()); return R()
        us = {**self.P, "accent": "en-US"}
        with mock.patch.object(tts_azure.httpx, "post", fake):
            tts_azure.speak(us, "Hello there", "neutral")
            tts_azure.hd_used = tts_azure.HD_CAP
            tts_azure.speak(us, "Hello there", "neutral")
            tts_azure.speak({**self.P, "accent": "en-GB"}, "Hello there", "neutral")
        self.assertIn("DragonHD", seen[0])
        self.assertIn("MultilingualNeural", seen[1])
        self.assertIn("en-GB-", seen[2])


if __name__ == "__main__":
    unittest.main()


class Visitors(unittest.TestCase):
    """Two browsers (separate cookie jars) must not see each other's history, progress, worlds or coach memory."""
    def test_visitors_are_isolated(self):
        import tempfile, importlib, os as _os
        _os.environ["DOJO_DB"] = tempfile.mkdtemp() + "/t.db"
        from app import db as _db
        importlib.reload(_db)
        from app import main as _main
        importlib.reload(_main)
        from fastapi.testclient import TestClient
        a, b = TestClient(_main.app), TestClient(_main.app)
        worlds_a = a.get("/api/worlds").json(); b.get("/api/worlds")
        w = worlds_a[0]; full = a.get(f"/api/worlds/{w['id']}").json()
        sid = a.post("/api/sessions", json={"world_id": w["id"], "scenario": full["scenarios"][0]["id"], "persona_id": full["personas"][0]["id"], "difficulty": 3}).json()["id"]
        self.assertEqual(a.get(f"/api/sessions/{sid}").status_code, 200)
        self.assertEqual(b.get(f"/api/sessions/{sid}").status_code, 404)      # another visitor cannot open it
        self.assertEqual(b.post(f"/api/sessions/{sid}/end").status_code, 404)
        self.assertEqual(b.post(f"/api/sessions/{sid}/turn-stream", json={"text": "Hello there, thanks for your time today.", "seconds": 3}).status_code, 404)
        a.post(f"/api/sessions/{sid}/turn-stream", json={"text": "Hello there, thanks for your time today.", "seconds": 3})
        self.assertEqual(a.post(f"/api/sessions/{sid}/end").status_code, 200)
        self.assertEqual(len(a.get("/api/sessions").json()), 1)
        self.assertEqual(b.get("/api/sessions").json(), [])                    # history is per visitor
        self.assertEqual(b.get("/api/stats").json().get("total", b.get("/api/stats").json().get("count", 0)), 0)
        # worlds a visitor built are listed only for them; ready-made ones for everyone
        _db.CURRENT_VID.set(None); _db.save_world("custom-x", "x line", {**full, "id": "custom-x", "title": "X"}, builtin=False)
        ids = lambda c: {x["id"] for x in c.get("/api/worlds").json()}
        self.assertNotIn("custom-x", ids(a)); self.assertNotIn("custom-x", ids(b))
        t = _db.CURRENT_VID.set(a.cookies.get("dojo_vid")); _db.add_visitor_world("custom-x"); _db.CURRENT_VID.reset(t)
        self.assertIn("custom-x", ids(a)); self.assertNotIn("custom-x", ids(b))
        self.assertTrue(len(ids(b)) >= 10)                                      # the ready-made worlds are still there
