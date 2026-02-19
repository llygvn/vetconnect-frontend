"""
VetConnect AI Backend — vetbrain_api.py
=======================================
FastAPI microservice wrapping VetBrain.

SETUP:
    pip install fastapi uvicorn sentence-transformers pandas

RUN:
    uvicorn vetbrain_api:app --reload --port 8001

NOTES:
  - Place this file in the SAME folder as vetbrain.py and clean-data.csv
  - Frontend calls POST /chat with { "message": "...", "session_id": "..." }
  - CORS is open for local dev — restrict origins in production
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid
import time

from vetbrain import VetBrain, RATE_LIMIT_SECONDS

# ── App & CORS ───────────────────────────────────────────────────────────────
app = FastAPI(title="VetConnect AI Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # TODO: Restrict to frontend domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load VetBrain once at startup ────────────────────────────────────────────
brain = VetBrain()

@app.on_event("startup")
async def startup_event():
    brain.load_data()
    print("✅ VetBrain loaded and ready.")

# ── In-memory session store ──────────────────────────────────────────────────
# Shape: {
#   session_id: {
#     "stage"        : str,
#     "data"         : dict,
#     "last_message" : float  ← unix timestamp of last user message (Rate Limiting)
#   }
# }
sessions: dict = {}

# ── Request / Response models ────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message:    str
    session_id: Optional[str] = None   # If None, a new session is created

class ChatResponse(BaseModel):
    reply:        str
    session_id:   str
    booking_data: Optional[dict] = None

# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "vetbrain": brain.status}

# ── Session reset ─────────────────────────────────────────────────────────────
class ResetRequest(BaseModel):
    session_id: Optional[str] = None

@app.post("/session/reset")
def reset_session(req: ResetRequest):
    new_sid = str(uuid.uuid4())
    sessions[new_sid] = {"stage": "idle", "data": {}, "last_message": 0.0}
    if req.session_id and req.session_id in sessions:
        del sessions[req.session_id]
    return {"session_id": new_sid}

# ── Helper: strip LLM output artifacts ───────────────────────────────────────
def _clean_extracted(text: str) -> str:
    text = text.replace('\n', ' ').replace('\r', ' ').strip()
    prefixes = ("output:", "answer:", "result:", "entity:", "breed:",
                "species:", "name:", "animal:")
    changed = True
    while changed:
        changed = False
        for prefix in prefixes:
            if text.lower().startswith(prefix):
                text = text[len(prefix):].strip()
                changed = True
    text = text.strip("\"'.,;:()[]")
    words = text.split()
    if len(words) <= 3:
        return text.strip()
    return words[0]

# ── Helper: build symptom LLM prompt ─────────────────────────────────────────
def _build_symptom_prompt(raw: str, match, score: float, known_animal: str = None) -> str:
    # Use the animal we already know from the session as the ground truth.
    # This prevents the LLM from hallucinating a different animal (e.g. "sheep").
    subject = known_animal if known_animal else "the pet"

    if match is not None and score >= 0.3:
        disease = match.get("Disease",        "a condition")
        advice  = match.get("Advice / Notes", "Monitor closely.")
        return (
            f"The user has a {subject}. They report: {raw}. "
            f"The closest matching condition in the knowledge base is: {disease}. "
            f"Write a 2-3 sentence professional response addressed specifically to a {subject} owner. "
            f"Note: {advice} "
            f"Do NOT mention any other animal species. Only refer to the {subject}."
        )
    # Below threshold — no reliable KB match
    return (
        f"The user has a {subject}. They say: '{raw}'. "
        f"Give a 2-3 sentence professional veterinary response about these symptoms in a {subject}. "
        f"Do NOT mention any other animal species. Only refer to the {subject}. "
        "End with 'Only a licensed veterinarian can confirm the exact cause.'"
    )

# ── Helper: resume prompt during booking ─────────────────────────────────────
def _get_resume_prompt(stage: str, data: dict) -> str:
    prompts = {
        "ask_service":  "what service do you need? (Consultation, Vaccination, Spay & Neuter, Deworming, Grooming)",
        "ask_animal":   "what type of animal is your pet?",
        "ask_breed":    f"what breed is your {data.get('animal', 'pet')}?",
        "ask_pet_name": "what's your pet's name?",
        "ask_datetime": "what date and time works for you? (e.g. 03/20/2026 10:00 AM)",
        "confirm":      "please type 'confirm' to finalize or 'cancel' to start over.",
    }
    return prompts.get(stage, "how can I help you?")

# ── Main chat endpoint ────────────────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # ── Session setup ────────────────────────────────────────────────────────
    sid = req.session_id or str(uuid.uuid4())
    if sid not in sessions:
        sessions[sid] = {"stage": "idle", "data": {}, "last_message": 0.0}
    session = sessions[sid]

    # ── RISK 1: Rate Limiting (3-second cooldown) ─────────────────────────────
    now = time.time()
    elapsed = now - session.get("last_message", 0.0)
    if elapsed < RATE_LIMIT_SECONDS:
        remaining = round(RATE_LIMIT_SECONDS - elapsed, 1)
        return ChatResponse(
            reply=f"⏳ Please wait {remaining}s before sending another message.",
            session_id=sid,
        )
    session["last_message"] = now  # Update timestamp immediately

    # ── RISK 6: Input Sanitization ───────────────────────────────────────────
    raw = brain.sanitize_input(req.message)
    if not raw:
        return ChatResponse(reply="Please type a message.", session_id=sid)

    lower = raw.lower()

    # ── RISK 2: Safety Layer — ALWAYS runs first, even mid-booking ───────────
    # This hard override must execute before any other routing logic.
    emergency = brain.check_safety(raw)
    if emergency:
        # Safety alert resets booking flow to avoid leaving user stuck mid-session
        session["stage"] = "idle"
        session["data"]  = {}
        return ChatResponse(reply=emergency, session_id=sid)

    # ── Mid-booking flow ──────────────────────────────────────────────────────
    if session["stage"] not in ("idle", "done"):
        result = _handle_booking_flow(session, raw)
        if isinstance(result, tuple):
            reply, booking_data = result
            return ChatResponse(reply=reply, session_id=sid, booking_data=booking_data)
        return ChatResponse(reply=result, session_id=sid)

    # ── Intent routing ────────────────────────────────────────────────────────

    # --- BOOKING INTENT ---
    booking_keywords = [
        "book", "appointment", "schedule", "magpa-check", "gusto",
        "punta", "yes", "oo", "sige", "sure", "i want to", "gusto ko",
    ]
    if any(kw in lower for kw in booking_keywords):
        session["stage"] = "ask_service"
        session["data"]  = {}
        return ChatResponse(
            reply=(
                "I'd be happy to help you book an appointment! 🐾\n\n"
                "What service do you need?\n\n"
                "• Consultation\n• Vaccination\n• Spay & Neuter\n"
                "• Deworming\n• Grooming"
            ),
            session_id=sid,
        )

    # --- CLINIC HOURS ---
    if any(kw in lower for kw in ["hour", "open", "close", "oras", "bukas", "schedule"]):
        return ChatResponse(
            reply=(
                "🕐 Clinic Hours:\n"
                "Monday – Saturday: 7:00 AM – 8:00 PM\n"
                "Sunday: Closed\n\n"
                "Appointments outside these hours cannot be booked."
            ),
            session_id=sid,
        )

    # --- SERVICES ---
    if any(kw in lower for kw in ["service", "offer", "serbisyo", "magkano", "price", "cost"]):
        return ChatResponse(
            reply=(
                "🏥 We offer the following services:\n\n"
                "• Consultation — bring medical records\n"
                "• Vaccination — anti-rabies, 5-in-1, Parvo\n"
                "• Spay & Neuter — fasting required (8–12 hrs)\n"
                "• Deworming — every 2 weeks for puppies\n"
                "• Grooming — inform us if your pet is aggressive\n\n"
                "Would you like to book an appointment?"
            ),
            session_id=sid,
        )

    # --- CANCEL / RESCHEDULE ---
    if any(kw in lower for kw in ["cancel", "reschedule", "move", "change appointment"]):
        return ChatResponse(
            reply=(
                "To cancel or reschedule, please go to the My Appointments tab "
                "in the sidebar and select the appointment you'd like to modify. "
                "You can also call our clinic directly during business hours."
            ),
            session_id=sid,
        )

    # --- SYMPTOM SCREENING INTENT ---
    symptom_intent_kw = [
        "check symptom", "symptoms", "my pet is", "my dog is", "my cat is",
        "not eating", "sick", "ayaw kumain", "matamlay", "may sakit", "nagsusuka",
        "vomit", "diarrhea", "limp", "lethargy", "wound", "rash", "coughing",
        "sneezing", "scratch", "laging tulog", "hindi kumakain",
    ]
    if any(kw in lower for kw in symptom_intent_kw):
        # If user said "check symptoms" with no actual symptom, prompt for more
        if lower.strip() in ("check symptom", "check symptoms", "symptoms", "symptom"):
            return ChatResponse(
                reply=(
                    "Sure! Please describe your pet's symptoms and I'll help assess them.\n\n"
                    "For example: 'My dog has been vomiting for 2 days' or "
                    "'My cat is not eating and seems lethargic.'"
                ),
                session_id=sid,
            )

        # Semantic match against knowledge base (threshold 0.3)
        # Extract animal mentioned in the message to anchor the LLM response.
        mentioned_animal = next(
            (a for a in brain.supported_animals if a.lower() in lower), None
        )
        match, score = brain.find_best_match(raw, "symptoms")
        prompt = _build_symptom_prompt(raw, match, score, known_animal=mentioned_animal)
        reply  = brain.ask_llm(prompt)
        reply += (
            "\n\nWould you like to book a consultation? "
            "Just say 'yes' or 'book an appointment' and I'll get you started. 🐾"
        )
        return ChatResponse(reply=reply, session_id=sid)

    # --- WILDLIFE CHECK ---
    for animal in brain.wildlife_animals:
        if animal.lower() in lower:
            return ChatResponse(
                reply=(
                    f"🦁 We're a domestic and farm animal clinic — "
                    f"we don't handle {animal}s. "
                    "Please contact a wildlife rescue center or zoo veterinarian."
                ),
                session_id=sid,
            )

    # --- GENERIC FALLBACK via LLM ---
    reply = brain.ask_llm(raw)
    return ChatResponse(reply=reply, session_id=sid)


# ── Booking Flow Handler ──────────────────────────────────────────────────────
def _handle_booking_flow(session: dict, raw: str):
    """
    Manages the multi-turn guided booking conversation.
    Stages: ask_service → ask_animal → ask_breed → ask_pet_name → ask_datetime → confirm → done
    Returns: str (reply) or (str, dict) tuple on final confirmation.
    """
    import re

    stage = session["stage"]
    data  = session["data"]
    lower = raw.lower()

    # ── Quick escape hatch ────────────────────────────────────────────────────
    exit_phrases = [
        "cancel", "stop", "exit", "quit", "nevermind", "never mind",
        "start over", "ulit", "basta",
    ]
    if any(p in lower for p in exit_phrases) and stage != "confirm":
        session["stage"] = "idle"
        session["data"]  = {}
        return "No problem! Booking cancelled. How else can I help you? 🐾"

    # ── Mid-booking FAQ shortcuts ─────────────────────────────────────────────
    if any(kw in lower for kw in ["clinic hour", "anong oras", "open", "bukas", "close", "sarado"]):
        return (
            "🕐 We're open Mon–Sat: 7:00 AM – 8:00 PM. Sunday: Closed.\n\n"
            f"Now back to your booking — {_get_resume_prompt(stage, data)}"
        )

    if any(kw in lower for kw in ["how much", "magkano", "price", "cost", "presyo"]):
        return (
            "💰 Pricing varies per procedure. Please call the clinic for exact rates.\n\n"
            f"Now back to your booking — {_get_resume_prompt(stage, data)}"
        )

    # ── Mid-booking symptom interrupt ─────────────────────────────────────────
    # If the user mentions a symptom/health concern while booking, acknowledge it,
    # give brief advice, then gently guide them back to the booking flow.
    # This runs AFTER the safety layer (in the main chat() handler), so emergency
    # keywords are already handled before we ever reach here.
    mid_symptom_kw = [
        "scratching", "vomit", "diarrhea", "not eating", "ayaw kumain",
        "sick", "matamlay", "may sakit", "nagsusuka", "lethargic",
        "lethargy", "coughing", "sneezing", "wound", "rash",
        "hindi kumakain", "laging tulog", "itchy", "swollen", "limping",
        "hiccup", "shaking", "trembling", "nagtatae",
        "btw", "by the way", "sa totoo lang", "actually my",
        "also my", "my dog has", "my cat has", "my pet has",
    ]
    # Detect symptom concern: must contain a symptom keyword AND feel like a
    # health statement rather than a direct answer to the current booking stage.
    is_symptom_aside = any(kw in lower for kw in mid_symptom_kw)

    # Only treat as symptom aside if the message doesn't look like a direct
    # booking answer (e.g. a date, a breed name, or "confirm").
    is_direct_booking_answer = (
        any(kw in lower for kw in ["confirm", "cancel"])
        or bool(re.search(r"\d{1,2}/\d{1,2}/\d{4}", raw))   # date pattern
        or stage in ("ask_breed", "ask_pet_name")               # these stages expect names, not symptoms
        or (stage == "ask_service" and any(
            kw in lower for kw in ["consult", "vacc", "spay", "deworm", "groom",
                                   "bakuna", "kapon", "purga", "ligo"]))
    )

    if is_symptom_aside and not is_direct_booking_answer:
        known_animal = data.get("animal")  # e.g. "Dog" — already confirmed by the booking flow
        match, score = brain.find_best_match(raw, "symptoms")
        prompt = _build_symptom_prompt(raw, match, score, known_animal=known_animal)
        advice = brain.ask_llm(prompt)
        return (
            f"I noticed a health concern — let me address that first! 🩺\n\n"
            f"{advice}\n\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            f"Now, back to your booking — {_get_resume_prompt(stage, data)}"
        )

    # ── Correction detection ──────────────────────────────────────────────────
    correction_triggers = [
        "pala", "actually", "mali", "correction", "i meant", "i mean",
        "not a", "not my", "i made a mistake", "no wait",
        "oh wait", "pakipalitan", "ibig sabihin", "baguhin",
    ]
    is_correction = any(t in lower for t in correction_triggers)
    has_data = bool(data)

    if is_correction and has_data and stage != "ask_service":
        service_map_corr = {
            "consult": "Consultation", "checkup": "Consultation", "check-up": "Consultation",
            "vacc": "Vaccination",     "bakuna": "Vaccination",
            "spay": "Spay & Neuter",  "neuter": "Spay & Neuter", "kapon": "Spay & Neuter",
            "deworm": "Deworming",     "purga": "Deworming",
            "groom": "Grooming",       "ligo": "Grooming",
        }
        corrected_service = next(
            (svc for kw, svc in service_map_corr.items() if kw in lower), None
        )
        if corrected_service and stage in ("ask_animal", "ask_breed", "ask_pet_name", "ask_datetime", "confirm"):
            data["service"] = corrected_service
            for key in ("animal", "breed", "pet_name", "datetime"):
                data.pop(key, None)
            session["stage"] = "ask_animal"
            return (
                f"No worries! Service updated to {corrected_service}.\n\n"
                "What type of animal is your pet? (e.g. Dog, Cat, Rabbit, Bird, Horse…)"
            )

        corrected_animal = next(
            (a for a in brain.supported_animals + brain.wildlife_animals if a.lower() in lower), None
        )
        if corrected_animal and stage in ("ask_breed", "ask_pet_name", "ask_datetime", "confirm"):
            if corrected_animal in brain.wildlife_animals:
                session["stage"] = "idle"
                return f"🦁 Sorry, we don't handle {corrected_animal}s. Please contact a wildlife rescue center."
            data["animal"] = corrected_animal
            for key in ("breed", "pet_name", "datetime"):
                data.pop(key, None)
            session["stage"] = "ask_breed"
            return (
                f"Updated! So it's a {corrected_animal}.\n\n"
                f"What breed is your {corrected_animal.lower()}? (Type 'unknown' if not sure)"
            )

        if stage in ("ask_pet_name", "ask_datetime", "confirm") and data.get("animal"):
            animal_for_breed = data["animal"]
            whitelist_corr = brain.BREED_WHITELIST.get(animal_for_breed, [])
            # Direct whitelist check first (catches aspin, puspin, etc.)
            direct_breed = next(
                (w for w in whitelist_corr if w in lower or lower in w), None
            )
            if direct_breed:
                candidate = direct_breed.title()
            else:
                candidate = _clean_extracted(brain.extract_entity_with_ai(raw, "breed"))
            if (candidate
                    and candidate.lower() not in ("none", "null", "")
                    and brain.validate_breed_for_species(candidate, animal_for_breed)):
                data["breed"] = candidate
                data.pop("datetime", None)
                existing_name = data.get("pet_name")
                if existing_name:
                    session["stage"] = "ask_datetime"
                    return (
                        f"Breed corrected to {candidate}! 🐾\n\n"
                        f"Keeping the name as {existing_name}. "
                        "When would you like to schedule the appointment?\n"
                        "Format: MM/DD/YYYY HH:MM AM/PM (e.g. 03/20/2026 10:00 AM)\n\n"
                        "Our clinic is open Mon–Sat, 7:00 AM – 8:00 PM."
                    )
                else:
                    session["stage"] = "ask_pet_name"
                    return f"Breed corrected to {candidate}! 🐾\n\nWhat's your pet's name?"

        # ── Name correction (expanded patterns) ──────────────────────────────
        # Matches: "name is X", "named X", "call him X", "siya si X",
        #          "it's actually X", "it's X", "its actually X", "correct name is X",
        #          "the name is X", "yung name X"
        name_match_corr = re.search(
            r"(?:name is|named|call (?:him|her|it|them)?|'s name is|siya si|pangalan|palitan"
            r"|it'?s(?:\s+actually)?|its(?:\s+actually)?|the name is|correct name is|yung name(?:\s+is)?)\s+([A-Za-z][A-Za-z\-']*)",
            raw, re.IGNORECASE,
        )
        if name_match_corr and stage in ("ask_pet_name", "ask_datetime", "confirm"):
            corrected_name = name_match_corr.group(1).strip().title()
            data["pet_name"] = corrected_name
            data.pop("datetime", None)
            session["stage"] = "ask_datetime"
            return (
                f"Got it — name updated to {corrected_name}! 🐾\n\n"
                "When would you like to schedule the appointment?\n"
                "Format: MM/DD/YYYY HH:MM AM/PM (e.g. 03/20/2026 10:00 AM)\n\n"
                "Our clinic is open Mon–Sat, 7:00 AM – 8:00 PM."
            )

        # ── Fallback: correction with a short word = likely the corrected name ─
        # e.g. "oh wait, nnao" or "pala X" when already past ask_pet_name
        if stage in ("ask_pet_name", "ask_datetime", "confirm"):
            # Strip correction trigger words and see if what's left is a simple name
            stripped = re.sub(
                r"\b(oh wait|pala|actually|mali|correction|i meant|i mean|no wait|"
                r"pakipalitan|ibig sabihin|baguhin|it'?s|its|the name is|wait|,|')\b",
                " ", raw, flags=re.IGNORECASE,
            ).strip()
            words = [w for w in stripped.split() if re.match(r"^[A-Za-z\-']+$", w)]
            if len(words) == 1:
                corrected_name = words[0].title()
                data["pet_name"] = corrected_name
                data.pop("datetime", None)
                session["stage"] = "ask_datetime"
                return (
                    f"Got it — name updated to {corrected_name}! 🐾\n\n"
                    "When would you like to schedule the appointment?\n"
                    "Format: MM/DD/YYYY HH:MM AM/PM (e.g. 03/20/2026 10:00 AM)\n\n"
                    "Our clinic is open Mon–Sat, 7:00 AM – 8:00 PM."
                )

        if stage == "confirm":
            valid, _ = brain.validate_datetime(raw)
            if valid:
                data["datetime"] = raw
                return (
                    f"Schedule updated! Here's your revised appointment:\n\n"
                    f"• Service:   {data.get('service')}\n"
                    f"• Animal:    {data.get('animal')} ({data.get('breed')})\n"
                    f"• Pet Name:  {data.get('pet_name')}\n"
                    f"• Date/Time: {data.get('datetime')}\n\n"
                    "Type 'confirm' to book, or 'cancel' to start over."
                )

    # ── Stage: Ask Service ────────────────────────────────────────────────────
    if stage == "ask_service":
        service_map = {
            "consult":  "Consultation", "checkup":   "Consultation", "check-up": "Consultation",
            "vacc":     "Vaccination",  "bakuna":    "Vaccination",
            "spay":     "Spay & Neuter", "neuter":   "Spay & Neuter", "kapon": "Spay & Neuter",
            "deworm":   "Deworming",    "purga":     "Deworming",
            "groom":    "Grooming",     "ligo":      "Grooming",
        }
        matched_service = next(
            (svc for kw, svc in service_map.items() if kw in lower), None
        )
        if not matched_service:
            prompt = (
                f"Extract the vet service from this text: '{raw}'. "
                "Choose ONE from: Consultation, Vaccination, Spay & Neuter, Deworming, Grooming. "
                "Return ONLY the service name."
            )
            matched_service = brain.ask_llm_direct(prompt).strip()

        valid_services = ["Consultation", "Vaccination", "Spay & Neuter", "Deworming", "Grooming"]
        if matched_service not in valid_services:
            return (
                "I didn't catch that. Please choose one of:\n"
                "Consultation, Vaccination, Spay & Neuter, Deworming, or Grooming."
            )

        data["service"] = matched_service
        session["stage"] = "ask_animal"
        return f"Got it — {matched_service}! 🐾\n\nWhat type of animal is your pet?\n(e.g. Dog, Cat, Rabbit, Bird, Horse…)"

    # ── Stage: Ask Animal ─────────────────────────────────────────────────────
    if stage == "ask_animal":
        raw_lower = raw.lower().strip()
        direct_animal = next(
            (a for a in brain.supported_animals + brain.wildlife_animals if a.lower() in raw_lower),
            None,
        )
        animal = direct_animal if direct_animal else _clean_extracted(
            brain.extract_entity_with_ai(raw, "animal species")
        )

        supported = [a.lower() for a in brain.supported_animals]
        wildlife  = [w.lower() for w in brain.wildlife_animals]

        if animal.lower() in wildlife:
            session["stage"] = "idle"
            return (
                f"🦁 Sorry, we don't handle {animal}s. "
                "We only treat domestic and farm animals. "
                "Please contact a wildlife rescue center."
            )
        if animal.lower() not in supported or animal.lower() == "none":
            if not animal or animal.lower() == "none":
                return "I didn't catch the animal type. Could you tell me what kind of pet it is? (e.g. Dog, Cat, Bird)"
            return (
                f"We don't currently serve {animal}s. "
                "We accept: Dogs, Cats, Rabbits, Hamsters, Turtles, Birds, "
                "Cows, Hens, Pigs, Goats, Sheep, Horses, Ducks, Buffalos, Cattle, Donkeys, and Mules.\n\n"
                "What type of animal is your pet?"
            )

        data["animal"] = animal
        session["stage"] = "ask_breed"
        return f"A {animal} — got it! 🐕\n\nWhat breed is your {animal.lower()}? (Type 'unknown' if not sure)"

    # ── Stage: Ask Breed ──────────────────────────────────────────────────────
    if stage == "ask_breed":
        animal = data.get("animal", "Dog")
        universal_breeds = {
            "unknown", "mixed", "crossbreed", "mongrel", "native",
            "local", "not sure", "di alam", "ayoko alam", "mix",
        }
        if raw.lower().strip() in universal_breeds:
            data["breed"] = "Unknown"
            session["stage"] = "ask_pet_name"
            return "No problem! What's your pet's name?"

        # ── Direct whitelist match BEFORE calling LLM ─────────────────────
        # This catches Philippine local breeds (e.g. aspin, puspin) and other
        # short breed names that Mistral-7b may not recognise and returns "None".
        raw_lower_breed = raw.lower().strip()
        whitelist = brain.BREED_WHITELIST.get(animal, [])
        direct_match = next(
            (w for w in whitelist if w in raw_lower_breed or raw_lower_breed in w),
            None,
        )
        if direct_match:
            breed = direct_match.title()
            data["breed"] = breed
            session["stage"] = "ask_pet_name"
            return f"{breed} — lovely! 🐾\n\nWhat's your pet's name?"

        breed = _clean_extracted(brain.extract_entity_with_ai(raw, "breed", exclude=data.get("pet_name")))
        if not breed or breed.lower() in ("none", "null", ""):
            return (
                f"I didn't catch a breed name. What breed is your {animal.lower()}? "
                "(Type 'unknown' or 'mixed' if you're not sure)"
            )

        if not brain.validate_breed_for_species(breed, animal):
            return (
                f"'{breed}' doesn't seem to be a {animal} breed. "
                "Could you double-check? (Or type 'unknown' / 'mixed')"
            )

        data["breed"] = breed
        session["stage"] = "ask_pet_name"
        return f"{breed} — lovely! 🐾\n\nWhat's your pet's name?"

    # ── Stage: Ask Pet Name ───────────────────────────────────────────────────
    if stage == "ask_pet_name":
        import re as _re

        # 1. Try structured patterns (e.g. "his name is Coco", "si Coco")
        name_match = _re.search(
            r"(?:name is|named|call (?:him|her|it|them)?|'s name is|siya si|pangalan)\s+([A-Za-z]+)",
            raw, _re.IGNORECASE,
        )

        if name_match:
            name = name_match.group(1).strip().title()
        else:
            # 2. If input is short (1-3 words, alphabetic only) treat it as the name directly.
            #    This covers plain inputs like "mademosille", "Luna", "Coco Boy".
            clean_raw = raw.strip()
            words = clean_raw.split()
            if 1 <= len(words) <= 3 and all(_re.match(r"^[A-Za-z\-']+$", w) for w in words):
                name = clean_raw.title()
            else:
                # 3. Longer sentence — ask the LLM to extract the name
                name = _clean_extracted(brain.extract_entity_with_ai(raw, "pet name"))

        if not name or name.lower() in ("none", ""):
            return "What should I call your pet? Please enter their name."

        data["pet_name"] = name
        session["stage"] = "ask_datetime"
        return (
            f"Nice to meet {name}! 🐾\n\n"
            "When would you like to schedule the appointment?\n"
            "Format: MM/DD/YYYY HH:MM AM/PM (e.g. 03/20/2026 10:00 AM)\n\n"
            "Our clinic is open Mon–Sat, 7:00 AM – 8:00 PM."
        )

    # ── Stage: Ask Datetime ───────────────────────────────────────────────────
    if stage == "ask_datetime":
        valid, error = brain.validate_datetime(raw)
        if not valid:
            return f"⚠️ {error}\n\nPlease re-enter the date and time (e.g. 03/20/2026 10:00 AM)."

        data["datetime"] = raw
        session["stage"] = "confirm"
        return (
            "Almost done! Please confirm your appointment:\n\n"
            f"• Service:   {data.get('service')}\n"
            f"• Animal:    {data.get('animal')} ({data.get('breed')})\n"
            f"• Pet Name:  {data.get('pet_name')}\n"
            f"• Date/Time: {data.get('datetime')}\n\n"
            "Type 'confirm' to book, or 'cancel' to start over."
        )

    # ── Stage: Confirm ────────────────────────────────────────────────────────
    if stage == "confirm":
        if "confirm" in lower:
            booking_data = {
                "petName":           data.get("pet_name", ""),
                "species":           f"{data.get('animal', '')} ({data.get('breed', '')})",
                "service":           data.get("service", ""),
                "datetime":          data.get("datetime", ""),
                "status":            "upcoming",
                "appointmentStatus": "pending",
                "assignedVet":       "Pending assignment",
            }

            # ── BLOCKCHAIN: Generate immutable transaction hash ───────────────
            tx_hash = brain.generate_transaction_hash(booking_data)
            booking_data["transactionHash"] = tx_hash
            # In production:
            #   from blockchain_client import log_to_ganache
            #   tx_hash = log_to_ganache(booking_data)

            session["stage"] = "done"
            session["data"]  = {}

            reply = (
                "✅ Appointment booked successfully!\n\n"
                "Your request has been submitted and is pending confirmation. "
                "You'll receive a notification once a vet is assigned.\n\n"
                f"🔗 Blockchain Receipt (Transaction Hash):\n{tx_hash}\n\n"
                "You can view your appointment in the My Appointments tab."
            )
            # Return tuple so the caller can forward booking_data to the frontend
            return reply, booking_data

        elif "cancel" in lower:
            session["stage"] = "idle"
            session["data"]  = {}
            return "Booking cancelled. Feel free to start a new conversation anytime! 🐾"
        else:
            return "Please type 'confirm' to book your appointment, or 'cancel' to start over."

    # ── Fallback ──────────────────────────────────────────────────────────────
    session["stage"] = "idle"
    return "Something went wrong. Let's start over — how can I help you today?"