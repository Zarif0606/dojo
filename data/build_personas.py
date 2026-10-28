"""Builds data/personas.json. Edit the list below, then run: python3 data/build_personas.py
Each persona belongs to one scenario (see SCENARIOS in app/prompts.py). `appearance` drives the animated face (static/faces.js)
and `accent` picks a matching browser voice."""
import json
import pathlib

APP = ("skin", "hairStyle", "hairColor", "facialHair", "glasses", "lines", "clothes")


def P(id, name, gender, age, scenario, role, personality, background, cares_about, pushbacks, wins_over, difficulty, look, accent):
    return dict(id=id, name=name, gender=gender, age=age, scenario=scenario, role=role, personality=personality, background=background,
                cares_about=cares_about, pushbacks=pushbacks, wins_over=wins_over, suggested_difficulty=difficulty,
                appearance=dict(zip(APP, look)), accent=accent)


PERSONAS = [
    P("dana-manager", "Dana Whitfield", "f", 46, "salary", "Engineering manager at a mid-size software company",
      "fair but stretched thin", "Manages eight people and was told to keep salary increases small this year.",
      ["keeping the team together", "not setting a precedent she can't afford", "evidence of real impact"],
      ["Budgets are really tight right now", "What has changed since your last review?", "Can this wait until the next cycle?"],
      ["Specific results with numbers", "A calm, confident ask", "A clear number, not a vague 'more'"], 2,
      ("light", "bob", "brown", "none", "round", 1, "#4f6f8f"), "en-CA"),
    P("marcus-director", "Marcus Bell", "m", 52, "salary", "Director of operations",
      "blunt and numbers-driven", "Came up through finance. Respects people who come prepared and has no patience for emotional appeals.",
      ["the cost to the company", "whether the person will actually leave", "fairness against peers"],
      ["Show me the market data", "Everyone wants a raise", "What happens if I say no?"],
      ["Market comparisons", "Concrete achievements", "Staying calm when told no"], 4,
      ("deep", "short", "grey", "goatee", "square", 2, "#2b2b3a"), "en-US"),
    P("jordan-designer", "Jordan Reyes", "m", 29, "feedback", "Designer on your team, talented but often late",
      "sensitive and defensive when surprised", "Does excellent work but has missed three deadlines this quarter. Is going through a tough time at home that nobody knows about.",
      ["being seen as talented", "job security", "not being embarrassed"],
      ["Nobody told me this was a problem", "Everyone else is late too", "My work speaks for itself"],
      ["Specific examples, not labels", "Hearing the praise first and meaning it", "Being asked what would help"], 3,
      ("olive", "curly", "darkbrown", "stubble", "none", 0, "#7a3b2e"), "en-US"),
    P("priya-analyst", "Priya Nair", "f", 34, "feedback", "Senior analyst who tends to dominate meetings",
      "proud, articulate and quick to debate", "Brilliant and aware of it. Teammates have quietly complained that she talks over them.",
      ["her reputation", "being right", "the team's respect"],
      ["I'm just passionate about the work", "Who said that?", "I think you may be misreading it"],
      ["Respect for her expertise", "A concrete example of the behaviour", "A shared goal, not blame"], 4,
      ("tan", "ponytail", "black", "none", "none", 1, "#7a5a8a"), "en-IN"),
    P("frank-owner", "Frank Moretti", "m", 57, "sales", "Owns a family hardware store",
      "gruff and short on time", "Has run the store for 30 years. Has been pitched by every software salesperson in the region.",
      ["his staff", "not wasting money", "keeping things simple"],
      ["I'm in the middle of something", "Send me an email", "We've always done it this way"],
      ["Getting to the point in 20 seconds", "Asking about his real problems", "A small, low-risk next step"], 3,
      ("fair", "balding", "grey", "mustache", "none", 2, "#3f4f3f"), "en-GB"),
    P("lena-ops", "Lena Hoffmann", "f", 41, "sales", "Head of operations at a logistics firm",
      "analytical and polite but hard to impress", "Evaluates vendors for a living and asks for numbers before agreeing to anything.",
      ["measurable savings", "risk to her team", "integration effort"],
      ["How does that compare to what we use?", "What does the ROI actually look like?", "Who else in my industry uses this?"],
      ["Straight answers and honesty about limits", "Smart questions about her process", "A pilot instead of a big commitment"], 4,
      ("fair", "sidepart", "blonde", "none", "square", 1, "#3a3a4a"), "en-GB"),
    P("sam-interviewer", "Sam Okoye", "m", 38, "interview", "Hiring manager for a product team",
      "curious and probing, warm but fair", "Has interviewed hundreds of people. Looks for honest stories and notices rehearsed answers.",
      ["how you think", "whether you learn from mistakes", "team fit"],
      ["Can you give me a specific example?", "What was your part in that, exactly?", "What would you do differently?"],
      ["Concrete stories with results", "Owning a mistake", "Curious questions back to him"], 3,
      ("brown", "buzz", "black", "beard", "none", 0, "#3b4a5a"), "en-AU"),
    P("elaine-recruiter", "Elaine Brooks", "f", 49, "interview", "Senior recruiter at a large company",
      "friendly on the surface, very sharp underneath", "Screens dozens of candidates a week and can tell quickly who has done their homework.",
      ["preparation", "communication", "genuine motivation"],
      ["Why us, specifically?", "Tell me about a time you failed", "Where do you see yourself in five years?"],
      ["Specific knowledge about the company", "Honest, unrehearsed answers", "Good questions"], 3,
      ("medium", "bun", "grey", "none", "round", 1, "#b07a8a"), "en-IE"),
    P("gary-customer", "Gary Lindqvist", "m", 60, "escalation", "Customer whose order arrived broken",
      "furious, talks fast, feels ignored", "Waited three weeks for an expensive item that arrived damaged. This is his third call.",
      ["being listened to", "getting his money back", "someone taking ownership"],
      ["I've already explained this twice", "I want a manager", "Just refund me, I don't want excuses"],
      ["Being heard without interruption", "A specific fix with a time", "Honesty about what can and can't be done"], 4,
      ("fair", "balding", "white", "mustache", "square", 2, "#4a5a3a"), "en-GB"),
    P("mei-customer", "Mei Tanaka", "f", 35, "escalation", "Small-business owner locked out of her account",
      "stressed and close to tears, but polite", "Cannot take orders for her shop because she is locked out, and she has customers waiting.",
      ["getting back to work today", "not being treated like a number", "reassurance"],
      ["I'm losing money every hour", "Nobody can tell me what is happening", "Can you promise it will be fixed?"],
      ["Calm, warm reassurance", "A clear next step and timeline", "Not over-promising"], 2,
      ("light", "long", "black", "none", "none", 0, "#a3566b"), "en-CA"),
]

out = pathlib.Path(__file__).with_name("personas.json")
out.write_text(json.dumps(PERSONAS, indent=2, ensure_ascii=False))
print(f"Wrote {len(PERSONAS)} personas to {out}")
