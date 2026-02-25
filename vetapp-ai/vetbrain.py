import pandas as pd
import requests
import json
import re
import hashlib
import time
from sentence_transformers import SentenceTransformer, util
from datetime import datetime

# ==========================================
# CONFIGURATION
# ==========================================
API_KEY = "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"
CLINIC_OPEN  = 7   # 7:00 AM
CLINIC_CLOSE = 20  # 8:00 PM

# Minimum seconds between LLM calls (Risk 1 — Rate Limiting).
RATE_LIMIT_SECONDS = 3

# Similarity threshold below which a query is considered out-of-scope (Risk 4).
SIMILARITY_THRESHOLD = 0.3

# ==========================================
# VETBRAIN — AI Logic Class
# ==========================================

class VetBrain:
    def __init__(self):
        self.status = "Loading..."
        self.df_services        = pd.DataFrame()
        self.df_symptoms        = pd.DataFrame()
        self.symptom_embeddings = None
        self.embedding_model    = None

        # ── Supported & out-of-scope animals ────────────────────────────────
        self.supported_animals = [
            "Dog", "Cat", "Rabbit", "Hamster", "Turtle", "Bird",
            "Cow", "Hen", "Pig", "Goat", "Sheep", "Horse", "Duck",
            "Buffalo", "Cattle", "Donkey", "Mule",
        ]
        self.wildlife_animals = [
            "Lion", "Tiger", "Wolf", "Fox", "Monkey", "Snake", "Elephant",
            "Deer", "Elk", "Reindeer", "Hyaena", "Bear", "Crocodile",
            "Leopard", "Cheetah",
        ]

        # ── Tagalog → English animal name mapping ────────────────────────────
        # Used by extract_entity_with_ai and ask_animal stage to resolve
        # Filipino animal names into the canonical English names used throughout
        # the system (supported_animals list, BREED_WHITELIST keys, CSV, etc.)
        self.tagalog_animal_map = {
            # Pets
            "aso":       "Dog",
            "aspin":     "Dog",
            "askal":     "Dog",
            "pusa":      "Cat",
            "puspin":    "Cat",
            "kuneho":    "Rabbit",
            "hamster":   "Hamster",  # same in Tagalog
            "pagong":    "Turtle",
            "ibon":      "Bird",
            # Farm animals
            "baka":      "Cow",
            "manok":     "Hen",
            "baboy":     "Pig",
            "kambing":   "Goat",
            "tupa":      "Sheep",
            "kabayo":    "Horse",
            "pato":      "Duck",
            "kalabaw":   "Buffalo",
            "baka":      "Cattle",
            "buriko":    "Donkey",
            "mula":      "Mule",
        }

        # ── DANGER KEYWORDS are defined as class-level attributes below ────────
        # See _acute_words and _chronic_danger_words on the class definition.
        # check_safety() uses them to determine tier: "acute" | "urgent" | None

        self.system_instruction = f"""You are "VetBot", the AI assistant for VetConnect Veterinary Clinic.

ABSOLUTE RULES — never violate any of these:
1. SCOPE: Only provide advice for these supported animals (English and Tagalog names):
   Dog/Aso/Aspin, Cat/Pusa/Puspin, Rabbit/Kuneho, Hamster, Turtle/Pagong, Bird/Ibon,
   Cow/Baka, Hen/Manok, Pig/Baboy, Goat/Kambing, Sheep/Tupa, Horse/Kabayo,
   Duck/Pato, Buffalo/Kalabaw, Cattle/Baka, Donkey/Buriko, Mule/Mula.
   If asked about any other animal, say: "We only treat domestic and farm animals at VetConnect."
2. ANIMAL ACCURACY: The user's message will always specify or imply a specific animal.
   You MUST base your entire response on THAT animal only.
   NEVER mention, reference, or give advice for a different animal species.
3. SAFETY LAYER: You are FORBIDDEN from providing any medical assessment when symptoms
   include blood/bleeding, seizures, unconsciousness, poisoning, or breathing difficulty.
   For those, output ONLY: "🚨 EMERGENCY ALERT: Critical symptoms detected. Book an emergency appointment immediately through VetConnect."
4. NO DEFINITIVE DIAGNOSIS: NEVER state a diagnosis as fact. ALWAYS use phrases like
   "Possible causes include", "This could be related to", or "Commonly associated with".
5. DISCLAIMER: Every medical response MUST end with:
   "Only a licensed veterinarian can confirm the exact cause."
6. BREVITY: Keep every response to 2–3 sentences maximum.
   No bullet points, no headers, no bold text.
7. TONE: Professional, calm, and empathetic.
8. BOOKING — CRITICAL: NEVER tell the user to "call the clinic". Always encourage
   booking through this chat system.
9. OUT-OF-SCOPE: If the question is not about pet health, veterinary services,
   or appointment booking, reply: "I can only assist with veterinary questions."
10. HALLUCINATION PREVENTION — CRITICAL: You will be given a specific condition name and
    advice extracted directly from a verified veterinary dataset (clean-data.csv).
    You MUST only discuss the condition and advice that is explicitly provided to you
    in the prompt. NEVER fabricate, add, or infer any drug names, dosages,
    diagnostic tests, or conditions beyond what is explicitly given to you.
    Your role is to communicate the dataset findings in a clear, empathetic tone — not
    to generate new medical information.
"""

    # ──────────────────────────────────────────────────────────────────────────
    # STARTUP
    # ──────────────────────────────────────────────────────────────────────────
    def load_data(self):
        print("⏳ Initializing VetConnect AI... (Loading Knowledge Base)")

        # --- A. SERVICES ---
        services_data = [
            {"Name": "Spay & Neuter",  "User_Phrases": "kapon, castrate, fix, ligation", "Advice / Notes": "Fasting required (8-12 hours)."},
            {"Name": "Consultation",   "User_Phrases": "checkup, vet visit, sick, matamlay, ayaw kumain", "Advice / Notes": "Bring medical records."},
            {"Name": "Vaccination",    "User_Phrases": "anti-rabies, 5in1, 4in1, shots, bakuna, parvo",  "Advice / Notes": "Puppies start at 6-8 weeks."},
            {"Name": "Deworming",      "User_Phrases": "purga, worms, bulate, deworm",                   "Advice / Notes": "Required every 2 weeks for puppies."},
            {"Name": "Grooming",       "User_Phrases": "ligua, gupit, bath, haircut, smell bad",          "Advice / Notes": "Inform us if aggressive."},
        ]
        self.df_services = pd.DataFrame(services_data)
        self.df_services["combined_text"] = (
            self.df_services["Name"] + " " + self.df_services["User_Phrases"]
        )

        # --- B. SYMPTOMS (from clean-data.csv) ---
        try:
            self.df_symptoms = pd.read_csv("clean-data.csv")
            cols = ['Symptom 1', 'Symptom 2', 'Symptom 3', 'Symptom 4', 'Symptom 5']
            self.df_symptoms['Symptoms_Text'] = self.df_symptoms[cols].apply(
                lambda x: ', '.join(x.dropna().astype(str)), axis=1
            )
            self.df_symptoms['is_dangerous'] = (
                self.df_symptoms['Dangerous'].str.lower().str.strip() == 'yes'
            )
            self.df_symptoms['Advice / Notes'] = self.df_symptoms['is_dangerous'].apply(
                lambda d: "⚠️ URGENT: Visit vet immediately." if d else "Monitor closely."
            )
            self.df_symptoms['Name'] = "Symptom Analysis"
            self.df_symptoms["combined_text"] = (
                self.df_symptoms['Animal'].astype(str) + " "
                + self.df_symptoms['Symptoms_Text'].astype(str)
            )
            print(f"✅ CSV loaded: {len(self.df_symptoms)} symptom rows.")
        except Exception as e:
            print(f"Warning: CSV error ({e}). Using AI fallback.")
            self.df_symptoms = pd.DataFrame()

        # --- C. EMBEDDING MODEL ---
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        if not self.df_symptoms.empty:
            self.symptom_embeddings = self.embedding_model.encode(
                self.df_symptoms["combined_text"].tolist(), convert_to_tensor=True
            )
            print(f"✅ Embeddings built for {len(self.df_symptoms)} rows.")

        self.status = "Ready"
        print("✅ System Ready!")

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 6 — Input Sanitization
    # ──────────────────────────────────────────────────────────────────────────
    def sanitize_input(self, text: str) -> str:
        text = re.sub(r'<[^>]*>', '', text)
        sql_keywords = (
            r'\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|'
            r'UNION|--|;|\/\*|\*\/|xp_|CAST\(|CONVERT\()\b'
        )
        text = re.sub(sql_keywords, '[BLOCKED]', text, flags=re.IGNORECASE)
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        text = (text
                .replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;')
                .replace('"', '&quot;')
                .replace("'", '&#x27;'))
        return text.strip()

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 2 — Safety Layer (Tiered: Acute Emergency vs. Urgent Concern)
    #
    # Returns a tuple: (tier, message | None)
    #   tier "acute"  → currently happening, life-threatening RIGHT NOW
    #                   (bleeding, seizure, not breathing, poisoning, collapse)
    #                   → hardcoded red-alert, no LLM involved
    #   tier "urgent" → serious but NOT immediately life-threatening
    #                   (chronic cough, prolonged symptoms, etc. flagged by CSV)
    #                   → LLM writes a calm, empathetic urgent response
    #   tier None     → no safety concern detected
    # ──────────────────────────────────────────────────────────────────────────

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 2 — Safety Layer (LLM-Assessed Severity Triage)
    #
    # Design philosophy:
    #   Hardcoded keyword lists will always have gaps — users phrase things
    #   in unpredictable ways, mix English/Tagalog, add context that changes
    #   meaning ("not eating BUT still energetic"). Instead of maintaining
    #   ever-growing phrase lists, we ask the LLM to assess severity, then
    #   use that assessment to route the response.
    #
    # Two-layer approach:
    #   Layer 1 — Tiny hardcoded "undeniable acute" list:
    #     Only true physiological crises that are unambiguous regardless of
    #     context (active bleeding, seizure, not breathing, confirmed poisoning).
    #     These bypass the LLM entirely for speed and reliability.
    #
    #   Layer 2 — LLM severity assessment:
    #     For everything else, the LLM classifies the message as:
    #       "acute"  → life-threatening RIGHT NOW, needs ER immediately
    #       "urgent" → serious, needs vet within 24-48 hours, not ER-level
    #       "normal" → routine concern, standard advice appropriate
    #
    # Returns: (tier, message | None)
    #   "acute"  → hardcoded red-alert, booking cleared
    #   "urgent" → LLM writes calm empathetic response, booking continues
    #   None     → no concern, normal flow
    # ──────────────────────────────────────────────────────────────────────────

    # Layer 1: Only undeniable, context-independent acute signals.
    # These are physical states that are always emergencies no matter what
    # else the owner says. Keep this list SHORT and unambiguous.
    _undeniable_acute = [
        "seizure", "convulsion",
        "not breathing", "can't breathe", "hindi humihinga", "hindi makahinga",
        "gasping", "choking",
        "unconscious", "unresponsive",
        "collapsed", "collapse",
        "pale gums", "blue gums",
        "poison", "poisoned", "lason", "nalason",
        "chocolate", "xylitol",
        "hemorrhage",
    ]

    def assess_severity(self, text: str) -> str:
        """
        Uses the LLM to classify the severity of a pet health complaint.
        Returns: "acute", "urgent", or "normal"

        The LLM considers the FULL context — including pet behavior signals
        like "still energetic", duration cues like "for 2 weeks", treatment
        failure like "despite medication", language (English/Tagalog/mixed),
        and any combination of symptoms described.
        """
        prompt = (
            "You are a veterinary triage assistant. A pet owner sent this message:\n"
            f'"{text}"\n\n'
            "Classify the severity as ONE of these three options:\n\n"
            "ACUTE   — The pet needs emergency care RIGHT NOW. "
            "Signs: active bleeding, seizure, cannot breathe, collapse, confirmed poisoning, "
            "loss of consciousness, or any condition where minutes matter.\n\n"
            "URGENT  — The pet needs a vet within 24–48 hours but is NOT in immediate danger. "
            "Signs: symptoms persisting for days/weeks, not responding to medication, "
            "concerning but pet is still alert/drinking/moving, chronic worsening conditions.\n\n"
            "NORMAL  — Routine concern. Pet is showing mild symptoms with no red flags. "
            "Standard veterinary advice is appropriate.\n\n"
            "IMPORTANT RULES:\n"
            "- If the owner says the pet is still energetic, active, drinking, or alert, "
            "it is NEVER 'acute' — classify as 'urgent' or 'normal'.\n"
            "- A single mild symptom like slight loss of appetite with no other red flags is 'normal'.\n"
            "- Symptoms lasting more than a few days or not improving with medication are 'urgent'.\n"
            "- Only use 'acute' if there is clear evidence of an immediate life threat.\n"
            "- Consider Tagalog words: maliksi/aktibo/masaya = energetic/active, "
            "matamlay = lethargic, hindi kumakain = not eating, nagsusuka = vomiting.\n\n"
            "Reply with ONLY one word: acute, urgent, or normal."
        )
        try:
            result = self.ask_llm_direct(prompt).strip().lower()
            # Extract just the classification word in case LLM adds extra text
            for tier in ("acute", "urgent", "normal"):
                if tier in result:
                    return tier
            return "normal"  # safe fallback
        except Exception:
            return "normal"  # if LLM fails, don't block the user

    def check_safety(self, text: str):
        """
        Returns (tier, message) where tier is "acute", "urgent", or None.

        Layer 1: Check undeniable acute signals (fast, no LLM needed).
        Layer 2: Ask LLM to assess severity of everything else.
        """
        text_lower = text.lower()

        # Layer 1 — undeniable acute: always fires regardless of context
        if any(w in text_lower for w in self._undeniable_acute):
            return (
                "acute",
                "🚨 EMERGENCY ALERT: Critical symptoms detected. "
                "Do not wait — bring your pet to the clinic IMMEDIATELY "
                "or contact an emergency veterinarian right away. "
                "Time is critical for conditions involving bleeding, seizures, "
                "poisoning, or loss of consciousness."
            )

        # Layer 2 — LLM assesses full context, nuance, and language
        tier = self.assess_severity(text)

        if tier == "acute":
            return (
                "acute",
                "🚨 EMERGENCY ALERT: Critical symptoms detected. "
                "Do not wait — bring your pet to the clinic IMMEDIATELY "
                "or contact an emergency veterinarian right away. "
                "Time is critical for conditions requiring immediate intervention."
            )
        if tier == "urgent":
            return ("urgent", None)

        return (None, None)

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 4 & RISK 2 MITIGATION — Strict CSV-Grounded Symptom Matching
    # Returns: (best_match_row | None, score: float)
    # ──────────────────────────────────────────────────────────────────────────
    def find_best_match(self, query: str, category: str = "symptoms"):
        if category != "symptoms":
            return None, 0.0

        if self.df_symptoms.empty or self.symptom_embeddings is None:
            return None, 0.0

        query_embedding = self.embedding_model.encode(query, convert_to_tensor=True)
        cosine_scores   = util.cos_sim(query_embedding, self.symptom_embeddings)[0]

        raw_score  = float(cosine_scores.max())
        best_index = int(cosine_scores.argmax())

        print(f"\n{'='*55}")
        print(f"🔍 SYMPTOM DATASET MATCH DEBUG")
        print(f"{'='*55}")
        print(f"  Query     : {query}")
        print(f"  Score     : {raw_score:.4f}  (threshold: {SIMILARITY_THRESHOLD})")
        if raw_score >= SIMILARITY_THRESHOLD:
            row = self.df_symptoms.iloc[best_index]
            print(f"  ✅ MATCH FOUND")
            print(f"  Disease   : {row.get('Disease', 'N/A')}")
            print(f"  Animal    : {row.get('Animal', 'N/A')}")
            print(f"  Symptoms  : {row.get('Symptoms_Text', 'N/A')}")
            print(f"  Dangerous : {row.get('is_dangerous', 'N/A')}")
            print(f"  Advice    : {row.get('Advice / Notes', 'N/A')}")
        else:
            print(f"  ❌ NO MATCH (below threshold — out-of-scope)")
        print(f"{'='*55}\n")

        if raw_score < SIMILARITY_THRESHOLD:
            return None, raw_score
    
        matched_row = self.df_symptoms.iloc[best_index]
        matched_symptoms = matched_row['Symptoms_Text']

        if self._check_contradiction(query, matched_symptoms):
            print(f"  ⚠️ CONTRADICTION DETECTED - rejecting match")
            return None, raw_score  # Treat as no match

        return matched_row, raw_score


    def _check_contradiction(self, user_query: str, matched_symptoms: str) -> bool:
        """
        Check if user's symptoms contradict the matched dataset.
        Returns True if contradiction found.
        """
        # Define opposite pairs
        contradictions = [
            (["drinking", "drinks"], ["not drinking", "dehydrated"]),
            (["eating", "eats"], ["not eating", "anorexia"]),
            (["energetic", "active", "playful"], ["lethargic", "weak", "tired"]),
            (["alert", "responsive"], ["unresponsive", "unconscious"]),
        ]

        user_lower = user_query.lower()
        symptoms_lower = matched_symptoms.lower()

        for positive_keywords, negative_keywords in contradictions:
            # Check if user says positive but data says negative
            has_positive = any(kw in user_lower for kw in positive_keywords)
            has_negative = any(kw in symptoms_lower for kw in negative_keywords)

            if has_positive and has_negative:
                return True

        return False

    # ──────────────────────────────────────────────────────────────────────────
    # CSV-Grounded Danger Check
    # ──────────────────────────────────────────────────────────────────────────
    def is_match_dangerous(self, match_row) -> bool:
        if match_row is None:
            return False
        try:
            return bool(match_row.get("is_dangerous", False))
        except Exception:
            return False

    # ──────────────────────────────────────────────────────────────────────────
    # Breed Validation (3-layer)
    # ──────────────────────────────────────────────────────────────────────────
    BREED_WHITELIST = {
        "Dog": [
            "aspin", "asong pinoy", "asong-pinoy", "aso", "native dog",
            "philippine dog", "ph dog", "irong bisaya", "irong", "askal",
            "mixed", "unknown", "mongrel", "crossbreed",
            "labrador", "lab", "golden retriever", "golden", "german shepherd", "gsd",
            "bulldog", "french bulldog", "frenchie", "poodle", "beagle", "rottweiler",
            "yorkshire terrier", "yorkie", "boxer", "dachshund", "siberian husky", "husky",
            "shih tzu", "chihuahua", "doberman", "great dane", "maltese", "pomeranian",
            "border collie", "australian shepherd", "australian cattle dog", "akita",
            "pitbull", "american pitbull terrier", "american bully", "bully",
            "jack russell", "cocker spaniel", "springer spaniel", "whippet",
            "basset hound", "bloodhound", "dalmatian", "samoyed", "chow chow",
            "shar pei", "schnauzer", "miniature schnauzer", "standard poodle",
            "miniature poodle", "toy poodle", "lhasa apso", "bichon frise",
            "papillon", "pembroke welsh corgi", "corgi", "alaskan malamute",
            "malamute", "vizsla", "weimaraner", "portuguese water dog", "native",
            "local breed",
        ],
        "Cat": [
            "mixed", "unknown", "domestic shorthair", "domestic longhair", "tabby",
            "persian", "maine coon", "siamese", "ragdoll", "bengal", "sphynx",
            "british shorthair", "scottish fold", "abyssinian", "burmese",
            "russian blue", "norwegian forest cat", "turkish angora", "manx",
            "devon rex", "cornish rex", "oriental shorthair", "tonkinese",
            "balinese", "birman", "exotic shorthair", "himalayan", "savannah",
            "native", "local breed", "puspin", "pusang pinoy", "pusa",
            "philippine cat", "ph cat", "native cat", "lokal",
        ],
        "Rabbit": [
            "mixed", "unknown", "holland lop", "mini lop", "french lop",
            "english lop", "flemish giant", "dutch", "mini rex", "rex",
            "lionhead", "angora", "english angora", "french angora",
            "new zealand", "californian", "chinchilla", "himalayan",
            "american", "beveren", "native", "local breed",
        ],
        "Hamster": [
            "mixed", "unknown", "syrian", "golden", "dwarf", "roborovski",
            "campbell's dwarf", "winter white", "chinese hamster", "native",
        ],
        "Turtle": [
            "mixed", "unknown", "red-eared slider", "red eared slider",
            "box turtle", "painted turtle", "map turtle", "snapping turtle",
            "sulcata tortoise", "russian tortoise", "greek tortoise",
            "hermann's tortoise", "star tortoise", "native", "local breed",
        ],
        "Bird": [
            "mixed", "unknown", "parrot", "macaw", "cockatiel", "cockatoo",
            "budgerigar", "budgie", "lovebird", "african grey", "amazon parrot",
            "conure", "parakeet", "canary", "finch", "mynah", "myna",
            "pigeon", "dove", "native", "local breed",
        ],
        "Cow": [
            "mixed", "unknown", "holstein", "jersey", "hereford", "angus",
            "brahman", "charolais", "simmental", "limousin", "shorthorn",
            "zebu", "native", "local breed",
        ],
        "Hen": [
            "mixed", "unknown", "leghorn", "rhode island red", "plymouth rock",
            "barred rock", "buff orpington", "wyandotte", "australorp", "sussex",
            "brahma", "cochin", "silkie", "polish", "easter egger", "ameraucana",
            "araucana", "bantam", "native", "local breed", "broiler", "layer",
        ],
        "Pig": [
            "mixed", "unknown", "landrace", "yorkshire", "duroc", "hampshire",
            "berkshire", "spotted", "chester white", "poland china", "large white",
            "pietrain", "vietnamese pot-bellied", "pot-bellied", "native",
            "local breed", "liempo", "bisaya",
        ],
        "Goat": [
            "mixed", "unknown", "boer", "nubian", "alpine", "saanen",
            "toggenburg", "lamancha", "angora", "pygmy", "nigerian dwarf",
            "kiko", "spanish", "cashmere", "native", "local breed",
        ],
        "Sheep": [
            "mixed", "unknown", "merino", "suffolk", "dorset", "romney",
            "corriedale", "border leicester", "lincoln", "rambouillet",
            "columbia", "cheviot", "jacob", "dorper", "katahdin",
            "native", "local breed",
        ],
        "Horse": [
            "mixed", "unknown", "thoroughbred", "quarter horse", "arabian",
            "appaloosa", "paint", "morgan", "andalusian", "warmblood",
            "friesian", "clydesdale", "shire", "percheron", "belgian",
            "shetland pony", "shetland", "welsh pony", "mustang",
            "standardbred", "native", "local breed",
        ],
        "Duck": [
            "mixed", "unknown", "pekin", "mallard", "muscovy", "rouen",
            "khaki campbell", "indian runner", "cayuga", "swedish",
            "buff", "native", "local breed", "pateros",
        ],
        "Buffalo": [
            "mixed", "unknown", "water buffalo", "carabao", "murrah",
            "nili-ravi", "surti", "jaffarabadi", "bhadawari", "tarai",
            "native", "local breed",
        ],
        "Cattle": [
            "mixed", "unknown", "holstein", "jersey", "hereford", "angus",
            "brahman", "charolais", "simmental", "limousin", "shorthorn",
            "zebu", "native", "local breed",
        ],
        "Donkey": [
            "mixed", "unknown", "standard donkey", "miniature donkey",
            "mammoth jackstock", "poitou", "andalusian donkey",
            "native", "local breed",
        ],
        "Mule": [
            "mixed", "unknown", "standard mule", "draft mule",
            "native", "local breed",
        ],
    }

    def validate_breed_for_species(self, breed: str, species: str) -> bool:
        breed_lower = breed.lower().strip()
        universal_ok = {"unknown", "mixed", "crossbreed", "mongrel", "native",
                        "local breed", "local", "di alam", "not sure"}
        if breed_lower in universal_ok:
            return True
        whitelist = self.BREED_WHITELIST.get(species, [])
        if any(breed_lower == w or breed_lower in w or w in breed_lower for w in whitelist):
            return True
        prompt = (
            f'You are a veterinary breed validator.\n'
            f'Is "{breed}" a recognized or commonly known breed, variety, or type of {species}?\n'
            f'NOTE: Philippine local breeds are valid — e.g. "Aspin" for dogs, "Puspin" for cats.\n'
            f'Answer ONLY "yes" or "no". Do not explain.\n'
            f'Answer:'
        )
        result = self.ask_llm_direct(prompt).strip().lower()
        return result == "yes"

    # ──────────────────────────────────────────────────────────────────────────
    # Entity Extraction
    # ──────────────────────────────────────────────────────────────────────────
    def extract_entity_with_ai(self, user_input: str, entity_type: str, exclude=None) -> str:
        exclude_note = (
            f'\n5. Do NOT return "{exclude}" — that is the pet\'s name, not the {entity_type}.'
            if exclude else ""
        )
        # For animal species extraction, include the Tagalog→English mapping so
        # the LLM can resolve Filipino animal names to the canonical English form.
        tagalog_note = ""
        if entity_type in ("animal species", "animal"):
            tagalog_note = (
                "\nTagalog animal name reference (always return the ENGLISH name):\n"
                "aso/aspin/askal → Dog | pusa/puspin → Cat | kuneho → Rabbit | "
                "pagong → Turtle | ibon → Bird | baka → Cow | manok → Hen | "
                "baboy → Pig | kambing → Goat | tupa → Sheep | kabayo → Horse | "
                "pato → Duck | kalabaw → Buffalo | buriko → Donkey | mula → Mule\n"
                "Always return the English equivalent, never the Tagalog word."
            )
        prompt = (
            f'TASK: Extract the {entity_type} from the user\'s input.\n'
            f'USER INPUT: "{user_input}"\n'
            f'RULES:\n'
            f'1. Return ONLY the {entity_type} in English (no extra words).\n'
            f'2. If a correction is present (e.g. "Wait no it\'s Coco"), extract the corrected value.\n'
            f'3. If no valid {entity_type} found, return "None".\n'
            f'4. Remove punctuation. Use Title Case.{exclude_note}{tagalog_note}\n'
            f'Output:'
        )
        raw = self.ask_llm_direct(prompt).strip().replace('"', '').replace("'", "")
        return raw.title()

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 3 — Booking Validation (Clinic Hours: 7 AM – 8 PM)
    # ──────────────────────────────────────────────────────────────────────────
    def validate_datetime(self, user_input: str):
        time_match = re.search(r"(\d{1,2}):(\d{2})\s*(AM|PM)", user_input.upper())
        if not time_match:
            return False, "Please include a time in 12-hour format (e.g. 10:00 AM)."

        hour_str, minute_str, period = time_match.groups()
        hour   = int(hour_str)
        minute = int(minute_str)

        if period == 'PM' and hour != 12:
            hour += 12
        elif period == 'AM' and hour == 12:
            hour = 0

        date_match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", user_input)
        if not date_match:
            return False, "Please include a date in MM/DD/YYYY format (e.g. 03/15/2026)."

        month = int(date_match.group(1))
        day   = int(date_match.group(2))
        year  = int(date_match.group(3))

        try:
            appointment_dt = datetime(year, month, day, hour, minute)
        except ValueError:
            return False, "Invalid date. Please verify the day and month are correct."

        if appointment_dt < datetime.now():
            return False, "That date and time has already passed. Please choose a future appointment."

        if CLINIC_OPEN <= hour < CLINIC_CLOSE:
            return True, ""
        else:
            return False, (
                "Sorry, our clinic is closed at that time. "
                "We are open Monday–Saturday, 7:00 AM – 8:00 PM only."
            )

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 5 — LLM Calls with Offline Fallback
    # ──────────────────────────────────────────────────────────────────────────
    def ask_llm_direct(self, prompt: str) -> str:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type":  "application/json",
        }
        payload = {
            "model":    "mistralai/mistral-7b-instruct",
            "messages": [{"role": "user", "content": prompt}],
        }
        try:
            res = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
            return res.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"[LLM DIRECT ERROR] {e}")
            return "None"

    def ask_llm(self, user_prompt: str) -> str:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type":  "application/json",
        }
        messages = [
            {"role": "system", "content": self.system_instruction},
            {"role": "user",   "content": user_prompt},
        ]
        payload = {
            "model":    "mistralai/mistral-7b-instruct",
            "messages": messages,
        }
        try:
            res = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
            result = res.json()["choices"][0]["message"]["content"]
            print(f"[LLM RESPONSE PREVIEW] {result[:150]}...")
            return result
        except Exception as e:
            print(f"[LLM ERROR] {e}")
            return (
                "I'm currently unable to reach the AI service. "
                "Please book a consultation through VetConnect so a vet can assess your pet directly. "
                "Only a licensed veterinarian can confirm the exact cause."
            )

    # ──────────────────────────────────────────────────────────────────────────
    # Complaint Summarizer
    # Converts the user's raw description into a short medical complaint label
    # (3–6 words, Title Case) for display in booking summaries and records.
    # e.g. "my coco has been coughing for a month even though taking meds"
    #      → "Chronic Cough Unresponsive to Medication"
    # ──────────────────────────────────────────────────────────────────────────
    def summarize_complaint(self, raw_reason: str) -> str:
        prompt = (
            f'You are a veterinary receptionist summarizing a pet owner\'s complaint.\n'
            f'Owner\'s description: "{raw_reason}"\n\n'
            f'Rules:\n'
            f'1. Return ONLY a short medical complaint label of 3–6 words.\n'
            f'2. Use Title Case (e.g. "Chronic Cough Unresponsive to Medication").\n'
            f'3. Be specific but concise — capture the main symptom and any key context.\n'
            f'4. Do NOT include pet names, owner names, or filler words.\n'
            f'5. Do NOT add explanation or punctuation — just the label.\n'
            f'Examples:\n'
            f'  "my dog keeps scratching but i don\'t see fleas" → Persistent Scratching, No Fleas Visible\n'
            f'  "not eating for 2 days and very tired" → Loss of Appetite and Lethargy\n'
            f'  "has been vomiting since yesterday after eating" → Vomiting After Eating\n'
            f'  "coughing for a month even on meds" → Chronic Cough Unresponsive to Medication\n'
            f'Label:'
        )
        try:
            result = self.ask_llm_direct(prompt).strip()
            # Strip any accidental quotes or punctuation the LLM adds
            result = result.strip('"\'.,;:').strip()
            # Fallback: if LLM returns something too long or empty, use truncated raw
            if not result or len(result.split()) > 10:
                words = raw_reason.strip().split()
                result = ' '.join(words[:6]).title() + ('…' if len(words) > 6 else '')
            return result
        except Exception:
            return raw_reason[:60]

    # ──────────────────────────────────────────────────────────────────────────
    # BLOCKCHAIN — Immutable Appointment Log
    # ──────────────────────────────────────────────────────────────────────────
    def generate_transaction_hash(self, booking_data: dict) -> str:
        payload  = {**booking_data, "_timestamp": time.time()}
        raw_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
        hash_hex  = hashlib.sha256(raw_bytes).hexdigest()
        return f"0x{hash_hex}"