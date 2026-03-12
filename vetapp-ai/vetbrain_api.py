"""
VetConnect AI Backend — vetbrain_api.py (RAG Edition)
======================================================
FastAPI microservice wrapping VetBrain.

Changes from previous version:
- Replaced _build_symptom_prompt() with RAG-based retrieval
- GPT now reasons over top-K retrieved disease records
- Removed multi-tier similarity thresholds
- Kept all booking flow, correction handling, and safety logic intact

Booking stages:
  ask_service → ask_animal → ask_breed → ask_pet_name
  → ask_consultation_reason  (Consultation only)
  → ask_datetime → confirm → done

RUN:
    uvicorn vetbrain_api:app --reload --port 8001
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid
import time
import re

from vetbrain import VetBrain, RATE_LIMIT_SECONDS

# ── App & CORS ───────────────────────────────────────────────────────────────
app = FastAPI(title="VetConnect AI Backend", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

brain = VetBrain()

@app.on_event("startup")
async def startup_event():
    brain.load_data()
    print("✅ VetBrain RAG loaded and ready.")

sessions: dict = {}

class ChatRequest(BaseModel):
    message:    str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    reply:        str
    session_id:   str
    booking_data: Optional[dict] = None

@app.get("/health")
def health():
    return {"status": "ok", "vetbrain": brain.status}

class ResetRequest(BaseModel):
    session_id: Optional[str] = None

@app.post("/session/reset")
def reset_session(req: ResetRequest):
    new_sid = str(uuid.uuid4())
    sessions[new_sid] = {"stage": "idle", "data": {}, "last_message": 0.0, "correction_log": []}
    if req.session_id and req.session_id in sessions:
        del sessions[req.session_id]
    return {"session_id": new_sid}

# ── Helpers ───────────────────────────────────────────────────────────────────
def _clean_extracted(text: str) -> str:
    text = text.replace('\n', ' ').replace('\r', ' ').strip()
    prefixes = ("output:", "answer:", "result:", "entity:", "breed:", "species:", "name:", "animal:")
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


def _resume_prompt(stage: str, data: dict) -> str:
    prompts = {
        "ask_service":             "what service do you need? (Consultation, Vaccination, Spay & Neuter, Deworming, Grooming)",
        "ask_animal":              "what type of animal is your pet?",
        "ask_breed":               f"what breed is your {data.get('animal', 'pet')}?",
        "ask_pet_name":            "what's your pet's name?",
        "ask_consultation_reason": f"what is {data.get('pet_name', 'your pet')} experiencing?",
        "ask_datetime":            "what date and time works for you? (e.g. 03/20/2026 10:00 AM)",
        "confirm":                 "please type 'confirm' to finalize or 'cancel' to start over.",
    }
    return prompts.get(stage, "how can I help you?")


def _log_correction(session: dict, field: str, old_val, new_val):
    session.setdefault("correction_log", []).append({
        "field": field, "old_value": old_val, "new_value": new_val, "timestamp": time.time(),
    })


def _get_rag_reply(query: str, known_animal: str = None, is_urgent: bool = False) -> str:
    """
    Core RAG function: retrieve relevant disease records, build prompt, call GPT.
    Replaces the old _build_symptom_prompt() + single-match approach.
    """
    rag_results = brain.retrieve_rag_context(query)
    prompt = brain.build_rag_prompt(query, rag_results, known_animal=known_animal, is_urgent=is_urgent)
    return brain.ask_llm(prompt)


# ── Correction Intent ─────────────────────────────────────────────────────────
CORRECTION_TRIGGERS = [
    "pala", "actually", "mali", "correction", "i meant", "i mean",
    "not a", "not my", "i made a mistake", "no wait", "oh wait",
    "pakipalitan", "ibig sabihin", "baguhin", "wait actually",
    "sorry", "my bad", "typo", "wrong", "incorrect",
]

SERVICE_MAP = {
    "consult": "Consultation", "checkup": "Consultation", "check-up": "Consultation",
    "vacc":    "Vaccination",  "vaccine": "Vaccination",  "bakuna":  "Vaccination",
    "spay":    "Spay & Neuter", "neuter": "Spay & Neuter", "kapon": "Spay & Neuter",
    "deworm":  "Deworming",    "purga":   "Deworming",
    "groom":   "Grooming",     "ligo":    "Grooming",
}


def _handle_correction(session: dict, raw: str) -> Optional[str]:
    lower = raw.lower()
    data  = session["data"]
    stage = session["stage"]

    if not data:
        return None

    is_correction = any(t in lower for t in CORRECTION_TRIGGERS)
    has_date = bool(re.search(r"\d{1,2}/\d{1,2}/\d{4}", raw))
    has_time = bool(re.search(r"\d{1,2}:\d{2}\s*(AM|PM)", raw, re.IGNORECASE))

    # 1. Datetime correction
    datetime_already_set = bool(data.get("datetime"))
    if (has_date or has_time) and (is_correction or datetime_already_set):
        valid, error = brain.validate_datetime(raw)
        if valid:
            old_val = data.get("datetime", "not set")
            data["datetime"] = raw
            _log_correction(session, "datetime", old_val, raw)
            if stage in ("ask_datetime", "confirm"):
                session["stage"] = "confirm"
            return (
                f"Got it — schedule updated to {raw}. ✅\n\n"
                "Here's your updated booking:\n"
                f"• Service:   {data.get('service', '—')}\n"
                f"• Animal:    {data.get('animal', '—')} ({data.get('breed', '—')})\n"
                f"• Pet Name:  {data.get('pet_name', '—')}\n"
                + (f"• Reason:    {data.get('consultation_reason', '—')}\n" if data.get('service') == 'Consultation' else "")
                + f"• Date/Time: {data.get('datetime')}\n\n"
                "Type 'confirm' to book, or 'cancel' to start over."
            )
        if error and (has_date or has_time):
            return f"⚠️ {error}\n\nPlease re-enter the date and time (e.g. 03/20/2026 10:00 AM)."

    if not is_correction:
        return None

    def _next_after_correction() -> str:
        svc = data.get("service")
        needs_reason = (svc == "Consultation" and not data.get("consultation_reason"))
        needs_dt     = not data.get("datetime")
        reason_line  = (
            f"\u2022 Reason:    {data.get('consultation_reason', '\u2014')}\n"
            if svc == "Consultation" and data.get("consultation_reason") else ""
        )
        if needs_reason:
            pname = data.get("pet_name", "your pet")
            session["stage"] = "ask_consultation_reason"
            return f"What is {pname} experiencing? Please describe the symptoms or reason for the visit."
        if needs_dt:
            session["stage"] = "ask_datetime"
            return ("When would you like to schedule the appointment?\n"
                    "Format: MM/DD/YYYY HH:MM AM/PM (e.g. 03/20/2026 10:00 AM)\n\n"
                    "Our clinic is open Mon\u2013Sat, 7:00 AM \u2013 8:00 PM.")
        session["stage"] = "confirm"
        return (
            "Here's your updated booking:\n\n"
            f"\u2022 Service:   {data.get('service', '\u2014')}\n"
            f"\u2022 Animal:    {data.get('animal', '\u2014')} ({data.get('breed', '\u2014')})\n"
            f"\u2022 Pet Name:  {data.get('pet_name', '\u2014')}\n"
            + reason_line
            + f"\u2022 Date/Time: {data.get('datetime')}\n\n"
            "Type 'confirm' to book, or 'cancel' to start over."
        )

    # 2. Service correction
    new_service = next((svc for kw, svc in SERVICE_MAP.items() if kw in lower), None)
    if new_service and new_service != data.get("service"):
        old_val = data.get("service", "not set")
        data["service"] = new_service
        if new_service != "Consultation":
            data.pop("consultation_reason", None)
            data.pop("consultation_reason_raw", None)
        _log_correction(session, "service", old_val, new_service)
        svc = new_service
        reason_line = (
            f"\u2022 Reason:    {data.get('consultation_reason', '\u2014')}\n"
            if svc == "Consultation" and data.get("consultation_reason") else ""
        )
        session["stage"] = "confirm"
        return (
            f"No worries! Service updated to {new_service}. ✅\n\n"
            "Here's your updated booking:\n\n"
            f"\u2022 Service:   {data.get('service', '\u2014')}\n"
            f"\u2022 Animal:    {data.get('animal', '\u2014')} ({data.get('breed', '\u2014')})\n"
            f"\u2022 Pet Name:  {data.get('pet_name', '\u2014')}\n"
            + reason_line
            + f"\u2022 Date/Time: {data.get('datetime', '\u2014')}\n\n"
            "Type 'confirm' to book, or 'cancel' to start over."
        )

    # 3. Animal correction
    new_animal = next(
        (a for a in brain.supported_animals + brain.wildlife_animals if a.lower() in lower), None
    )
    if new_animal and new_animal != data.get("animal"):
        if new_animal in brain.wildlife_animals:
            session["stage"] = "idle"
            session["data"]  = {}
            return f"🦁 Sorry, we don't handle {new_animal}s. We only treat domestic and farm animals. Please contact a wildlife rescue centre."
        old_val = data.get("animal", "not set")
        data["animal"] = new_animal
        data.pop("breed", None)
        _log_correction(session, "animal", old_val, new_animal)
        if not data.get("breed"):
            session["stage"] = "ask_breed"
            return f"Updated — your pet is a {new_animal}! ✅\n\nWhat breed is your {new_animal.lower()}? (Type 'unknown' if not sure)"
        return f"Updated — your pet is a {new_animal}! ✅\n\n" + _next_after_correction()

    # 4. Breed correction
    if data.get("animal"):
        animal_for_breed = data["animal"]
        whitelist = brain.BREED_WHITELIST.get(animal_for_breed, [])
        direct_breed = next((w for w in whitelist if w in lower or lower.strip() in w), None)
        candidate = direct_breed.title() if direct_breed else _clean_extracted(
            brain.extract_entity_with_ai(raw, "breed", exclude=data.get("pet_name"))
        )
        if (candidate and candidate.lower() not in ("none", "null", "")
                and candidate.lower() != data.get("breed", "").lower()
                and brain.validate_breed_for_species(candidate, animal_for_breed)):
            old_val = data.get("breed", "not set")
            data["breed"] = candidate
            _log_correction(session, "breed", old_val, candidate)
            existing_name = data.get("pet_name")
            if existing_name:
                return f"Breed updated to {candidate}! ✅\n\n" + _next_after_correction()
            session["stage"] = "ask_pet_name"
            return f"Breed updated to {candidate}! ✅\n\nWhat's your pet's name?"

    # 5. Consultation reason correction
    if data.get("service") == "Consultation" and data.get("consultation_reason"):
        reason_triggers = ["reason", "symptom", "experiencing", "problem", "issue", "complaint", "concern", "rason", "dahilan"]
        if any(t in lower for t in reason_triggers):
            old_val = data.get("consultation_reason", "not set")
            new_reason = raw
            for trigger in CORRECTION_TRIGGERS:
                new_reason = re.sub(re.escape(trigger), "", new_reason, flags=re.IGNORECASE)
            new_reason = new_reason.strip().strip(".,;")
            if new_reason:
                complaint_label = brain.summarize_complaint(new_reason)
                data["consultation_reason"] = complaint_label
                data["consultation_reason_raw"] = new_reason
                _log_correction(session, "consultation_reason", old_val, complaint_label)
                safety_tier_c, safety_msg_c = brain.check_safety(new_reason)
                if safety_tier_c == "acute":
                    session["stage"] = "idle"
                    session["data"]  = {}
                    return safety_msg_c
                # RAG-based advice for corrected reason
                known_animal = data.get("animal")
                is_urgent = (safety_tier_c == "urgent")
                advice = _get_rag_reply(new_reason, known_animal=known_animal, is_urgent=is_urgent)
                return (f"Reason updated! ✅\n\n🩺 {advice}\n\n"
                        "━━━━━━━━━━━━━━━━━━━━\n" + _next_after_correction())

    # 6. Pet name correction
    name_match = re.search(
        r"(?:name is|named|call (?:him|her|it|them)?|'s name is|siya si|pangalan|"
        r"it'?s(?:\s+actually)?|its(?:\s+actually)?|the name is|correct name is|"
        r"yung name(?:\s+is)?)\s+([A-Za-z][A-Za-z\-']*)",
        raw, re.IGNORECASE,
    )
    if name_match:
        new_name = name_match.group(1).strip().title()
        old_val = data.get("pet_name", "not set")
        data["pet_name"] = new_name
        _log_correction(session, "pet_name", old_val, new_name)
        return f"Name updated to {new_name}! ✅\n\n" + _next_after_correction()

    return (
        "I noticed you wanted to make a correction — could you be more specific? "
        f"For example: 'Actually, the animal is a Cat' or 'The appointment should be at 3:00 PM'.\n\n"
        f"Currently booking: {_resume_prompt(stage, data)}"
    )


# ── Main chat endpoint ────────────────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        return _chat_handler(req)
    except Exception as e:
        print(f"[CHAT ERROR] Unhandled exception: {e}")
        sid = req.session_id or "unknown"
        return ChatResponse(
            reply=(
                "⚠️ VetConnect is temporarily unavailable due to a connection issue. "
                "Please check your internet connection and try again in a moment. "
                "If the problem persists, contact the clinic directly during business hours "
                "(Mon–Sat, 7:00 AM – 8:00 PM)."
            ),
            session_id=sid,
        )


def _chat_handler(req: ChatRequest):
    sid = req.session_id or str(uuid.uuid4())
    if sid not in sessions:
        sessions[sid] = {"stage": "idle", "data": {}, "last_message": 0.0, "correction_log": []}
    session = sessions[sid]

    # Rate limiting
    now = time.time()
    elapsed = now - session.get("last_message", 0.0)
    if elapsed < RATE_LIMIT_SECONDS:
        remaining = round(RATE_LIMIT_SECONDS - elapsed, 1)
        return ChatResponse(reply=f"⏳ Please wait {remaining}s before sending another message.", session_id=sid)
    session["last_message"] = now

    # Input sanitization
    raw = brain.sanitize_input(req.message)
    if not raw:
        return ChatResponse(reply="Please type a message.", session_id=sid)
    lower = raw.lower()

    # Safety layer — runs FIRST
    safety_tier, safety_msg = brain.check_safety(raw)
    if safety_tier == "acute":
        session["stage"] = "idle"
        session["data"]  = {}
        return ChatResponse(reply=safety_msg, session_id=sid)

    # Correction intent — runs SECOND
    if session["stage"] not in ("idle", "done") and session.get("data"):
        correction_reply = _handle_correction(session, raw)
        if correction_reply:
            return ChatResponse(reply=correction_reply, session_id=sid)

    # Mid-booking flow
    if session["stage"] not in ("idle", "done"):
        result = _handle_booking_flow(session, raw)
        if isinstance(result, tuple):
            reply, booking_data = result
            return ChatResponse(reply=reply, session_id=sid, booking_data=booking_data)
        return ChatResponse(reply=result, session_id=sid)

    # ── Idle intent routing ───────────────────────────────────────────────────
    booking_keywords = ["book", "appointment", "schedule", "magpa-check", "gusto",
                        "punta", "yes", "oo", "sige", "sure", "i want to", "gusto ko"]
    if any(kw in lower for kw in booking_keywords):
        session["stage"] = "ask_service"
        session["data"]  = {}
        session["correction_log"] = []
        return ChatResponse(
            reply="I'd be happy to help you book an appointment! 🐾\n\nWhat service do you need?\n\n• Consultation\n• Vaccination\n• Spay & Neuter\n• Deworming\n• Grooming",
            session_id=sid,
        )

    if any(kw in lower for kw in ["hour", "open", "close", "oras", "bukas", "schedule"]):
        return ChatResponse(reply="🕐 Clinic Hours:\nMonday – Saturday: 7:00 AM – 8:00 PM\nSunday: Closed\n\nAppointments outside these hours cannot be booked.", session_id=sid)

    if any(kw in lower for kw in ["service", "offer", "serbisyo", "magkano", "price", "cost"]):
        return ChatResponse(
            reply="🏥 We offer the following services:\n\n• Consultation — bring medical records\n• Vaccination — anti-rabies, 5-in-1, Parvo\n• Spay & Neuter — fasting required (8–12 hrs)\n• Deworming — every 2 weeks for puppies\n• Grooming — inform us if your pet is aggressive\n\nWould you like to book an appointment?",
            session_id=sid,
        )

    if any(kw in lower for kw in ["cancel", "reschedule", "move", "change appointment"]):
        return ChatResponse(reply="To cancel or reschedule, please go to the My Appointments tab in the sidebar and select the appointment you'd like to modify.", session_id=sid)

    # Symptom screening — now uses RAG
    symptom_intent_kw = [
        "check symptom", "symptoms", "my pet is", "my dog is", "my cat is",
        "not eating", "sick", "ayaw kumain", "matamlay", "may sakit", "nagsusuka",
        "vomit", "diarrhea", "limp", "lethargy", "wound", "rash", "coughing",
        "sneezing", "scratch", "laging tulog", "hindi kumakain",
    ]
    if any(kw in lower for kw in symptom_intent_kw):
        if lower.strip() in ("check symptom", "check symptoms", "symptoms", "symptom"):
            return ChatResponse(
                reply="Sure! Please describe your pet's symptoms and I'll help assess them.\n\nFor example: 'My dog has been vomiting for 2 days' or 'My cat is not eating and seems lethargic.'",
                session_id=sid
            )
        mentioned_animal = next((a for a in brain.supported_animals if a.lower() in lower), None)

        # Use safety dataset to check if dangerous
        match, score = brain.find_best_match(raw, "symptoms")
        # is_urgent based on GPT safety tier only (not csv_dangerous)
        # Reason: 96% of clean-data.csv rows are flagged dangerous — unreliable for urgency
        is_urgent = (safety_tier == "urgent")

        # RAG-based response
        reply = _get_rag_reply(raw, known_animal=mentioned_animal, is_urgent=is_urgent)
        reply += "\n\nWould you like to book a consultation? Just say 'yes' or 'book an appointment' and I'll get you started. 🐾"
        return ChatResponse(reply=reply, session_id=sid)

    # Wildlife check
    for animal in brain.wildlife_animals:
        if animal.lower() in lower:
            return ChatResponse(reply=f"🦁 We're a domestic and farm animal clinic — we don't handle {animal}s. Please contact a wildlife rescue centre or zoo veterinarian.", session_id=sid)

    # Generic fallback
    return ChatResponse(reply=brain.ask_llm(raw), session_id=sid)


# ── Booking Flow Handler ──────────────────────────────────────────────────────
def _handle_booking_flow(session: dict, raw: str):
    stage = session["stage"]
    data  = session["data"]
    lower = raw.lower()

    # Escape hatch
    exit_phrases = ["cancel", "stop", "exit", "quit", "nevermind", "never mind", "start over", "ulit", "basta"]
    if any(re.search(r'\b' + re.escape(p) + r'\b', lower) for p in exit_phrases) and stage != "confirm":
        session["stage"] = "idle"
        session["data"]  = {}
        return "No problem! Booking cancelled. How else can I help you? 🐾"

    # FAQ shortcuts
    if any(kw in lower for kw in ["clinic hour", "anong oras", "open", "bukas", "close", "sarado"]):
        return f"🕐 We're open Mon–Sat: 7:00 AM – 8:00 PM. Sunday: Closed.\n\nNow back to your booking — {_resume_prompt(stage, data)}"

    if any(kw in lower for kw in ["how much", "magkano", "price", "cost", "presyo"]):
        return f"💰 Pricing varies per procedure. Please call the clinic for exact rates.\n\nNow back to your booking — {_resume_prompt(stage, data)}"

    # Mid-booking symptom aside — now uses RAG
    mid_symptom_kw = [
        "scratching", "vomit", "diarrhea", "not eating", "ayaw kumain", "sick",
        "matamlay", "may sakit", "nagsusuka", "lethargic", "lethargy", "coughing",
        "sneezing", "wound", "rash", "hindi kumakain", "laging tulog", "itchy",
        "swollen", "limping", "hiccup", "shaking", "trembling", "nagtatae",
        "btw", "by the way", "sa totoo lang", "actually my", "also my",
        "my dog has", "my cat has", "my pet has",
    ]
    is_symptom_aside = any(kw in lower for kw in mid_symptom_kw)
    is_direct_booking_answer = (
        any(kw in lower for kw in ["confirm", "cancel"])
        or bool(re.search(r"\d{1,2}/\d{1,2}/\d{4}", raw))
        or stage in ("ask_breed", "ask_pet_name", "ask_consultation_reason")
        or (stage == "ask_service" and any(kw in lower for kw in ["consult", "vacc", "spay", "deworm", "groom", "bakuna", "kapon", "purga", "ligo"]))
    )
    if is_symptom_aside and not is_direct_booking_answer:
        known_animal = data.get("animal")
        safety_tier_aside, _ = brain.check_safety(raw)
        is_urgent = (safety_tier_aside == "urgent")
        advice = _get_rag_reply(raw, known_animal=known_animal, is_urgent=is_urgent)
        return f"I noticed a health concern — let me address that first! 🩺\n\n{advice}\n\n━━━━━━━━━━━━━━━━━━━━\nNow, back to your booking — {_resume_prompt(stage, data)}"

    # ask_service
    if stage == "ask_service":
        matched_service = next((svc for kw, svc in SERVICE_MAP.items() if kw in lower), None)
        if not matched_service:
            matched_service = brain.ask_llm_direct(
                f"Extract the vet service from this text: '{raw}'. "
                "Choose ONE from: Consultation, Vaccination, Spay & Neuter, Deworming, Grooming. Return ONLY the service name."
            ).strip()
        valid_services = ["Consultation", "Vaccination", "Spay & Neuter", "Deworming", "Grooming"]
        if matched_service not in valid_services:
            return "I didn't catch that. Please choose one of:\nConsultation, Vaccination, Spay & Neuter, Deworming, or Grooming."
        data["service"] = matched_service
        session["stage"] = "ask_animal"
        return f"Got it — {matched_service}! 🐾\n\nWhat type of animal is your pet?\n(e.g. Dog, Cat, Rabbit, Bird, Horse…)"

    # ask_animal
    if stage == "ask_animal":
        raw_lower = raw.lower().strip()
        direct_animal = next((a for a in brain.supported_animals + brain.wildlife_animals if a.lower() in raw_lower), None)
        tagalog_animal = next((eng for tl, eng in brain.tagalog_animal_map.items() if tl in raw_lower), None)
        animal = direct_animal or tagalog_animal or _clean_extracted(brain.extract_entity_with_ai(raw, "animal species"))
        supported = [a.lower() for a in brain.supported_animals]
        wildlife  = [w.lower() for w in brain.wildlife_animals]
        if animal.lower() in wildlife:
            session["stage"] = "idle"
            return f"🦁 Sorry, we don't handle {animal}s. We only treat domestic and farm animals. Please contact a wildlife rescue centre."
        if animal.lower() not in supported or animal.lower() == "none":
            if not animal or animal.lower() == "none":
                return "I didn't catch the animal type. Could you tell me what kind of pet it is? (e.g. Dog, Cat, Bird)"
            return (f"We don't currently serve {animal}s. We accept: Dogs, Cats, Rabbits, Hamsters, Turtles, Birds, "
                    "Cows, Hens, Pigs, Goats, Sheep, Horses, Ducks, Buffalos, Cattle, Donkeys, and Mules.\n\nWhat type of animal is your pet?")
        data["animal"] = animal
        session["stage"] = "ask_breed"
        return f"A {animal} — got it! 🐕\n\nWhat breed is your {animal.lower()}? (Type 'unknown' if not sure)"

    # ask_breed
    if stage == "ask_breed":
        animal = data.get("animal", "Dog")
        universal_breeds = {"unknown", "mixed", "crossbreed", "mongrel", "native", "local", "not sure", "di alam", "mix"}
        if raw.lower().strip() in universal_breeds:
            data["breed"] = "Unknown"
            session["stage"] = "ask_pet_name"
            return "No problem! What's your pet's name?"
        raw_lower_breed = raw.lower().strip()
        whitelist = brain.BREED_WHITELIST.get(animal, [])
        direct_match = next((w for w in whitelist if w in raw_lower_breed or raw_lower_breed in w), None)
        if direct_match:
            breed = direct_match.title()
            data["breed"] = breed
            session["stage"] = "ask_pet_name"
            return f"{breed} — lovely! 🐾\n\nWhat's your pet's name?"
        breed = _clean_extracted(brain.extract_entity_with_ai(raw, "breed", exclude=data.get("pet_name")))
        if not breed or breed.lower() in ("none", "null", ""):
            return f"I didn't catch a breed name. What breed is your {animal.lower()}? (Type 'unknown' or 'mixed' if you're not sure)"
        if not brain.validate_breed_for_species(breed, animal):
            return f"'{breed}' doesn't seem to be a {animal} breed. Could you double-check? (Or type 'unknown' / 'mixed')"
        data["breed"] = breed
        session["stage"] = "ask_pet_name"
        return f"{breed} — lovely! 🐾\n\nWhat's your pet's name?"

    # ask_pet_name
    if stage == "ask_pet_name":
        name_match = re.search(
            r"(?:name is|named|call (?:him|her|it|them)?|'s name is|siya si|pangalan)\s+([A-Za-z]+)",
            raw, re.IGNORECASE,
        )
        if name_match:
            name = name_match.group(1).strip().title()
        else:
            clean_raw = raw.strip()
            words = clean_raw.split()
            if 1 <= len(words) <= 3 and all(re.match(r"^[A-Za-z\-']+$", w) for w in words):
                name = clean_raw.title()
            else:
                name = _clean_extracted(brain.extract_entity_with_ai(raw, "pet name"))
        if not name or name.lower() in ("none", ""):
            return "What should I call your pet? Please enter their name."
        data["pet_name"] = name
        if data.get("service") == "Consultation":
            session["stage"] = "ask_consultation_reason"
            return (
                f"Nice to meet {name}! 🐾\n\n"
                f"Since you're booking a Consultation, could you describe what {name} is experiencing?\n"
                "For example: 'not eating for 2 days', 'keeps vomiting', 'has a skin rash', etc.\n\n"
                "This helps our vet prepare for the visit."
            )
        else:
            session["stage"] = "ask_datetime"
            return (f"Nice to meet {name}! 🐾\n\nWhen would you like to schedule the appointment?\n"
                    "Format: MM/DD/YYYY HH:MM AM/PM (e.g. 03/20/2026 10:00 AM)\n\nOur clinic is open Mon–Sat, 7:00 AM – 8:00 PM.")

    # ask_consultation_reason — now uses RAG
    if stage == "ask_consultation_reason":
        pet_name     = data.get("pet_name", "your pet")
        known_animal = data.get("animal")

        if not raw or len(raw.strip()) < 3:
            return (f"Could you describe what {pet_name} is experiencing? "
                    "For example: 'vomiting', 'not eating', 'lethargic', 'skin rash', etc.")

        # Safety check
        safety_tier, safety_msg = brain.check_safety(raw)
        if safety_tier == "acute":
            session["stage"] = "idle"
            session["data"]  = {}
            return safety_msg

        # Safety check - acute only from GPT assessment
        match, score = brain.find_best_match(raw, "symptoms")
        csv_dangerous = brain.is_match_dangerous(match)

        if csv_dangerous and safety_tier == "acute":
            session["stage"] = "idle"
            session["data"]  = {}
            return (
                "🚨 EMERGENCY ALERT: The symptoms you described match a condition flagged as dangerous. "
                "Do not wait — bring your pet to the clinic IMMEDIATELY or contact an emergency veterinarian. "
                "Only a licensed veterinarian can confirm the exact cause."
            )

        # Summarize and generate RAG-based advice
        complaint_label = brain.summarize_complaint(raw)
        data["consultation_reason"] = complaint_label
        data["consultation_reason_raw"] = raw

        # is_urgent based on GPT safety tier only
        is_urgent = (safety_tier == "urgent")
        advice = _get_rag_reply(raw, known_animal=known_animal, is_urgent=is_urgent)

        session["stage"] = "ask_datetime"
        return (
            f"Thank you for letting us know! 🩺\n\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            f"{advice}\n\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "Our vet will assess this further during the consultation.\n\n"
            "📅 When would you like to schedule the appointment?\n"
            "Format: MM/DD/YYYY HH:MM AM/PM (e.g. 03/20/2026 10:00 AM)\n"
            "Our clinic is open Mon–Sat, 7:00 AM – 8:00 PM."
        )

    # ask_datetime
    if stage == "ask_datetime":
        valid, error = brain.validate_datetime(raw)
        if not valid:
            return f"⚠️ {error}\n\nPlease re-enter the date and time (e.g. 03/20/2026 10:00 AM)."
        data["datetime"] = raw
        session["stage"] = "confirm"
        reason_line = (
            f"• Reason:    {data.get('consultation_reason')}\n"
            if data.get("service") == "Consultation" and data.get("consultation_reason") else ""
        )
        return (
            "Almost done! Please confirm your appointment:\n\n"
            f"• Service:   {data.get('service')}\n"
            f"• Animal:    {data.get('animal')} ({data.get('breed')})\n"
            f"• Pet Name:  {data.get('pet_name')}\n"
            + reason_line
            + f"• Date/Time: {data.get('datetime')}\n\n"
            "Type 'confirm' to book, or 'cancel' to start over.\n"
            "You can also correct any detail (e.g. 'Actually, the time should be 3:00 PM')."
        )

    # confirm
    if stage == "confirm":
        if "confirm" in lower:
            booking_data = {
                "petName":                  data.get("pet_name", ""),
                "species":                  f"{data.get('animal', '')} ({data.get('breed', '')})",
                "service":                  data.get("service", ""),
                "consultationReason":       data.get("consultation_reason", ""),
                "consultationReasonDetail": data.get("consultation_reason_raw", ""),
                "datetime":                 data.get("datetime", ""),
                "status":                   "upcoming",
                "appointmentStatus":        "pending",
                "assignedVet":              "Pending assignment",
            }
            session["stage"] = "done"
            session["data"]  = {}
            session["correction_log"] = []
            return (
                "✅ Appointment booked successfully!\n\n"
                "Your request has been submitted and is pending confirmation. "
                "You'll receive a notification once a vet is assigned.\n\n"
                "You can view your appointment in the My Appointments tab."
            ), booking_data
        elif "cancel" in lower:
            session["stage"] = "idle"
            session["data"]  = {}
            return "Booking cancelled. Feel free to start a new conversation anytime! 🐾"
        else:
            correction = _handle_correction(session, raw)
            if correction:
                return correction
            return ("Please type 'confirm' to book your appointment, or 'cancel' to start over.\n"
                    "You can also correct any detail — e.g. 'Actually, it's vaccine instead of grooming'.")

    session["stage"] = "idle"
    return "Something went wrong. Let's start over — how can I help you today?"