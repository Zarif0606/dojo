"""Build the ready-made worlds once, with your real Nebius key, and save them to data/worlds/*.json.
They load as built-in worlds, so the demo still works when the daily caps are reached.

    .venv/bin/python scripts/seed_worlds.py            # builds the default list (about 4 worlds, a few cents)
    .venv/bin/python scripts/seed_worlds.py "line one" "line two"
"""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["DOJO_DB"] = str(Path(tempfile.mkdtemp()) / "seed.db")  # keep the real database clean

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
from app import db, worlds  # noqa: E402

# The most popular sales jobs. In every one of them you are the seller and the AI plays your prospects.
DEFAULT = [  # (id, profession shown on the card, line sent to the planner)
    ("car-sales", "Car salesperson", "Selling cars at a dealership"),
    ("insurance", "Insurance agent", "Selling life and home insurance to individuals and families"),
    ("mortgage", "Mortgage broker", "Selling mortgages as a mortgage broker"),
    ("real-estate", "Real estate agent", "Selling homes as a real estate agent"),
    ("solar", "Solar sales rep", "Selling rooftop solar door to door"),
    ("b2b-software", "B2B software rep", "B2B software sales to skeptical CFOs"),
    ("cold-calling", "Cold caller (SDR)", "Cold calling small business owners for a software company"),
    ("financial-advisor", "Financial advisor", "Selling financial plans as a financial advisor"),
    ("home-services", "Home renovation sales", "Selling roofing and home renovations to homeowners"),
    ("telecom-retail", "Telecom store rep", "Selling phone and internet plans in a retail store"),
    ("medical-devices", "Medical device rep", "Selling medical devices to clinics and hospitals"),
    ("gym", "Gym membership advisor", "Selling gym memberships"),
]

# Hard conversations outside sales: you are the one asking, explaining or delivering the news.
EXTRA = [
    ("ask-for-raise", "Asking for a raise", "Asking my manager for a raise after a strong year"),
    ("job-interview", "Job interview", "Interviewing for a software engineer job"),
    ("landlord", "Landlord repairs", "Asking my landlord to fix a problem and hold the rent steady"),
    ("seed-pitch", "Seed round pitch", "Pitching a seed round to a skeptical investor"),
    ("angry-customer", "Angry customer", "Calming down an angry customer as a support agent"),
    ("bad-news", "Delivering bad news", "Telling a client their project will be late"),
    ("tough-feedback", "Tough feedback", "Giving tough feedback to a team member who keeps missing deadlines"),
    ("negotiate-offer", "Negotiating a job offer", "Negotiating the salary on a job offer"),
]

db.init()
out = ROOT / "data" / "worlds"
out.mkdir(parents=True, exist_ok=True)
args = [a for a in sys.argv[1:] if not a.startswith("--")]
GROUP = {}
if "--extra" in sys.argv:
    jobs = EXTRA; GROUP = {j[0]: "life" for j in EXTRA}
elif args:
    jobs = [(f"custom-{i}", None, l) for i, l in enumerate(args)]
else:
    jobs = DEFAULT; GROUP = {j[0]: "sales" for j in DEFAULT}
for order, (slug_, profession, line) in enumerate(jobs):
    print(f"Building: {line}")
    final = None
    for ev in worlds.build_stream(line):
        if ev["type"] == "stage":
            print("  ·", ev["label"])
        elif ev["type"] == "persona":
            print("  cast", ev["persona"]["name"])
        elif ev["type"] == "error":
            sys.exit(f"  failed: {ev['message']}")
        elif ev["type"] == "done":
            final = ev["world"]
    final["id"] = "ready-" + slug_
    if profession:
        final["title"] = profession
    final["builtin"] = True
    final["order"] = order + (100 if GROUP.get(slug_) == "life" else 0)
    if slug_ in GROUP:
        final["group"] = GROUP[slug_]
    (out / f"{final['id']}.json").write_text(json.dumps(final, indent=1, ensure_ascii=False))
    print(f"  saved data/worlds/{final['id']}.json")
