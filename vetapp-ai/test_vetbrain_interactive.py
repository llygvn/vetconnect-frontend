"""
VetConnect Interactive Tester — RAG Edition
============================================
Type any symptom or message and see exactly what VetBrain RAG does with it.
Run: python test_vetbrain_interactive.py
"""

from vetbrain import VetBrain
import time

# ── Setup ─────────────────────────────────────────────────────────────────────
brain = VetBrain()
print("⏳ Loading VetBrain (RAG Mode)...")
brain.load_data()
print("✅ Ready!\n")
print("=" * 65)
print("  VETCONNECT INTERACTIVE TESTER — RAG EDITION")
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

    # ── Step 3: Safety Dataset — Dangerous Flag ───────────────────────────────
    print()
    print("📋 STEP 2 — SAFETY DATASET CHECK (Dangerous Flag)")
    match, score = brain.find_best_match(sanitized, "symptoms")
    is_dangerous = brain.is_match_dangerous(match)
    print(f"   Best match score : {score:.4f}")
    print(f"   Dangerous flag   : {'🚨 YES' if is_dangerous else '✅ NO'}")
    if match:
        print(f"   Matched symptoms : {match.get('Symptoms_Text', 'N/A')[:60]}...")

    # ── Step 4: RAG Retrieval ─────────────────────────────────────────────────
    print()
    print("📋 STEP 3 — RAG RETRIEVAL (Top-K Disease Records)")
    rag_results = brain.retrieve_rag_context(sanitized)

    if rag_results:
        print(f"   Retrieved {len(rag_results)} relevant records:")
        for i, r in enumerate(rag_results, 1):
            print(f"   [{i}] {r['disease']:<40} score: {r['score']:.4f}")
            print(f"       Symptoms: {r['symptoms'][:70]}...")
    else:
        print("   ❌ No relevant records found in RAG knowledge base.")

    # ── Step 5: AI Response ───────────────────────────────────────────────────
    print()
    print("📋 STEP 4 — AI RESPONSE (RAG-Grounded)")

    if tier == "acute":
        print("   [BYPASSED — Emergency alert sent directly]")
    else:
        print("   Building RAG prompt and calling GPT-4o-mini...")
        is_urgent = (tier == "urgent")  # csv_dangerous removed — 96% of rows are dangerous (unreliable)
        prompt = brain.build_rag_prompt(
            sanitized, rag_results,
            known_animal=None,
            is_urgent=is_urgent
        )
        print(f"\n   ┌─ RAG Prompt Preview (first 300 chars) ─────────────────")
        print(f"   │ {prompt[:300].replace(chr(10), chr(10) + '   │ ')}...")
        print(f"   └────────────────────────────────────────────────────────")

        response = brain.ask_llm(prompt)
        print()
        print("   ┌─ VetBrain RAG Response ─────────────────────────────────")
        for line in response.split("\n"):
            print(f"   │ {line}")
        print("   └────────────────────────────────────────────────────────")

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print("📊 EVALUATION SUMMARY")
    print(f"   Input            : {user_input}")
    print(f"   Safety Tier      : {tier.upper()}")
    print(f"   Dangerous Flag   : {'Yes' if is_dangerous else 'No'}")
    print(f"   RAG Records Found: {len(rag_results)}")
    if rag_results:
        print(f"   Top Match        : {rag_results[0]['disease']} (score: {rag_results[0]['score']:.4f})")
        print(f"   Top 3 Diseases   : {', '.join(r['disease'] for r in rag_results[:3])}")
    print("─" * 65)