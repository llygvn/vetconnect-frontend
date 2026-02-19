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
# Enforced at the API layer; this constant is exported for use there.
RATE_LIMIT_SECONDS = 3

# Similarity threshold below which a query is considered out-of-scope (Risk 4).
SIMILARITY_THRESHOLD = 0.3

# ==========================================
# VETBRAIN — AI Logic Class
# ==========================================

class VetBrain:
    def __init__(self):
        self.status = "Loading..."
        self.df_services   = pd.DataFrame()
        self.df_symptoms   = pd.DataFrame()
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

        # ── DANGER KEYWORDS — Safety Layer (Risk 2) ─────────────────────────
        # Any of these in the user's message triggers an immediate hard override.
        self._danger_words = [
            # English
            "blood", "bleeding", "hemorrhage", "seizure", "convulsion",
            "unconscious", "unresponsive", "collapse", "collapsed",
            "poison", "poisoned", "toxic", "chocolate", "xylitol",
            "can't breathe", "not breathing", "difficulty breathing",
            "pale gums", "blue gums", "broken bone", "fracture",
            # Filipino
            "dugo", "nagdudugo", "lason", "nalason", "hindi humihinga",
            "hindi makahinga", "nanghihina", "nalaglag", "namatay",
            "dying", "die",
        ]

        # ── Refined System Instruction ───────────────────────────────────────
        # Goal: prevent hallucination, enforce scope, ensure cautious language,
        # and always push the user toward booking through this system.
        self.system_instruction = f"""You are "VetBot", the AI assistant for VetConnect Veterinary Clinic.

ABSOLUTE RULES — never violate any of these:
1. SCOPE: Only provide advice for these supported animals: {", ".join(self.supported_animals)}.
   If asked about any other animal, say: "We only treat domestic and farm animals at VetConnect."
2. ANIMAL ACCURACY: The user's message will always specify or imply a specific animal.
   You MUST base your entire response on THAT animal only.
   NEVER mention, reference, or give advice for a different animal species.
   For example: if the user mentions a Dog, your response must only say "dog" — never "sheep", "cat", or any other species.
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
8. BOOKING — CRITICAL: NEVER tell the user to "call the clinic", "contact us by phone",
   or seek help "manually". VetConnect has a fully working online booking system.
   Always end health-related responses by encouraging the user to book an appointment
   through this chat system. Example ending: "You can book a consultation right here."
9. OUT-OF-SCOPE: If the question is not about pet health, veterinary services,
   or appointment booking, reply: "I can only assist with veterinary questions."
10. HALLUCINATION PREVENTION: If you are unsure about a symptom or condition,
    say so explicitly and recommend booking a consultation through this system.
    Never fabricate drug names, dosages, or diagnostic tests.
"""

    # ──────────────────────────────────────────────────────────────────────────
    # STARTUP
    # Call once when the server boots to load data and models.
    # ──────────────────────────────────────────────────────────────────────────
    def load_data(self):
        print("⏳ Initializing VetConnect AI... (Loading Knowledge Base)")

        # --- A. SERVICES ---
        services_data = [
            {"Name": "Spay & Neuter",  "User_Phrases": "kapon, castrate, fix, ligation, balls removal", "Advice / Notes": "Fasting required (8-12 hours)."},
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
            self.df_symptoms['Advice / Notes'] = self.df_symptoms['Dangerous'].apply(
                lambda x: "⚠️ URGENT: Visit vet immediately."
                if str(x).lower().strip() == 'yes' else "Monitor closely."
            )
            self.df_symptoms['Name'] = "Symptom Analysis"
            self.df_symptoms["combined_text"] = (
                self.df_symptoms['Animal'].astype(str) + " "
                + self.df_symptoms['Symptoms_Text'].astype(str)
            )
        except Exception as e:
            print(f"Warning: CSV error ({e}). Using AI fallback.")
            self.df_symptoms = pd.DataFrame()

        # --- C. EMBEDDING MODEL ---
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        if not self.df_symptoms.empty:
            self.symptom_embeddings = self.embedding_model.encode(
                self.df_symptoms["combined_text"].tolist(), convert_to_tensor=True
            )

        self.status = "Ready"
        print("✅ System Ready!")

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 6 — Input Sanitization
    # Call on EVERY user input before any processing.
    # ──────────────────────────────────────────────────────────────────────────
    def sanitize_input(self, text: str) -> str:
        # Strip HTML/script tags (XSS)
        text = re.sub(r'<[^>]*>', '', text)

        # Neutralize SQL injection keywords
        sql_keywords = (
            r'\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|'
            r'UNION|--|;|\/\*|\*\/|xp_|CAST\(|CONVERT\()\b'
        )
        text = re.sub(sql_keywords, '[BLOCKED]', text, flags=re.IGNORECASE)

        # Remove null bytes and non-printable control characters
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

        # Escape remaining angle brackets and quotes
        text = (text
                .replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;')
                .replace('"', '&quot;')
                .replace("'", '&#x27;'))

        return text.strip()

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 2 — Safety Layer (Hard Override for Critical Symptoms)
    # MUST be called BEFORE any LLM or semantic matching.
    # Returns: emergency string if triggered, None if safe to proceed.
    # ──────────────────────────────────────────────────────────────────────────
    def check_safety(self, text: str):
        text_lower = text.lower()
        triggered = [w for w in self._danger_words if w in text_lower]
        if triggered:
            return (
                "🚨 EMERGENCY ALERT: Critical symptoms detected. "
                "Do not wait — bring your pet to the clinic IMMEDIATELY "
                "or contact an emergency veterinarian right away. "
                "Time is critical for conditions involving bleeding, seizures, "
                "poisoning, or loss of consciousness."
            )
        return None

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 4 — Semantic Symptom Matching (Threshold: 0.3)
    # Queries scoring below 0.3 are out-of-scope and should be filtered.
    # Returns: (best_match_row | None, score: float)
    # ──────────────────────────────────────────────────────────────────────────
    def find_best_match(self, query: str, db_type: str):
        if db_type != "symptoms":
            return None, 0.0

        if self.df_symptoms.empty or self.symptom_embeddings is None:
            return None, 0.0

        query_embedding = self.embedding_model.encode(query, convert_to_tensor=True)
        cosine_scores   = util.cos_sim(query_embedding, self.symptom_embeddings)[0]

        raw_score  = float(cosine_scores.max())
        best_index = int(cosine_scores.argmax())

        if raw_score < SIMILARITY_THRESHOLD:
            return None, raw_score  # Below threshold — treat as irrelevant

        return self.df_symptoms.iloc[best_index], raw_score

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

        # Layer 1: Universal fallbacks always pass
        universal_ok = {"unknown", "mixed", "crossbreed", "mongrel", "native",
                        "local breed", "local", "di alam", "not sure"}
        if breed_lower in universal_ok:
            return True

        # Layer 2: Hardcoded whitelist
        whitelist = self.BREED_WHITELIST.get(species, [])
        if any(breed_lower == w or breed_lower in w or w in breed_lower for w in whitelist):
            return True

        # Layer 3: LLM fallback for obscure breeds
        prompt = (
            f'You are a veterinary breed validator.\n'
            f'Is "{breed}" a recognized or commonly known breed, variety, or type of {species}?\n'
            f'NOTE: Philippine local breeds are valid — e.g. "Aspin" (Asong Pinoy) for dogs, '
            f'"Puspin" (Pusang Pinoy) for cats, "Carabao" for buffalo, "Bisaya" pigs/chickens.\n'
            f'Answer ONLY "yes" or "no". Do not explain.\n'
            f'Answer "yes" only if it is a real {species} breed or type.\n'
            f'Answer "no" for any other animal, random word, food, place, or nonsense.\n'
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
        prompt = (
            f'TASK: Extract the {entity_type} from the user\'s input.\n'
            f'USER INPUT: "{user_input}"\n'
            f'RULES:\n'
            f'1. Return ONLY the {entity_type} (no extra words).\n'
            f'2. If a correction is present (e.g. "Wait no it\'s Coco"), extract the corrected value.\n'
            f'3. If no valid {entity_type} found, return "None".\n'
            f'4. Remove punctuation. Use Title Case (e.g. "Persian", not "PERSIAN").{exclude_note}\n'
            f'Output:'
        )
        raw = self.ask_llm_direct(prompt).strip().replace('"', '').replace("'", "")
        return raw.title()

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 3 — Booking Validation (Clinic Hours: 7 AM – 8 PM)
    # Returns: (True, "") if valid | (False, error_message) if invalid
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

        # Strict clinic-hours check: must be 7:00 AM – 7:59 PM (< 20:00)
        if CLINIC_OPEN <= hour < CLINIC_CLOSE:
            return True, ""
        else:
            return False, (
                "Sorry, our clinic is closed at that time. "
                "We are open Monday–Saturday, 7:00 AM – 8:00 PM only."
            )

    # ──────────────────────────────────────────────────────────────────────────
    # RISK 5 — LLM Calls with Offline Fallback
    # ask_llm_direct: no system prompt (extraction, yes/no checks)
    # ask_llm       : uses system_instruction (symptom advice generation)
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
        except Exception:
            return "None"  # Callers must handle "None" gracefully

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
            return res.json()["choices"][0]["message"]["content"]
        except Exception:
            return (
                "I'm currently unable to reach the AI service. "
                "Please book a consultation through VetConnect so a vet can assess your pet directly. "
                "Only a licensed veterinarian can confirm the exact cause."
            )

    # ──────────────────────────────────────────────────────────────────────────
    # BLOCKCHAIN — Immutable Appointment Log (Acceptance Criterion 4)
    # Simulates a transaction hash via SHA-256 of the booking payload.
    # In production, replace with a real Web3.py / Ganache call.
    # ──────────────────────────────────────────────────────────────────────────
    def generate_transaction_hash(self, booking_data: dict) -> str:
        """
        Simulate blockchain logging by producing a deterministic SHA-256 hash
        of the appointment record.  Replace the body of this function with an
        actual web3.py call (e.g. w3.eth.send_transaction) in production.

        Returns a hex string prefixed with "0x" to mimic an Ethereum tx hash.
        """
        # Add a timestamp so two identical bookings still produce unique hashes
        payload = {**booking_data, "_timestamp": time.time()}
        raw_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
        hash_hex  = hashlib.sha256(raw_bytes).hexdigest()
        return f"0x{hash_hex}"