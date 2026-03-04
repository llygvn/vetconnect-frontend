"""
VetConnect Interactive Tester
==============================
Type any symptom or message and see exactly what VetBrain does with it.
Run: python test_vetbrain_interactive.py
"""

from vetbrain import VetBrain
import time

# ── Setup ─────────────────────────────────────────────────────────────────────
brain = VetBrain()
print("⏳ Loading VetBrain...")
brain.load_data()
print("✅ Ready!\n")
print("=" * 65)
print("  VETCONNECT INTERACTIVE TESTER")
print("  Type any symptom, question, or message to evaluate.")
print("  Type 'quit' to exit.")
print("=" * 65)

while True:
    print()
    user_input = input("Your input: ").strip()

    if user_input.lower() in ("quit", "exit", "q"):
        print("Goodbye!")
        break

    if not user_input:
        continue

    print()
    print("─" * 65)

    # ── Step 1: Sanitize ──────────────────────────────────────────────────────
    sanitized = brain.sanitize_input(user_input)
    if sanitized != user_input:
        print(f"⚠️  SANITIZED INPUT: '{sanitized}'")
    else:
        print(f"✅ Input clean (no injection detected)")

    # ── Step 2: Safety Check ──────────────────────────────────────────────────
    print()
    print("📋 STEP 1 — SAFETY CHECK")
    tier, safety_msg = brain.check_safety(sanitized)
    tier_label = {
        "acute":  "🚨 ACUTE  — Emergency, needs immediate care",
        "urgent": "⚠️  URGENT — Needs vet within 24–48 hours",
        "ok":     "✅ OK     — Routine case, proceed normally",
    }.get(tier, tier)
    print(f"   Tier: {tier_label}")
    if tier == "acute":
        print(f"   Message: {safety_msg}")

    # ── Step 3: Semantic Match ────────────────────────────────────────────────
    print()
    print("📋 STEP 2 — SEMANTIC MATCHING")
    match, score = brain.find_best_match(sanitized, "symptoms")
    print(f"   Cosine Similarity Score: {score:.4f}")

    if score >= 0.70:
        confidence = "HIGH   (≥0.70) — Direct advice given"
    elif score >= 0.50:
        confidence = "MEDIUM (0.50–0.69) — Clarifying questions asked"
    else:
        confidence = "LOW    (<0.50) — Symptom extraction + retry"
    print(f"   Confidence Tier: {confidence}")

    if match:
        print(f"   Matched Condition : {match.get('Disease', 'N/A')}")
        print(f"   Matched Animal    : {match.get('Animal', 'N/A')}")
        print(f"   Symptoms on record: {match.get('Symptoms_Text', 'N/A')[:80]}...")
        print(f"   Dangerous flag    : {'🚨 YES' if match.get('is_dangerous') else '✅ NO'}")

    # ── Step 4: If low confidence, try symptom extraction ────────────────────
    if score < 0.50 and tier not in ("acute",):
        print()
        print("📋 STEP 3 — SYMPTOM EXTRACTION (Low confidence retry)")
        extracted = brain.extract_symptoms_from_narrative(sanitized)
        print(f"   Extracted symptoms: '{extracted}'")
        match2, score2 = brain.find_best_match(extracted, "symptoms")
        print(f"   Retry score       : {score2:.4f}")
        if score2 > score:
            print(f"   ✅ Improved! Using extracted match.")
            match, score = match2, score2
            if match:
                print(f"   New match: {match.get('Disease', 'N/A')}")
        else:
            print(f"   ❌ No improvement. Will ask for clarification.")

    # ── Step 5: AI Response ───────────────────────────────────────────────────
    if tier == "acute":
        print()
        print("📋 STEP 3 — AI RESPONSE")
        print(f"   [BYPASSED — Emergency alert sent directly]")
    else:
        print()
        print("📋 STEP 3 — AI RESPONSE")
        print("   Calling GPT-4o-mini via OpenRouter...")

        from vetbrain_api import _build_symptom_prompt
        is_urgent = (tier == "urgent") or (match and match.get("is_dangerous", False))
        prompt = _build_symptom_prompt(sanitized, match, score, is_urgent=is_urgent)
        response = brain.ask_llm(prompt)
        print()
        print("   ┌─ VetBrain Response ──────────────────────────────────────")
        for line in response.split("\n"):
            print(f"   │ {line}")
        print("   └──────────────────────────────────────────────────────────")

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print("📊 EVALUATION SUMMARY")
    print(f"   Input        : {user_input}")
    print(f"   Safety Tier  : {tier.upper()}")
    print(f"   Match Score  : {score:.4f}")
    print(f"   Condition    : {match.get('Disease', 'N/A') if match else 'No match'}")
    print(f"   Dangerous    : {'Yes' if match and match.get('is_dangerous') else 'No'}")
    print("─" * 65)
