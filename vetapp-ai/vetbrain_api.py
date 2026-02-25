"""
VetConnect AI Backend — vetbrain_api.py
=======================================
FastAPI microservice wrapping VetBrain.

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
app = FastAPI(title="VetConnect AI Backend", version="4.0.0")

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
    print("✅ VetBrain loaded and ready.")

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


def _build_symptom_prompt(raw: str, match, score: float, known_animal: str = None, is_urgent: bool = False) -> str:
    """
    CRITICAL: Always prioritize user's direct observations over dataset.
    """
    subject = known_animal if known_animal else "the pet"
    
    # Add user observation emphasis
    user_observation_prefix = f"The owner reports: {raw}. "
    
    if match is not None and score >= 0.3:
        disease  = match.get("Disease", "a condition")
        symptoms = match.get("Symptoms_Text", "")
        advice   = match.get("Advice / Notes", "Monitor closely.")
        
        if is_urgent:
            return (
                user_observation_prefix +
                f"Based on our guidelines, this may relate to: {disease}. "
                f"However, YOU MUST prioritize the owner's direct observations in your response. "
                f"If the owner says the pet IS drinking, do not suggest dehydration. "
                f"If the owner says the pet is energetic, do not suggest lethargy. "
                f"Based on our medical guidelines, the closest matching condition is: {disease}. "
                f"Associated symptoms on record: {symptoms}. "
                f"Guideline recommendation: {advice} "
                f"Write a 3-4 sentence response that:\n"
                f"1. Opens with empathy (e.g. 'I'm sorry to hear...' or 'That must be worrying...')\n"
                f"2. Explains in plain language why this is a serious concern worth acting on soon\n"
                f"3. Recommends booking a vet visit within 24 hours through this chat\n"
                f"4. Ends with: 'If {subject} starts struggling to breathe, shows pale or blue gums, "
                f"or collapses, please go to an emergency clinic immediately.'\n"
                f"Tone: warm, professional, and calm — NOT alarming. Use 'our medical guidelines' "
                f"instead of 'dataset'. Only refer to the {subject}. Never name drugs or dosages."
            )

        return (
            f"The user has a {subject}. They report: {raw}. "
            f"Based on our medical guidelines, the closest matching condition is: {disease}. "
            f"The guidelines list these associated symptoms: {symptoms}. "
            f"Recommended advice: {advice} "
            f"Write a 2-3 sentence professional response addressed to a {subject} owner "
            f"that communicates ONLY the above findings — do not add any other "
            f"conditions, drugs, dosages, or diagnostic tests. "
            f"Only refer to the {subject}, never another species."
        )

    # No CSV match — safe fallback
    if is_urgent:
        return (
            f"The user has a {subject}. They report: {raw}. "
            f"The symptoms have been persisting for some time and no confident match was found in our medical guidelines. "
            f"Write a 2-3 sentence empathetic response that acknowledges the concern, "
            f"recommends booking a vet consultation within 24 hours through this chat, "
            f"and ends with: 'If {subject} starts struggling to breathe, shows pale or blue gums, "
            f"or collapses, please go to an emergency clinic immediately.' "
            f"Tone: warm and calm. Only refer to the {subject}."
        )

    return (
        f"The user has a {subject}. They say: '{raw}'. "
        f"No confident match was found in our medical guidelines for these symptoms. "
        f"Write a 2-3 sentence professional response that acknowledges the symptoms, "
        f"recommends proceeding with the booked consultation, and does NOT suggest any "
        f"specific condition, drug, or treatment. Only refer to the {subject}. "
        "End with 'Only a licensed veterinarian can confirm the exact cause.'"
    )


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
    # Only intercept if user explicitly signalled a correction OR datetime is already set.
    # First-time date entry (stage == ask_datetime, no existing datetime) goes to booking flow.
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

    # ── Helper: after updating a field, go to the right next stage ───────────
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
        # Everything already collected — go straight to confirm
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
        # Only clear consultation_reason if switching away from Consultation
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
            return (f"🦁 Sorry, we don't handle {new_animal}s. We only treat domestic and farm animals. Please contact a wildlife rescue centre.")
        old_val = data.get("animal", "not set")
        data["animal"] = new_animal
        # Only clear breed since it may not be valid for the new animal species.
        # Pet name, consultation reason, and datetime are all still valid — keep them.
        data.pop("breed", None)
        _log_correction(session, "animal", old_val, new_animal)
        # If breed is missing, ask for it. Otherwise go straight to confirm.
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
            # datetime is preserved — no need to re-ask
            _log_correction(session, "breed", old_val, candidate)
            existing_name = data.get("pet_name")
            if existing_name:
                return f"Breed updated to {candidate}! ✅\n\n" + _next_after_correction()
            session["stage"] = "ask_pet_name"
            return f"Breed updated to {candidate}! ✅\n\nWhat\'s your pet\'s name?"

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
                match, score = brain.find_best_match(new_reason, "symptoms")
                csv_dangerous = brain.is_match_dangerous(match)
                if csv_dangerous and safety_tier_c != "urgent":
                    session["stage"] = "idle"
                    session["data"]  = {}
                    return ("🚨 EMERGENCY ALERT: The symptoms you described match a condition flagged as dangerous. "
                            "Please bring your pet to the clinic IMMEDIATELY. Your booking has been paused.")
                is_urgent = (safety_tier_c == "urgent") or csv_dangerous
                known_animal = data.get("animal")
                advice = brain.ask_llm(_build_symptom_prompt(new_reason, match, score, known_animal, is_urgent=is_urgent))
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

    # Symptom screening
    symptom_intent_kw = [
        "check symptom", "symptoms", "my pet is", "my dog is", "my cat is",
        "not eating", "sick", "ayaw kumain", "matamlay", "may sakit", "nagsusuka",
        "vomit", "diarrhea", "limp", "lethargy", "wound", "rash", "coughing",
        "sneezing", "scratch", "laging tulog", "hindi kumakain",
    ]
    if any(kw in lower for kw in symptom_intent_kw):
        if lower.strip() in ("check symptom", "check symptoms", "symptoms", "symptom"):
            return ChatResponse(reply="Sure! Please describe your pet's symptoms and I'll help assess them.\n\nFor example: 'My dog has been vomiting for 2 days' or 'My cat is not eating and seems lethargic.'", session_id=sid)
        mentioned_animal = next((a for a in brain.supported_animals if a.lower() in lower), None)
        match, score = brain.find_best_match(raw, "symptoms")
        csv_dangerous = brain.is_match_dangerous(match)
        # safety_tier already computed above for this message
        # "urgent" means chronic context detected — never show siren, use warm LLM response
        # csv_dangerous alone (no chronic context) → acute-style alert
        if csv_dangerous and safety_tier != "urgent":
            return ChatResponse(
                reply="🚨 EMERGENCY ALERT: The symptoms described match a condition flagged as dangerous in our medical guidelines. Do not wait — bring your pet to the clinic IMMEDIATELY or contact an emergency veterinarian. Only a licensed veterinarian can confirm the exact cause.",
                session_id=sid,
            )
        is_urgent = csv_dangerous or (safety_tier == "urgent")
        reply = brain.ask_llm(_build_symptom_prompt(raw, match, score, known_animal=mentioned_animal, is_urgent=is_urgent))
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

    # Mid-booking symptom interrupt (skipped during ask_consultation_reason)
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
        match, score = brain.find_best_match(raw, "symptoms")
        csv_dangerous = brain.is_match_dangerous(match)
        is_urgent = (safety_tier_aside == "urgent") or csv_dangerous
        if csv_dangerous and safety_tier_aside != "urgent":
            # Acute-level danger during booking — pause and alert
            session["stage"] = "idle"
            session["data"]  = {}
            return "🚨 EMERGENCY ALERT: The symptoms you described match a condition flagged as dangerous. Please bring your pet to the clinic IMMEDIATELY. Your booking has been paused — please seek emergency care first."
        advice = brain.ask_llm(_build_symptom_prompt(raw, match, score, known_animal=known_animal, is_urgent=is_urgent))
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
        # Check direct English match first
        direct_animal = next((a for a in brain.supported_animals + brain.wildlife_animals if a.lower() in raw_lower), None)
        # Check Tagalog map second (fast, no LLM call needed)
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
        # Consultation gets extra reason stage
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

    # ask_consultation_reason (Consultation only)
    if stage == "ask_consultation_reason":
        pet_name     = data.get("pet_name", "your pet")
        known_animal = data.get("animal")
        if not raw or len(raw.strip()) < 3:
            return (f"Could you describe what {pet_name} is experiencing? "
                    "For example: 'vomiting', 'not eating', 'lethargic', 'skin rash', etc.")

        # Step 1: Tiered safety check (uses raw input before summarizing)
        safety_tier, safety_msg = brain.check_safety(raw)
        if safety_tier == "acute":
            session["stage"] = "idle"
            session["data"]  = {}
            return safety_msg

        # Step 2: CSV symptom match (also uses raw input for best similarity)
        match, score = brain.find_best_match(raw, "symptoms")
        csv_dangerous = brain.is_match_dangerous(match)

        # Step 3: Determine urgency tier
        if csv_dangerous and safety_tier != "urgent":
            session["stage"] = "idle"
            session["data"]  = {}
            return ("🚨 EMERGENCY ALERT: The symptoms you described match a condition flagged as dangerous in our medical guidelines. "
                    "Do not wait — bring your pet to the clinic IMMEDIATELY or contact an emergency veterinarian right away. "
                    "Only a licensed veterinarian can confirm the exact cause.")

        # Step 4: Summarize into a clean medical complaint label for booking records
        complaint_label = brain.summarize_complaint(raw)
        data["consultation_reason"] = complaint_label   # store the short label
        data["consultation_reason_raw"] = raw           # keep raw for LLM context

        # Step 5: LLM narrates using the raw description for full context
        is_urgent = (safety_tier == "urgent") or csv_dangerous
        advice = brain.ask_llm(_build_symptom_prompt(raw, match, score, known_animal=known_animal, is_urgent=is_urgent))

        # Step 6: Advance to datetime
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
                "consultationReason":       data.get("consultation_reason", ""),      # short label
                "consultationReasonDetail": data.get("consultation_reason_raw", ""),  # full description
                "datetime":                 data.get("datetime", ""),
                "status":                   "upcoming",
                "appointmentStatus":        "pending",
                "assignedVet":              "Pending assignment",
            }
            tx_hash = brain.generate_transaction_hash(booking_data)
            booking_data["transactionHash"] = tx_hash
            session["stage"] = "done"
            session["data"]  = {}
            session["correction_log"] = []
            return (
                "✅ Appointment booked successfully!\n\n"
                "Your request has been submitted and is pending confirmation. "
                "You'll receive a notification once a vet is assigned.\n\n"
                f"🔗 Blockchain Receipt (Transaction Hash):\n{tx_hash}\n\n"
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
                    "You can also correct any detail — e.g. 'Actually, the vaccine instead of grooming'.")

    session["stage"] = "idle"
    return "Something went wrong. Let's start over — how can I help you today?"