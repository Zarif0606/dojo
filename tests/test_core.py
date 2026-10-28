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


if __name__ == "__main__":
    unittest.main()
