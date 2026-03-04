import pandas as pd
import requests
import json
import re
import hashlib
import time
import os
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer, util
from datetime import datetime
from typing import Tuple, Optional, Dict, Any

# ==========================================
# CONFIGURATION
# ==========================================
load_dotenv()
API_KEY = os.getenv("OPENROUTER_API_KEY")
LLM_MODEL = "openai/gpt-4o-mini"
CLINIC_OPEN = 7   # 7:00 AM
CLINIC_CLOSE = 20  # 8:00 PM

# Minimum seconds between LLM calls (Risk 1 — Rate Limiting).
RATE_LIMIT_SECONDS = 3

# ENHANCED: Multi-tier confidence thresholds
SIMILARITY_THRESHOLD_HIGH = 0.7   # High confidence - provide advice directly
SIMILARITY_THRESHOLD_MED = 0.5    # Medium confidence - ask clarifying questions
# Below 0.5 - Extract symptoms and retry

# Backward compatibility
SIMILARITY_THRESHOLD = SIMILARITY_THRESHOLD_HIGH

# ==========================================
# VETBRAIN — AI Logic Class (ENHANCED)
# ==========================================

class VetBrain:
    def __init__(self):
        self.status = "Loading..."
        self.df_services = pd.DataFrame()
        self.df_symptoms = pd.DataFrame()
        self.symptom_embeddings = None
        self.embedding_model = None
        self.last_llm_call = 0.0  # Rate limiting tracker

        # ── Supported & out-of-scope animals ────────────────────────────────────
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
        self.tagalog_animal_map = {
            # Pets
            "aso": "Dog", "aspin": "Dog", "askal": "Dog",
            "pusa": "Cat", "puspin": "Cat",
            "kuneho": "Rabbit",
            "hamster": "Hamster",
            "pagong": "Turtle",
            "ibon": "Bird",
            # Farm animals
            "baka": "Cow",
            "manok": "Hen",
            "baboy": "Pig",
            "kambing": "Goat",
            "tupa": "Sheep",
            "kabayo": "Horse",
            "pato": "Duck",
            "kalabaw": "Buffalo",
            "buriko": "Donkey",
            "mula": "Mule",
        }

        # ── Breed whitelist for validation ────────────────────────────────
        self.BREED_WHITELIST = {
            "Dog": [
                "aspin", "askal", "mongrel", "mixed", "labrador", "golden retriever",
                "german shepherd", "bulldog", "poodle", "beagle", "chihuahua",
                "shih tzu", "dachshund", "pomeranian", "husky", "corgi", "pug",
                "rottweiler", "doberman", "boxer", "dalmatian", "maltese"
            ],
            "Cat": [
                "puspin", "mixed", "persian", "siamese", "maine coon", "ragdoll",
                "bengal", "sphynx", "british shorthair", "scottish fold", "tabby",
                "calico", "orange", "black", "white"
            ],
            "Rabbit": ["holland lop", "netherland dwarf", "flemish giant", "mixed"],
            "Bird": ["parrot", "cockatiel", "lovebird", "canary", "finch", "budgie"],
        }

        self.system_instruction = """You are "VetBot", the AI assistant for VetConnect Veterinary Clinic.

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
        """Load veterinary knowledge base and initialize embedding model"""
        print("⏳ Initializing VetConnect AI... (Loading Knowledge Base)")

        # --- A. SERVICES ---
        services_data = [
            {"Name": "Spay & Neuter", "User_Phrases": "kapon, castrate, fix, ligation", "Advice / Notes": "Fasting required (8-12 hours)."},
            {"Name": "Consultation", "User_Phrases": "checkup, vet visit, sick, matamlay, ayaw kumain", "Advice / Notes": "Bring medical records."},
            {"Name": "Vaccination", "User_Phrases": "anti-rabies, 5in1, 4in1, shots, bakuna, parvo", "Advice / Notes": "Puppies start at 6-8 weeks."},
            {"Name": "Deworming", "User_Phrases": "purga, worms, bulate, deworm", "Advice / Notes": "Required every 2 weeks for puppies."},
            {"Name": "Grooming", "User_Phrases": "ligua, gupit, bath, haircut, smell bad", "Advice / Notes": "Inform us if aggressive."},
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
            print(f"⚠️  Warning: CSV error ({e}). Using AI fallback.")
            self.df_symptoms = pd.DataFrame()

        # --- C. EMBEDDING MODEL ---
        print("⏳ Loading embedding model...")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        if not self.df_symptoms.empty:
            self.symptom_embeddings = self.embedding_model.encode(
                self.df_symptoms["combined_text"].tolist(), convert_to_tensor=True
            )
            print(f"✅ Embeddings built for {len(self.df_symptoms)} rows.")

        self.status = "Ready"
        print("✅ VetConnect AI Ready! Using GPT-4o-mini via OpenRouter")
        print(f"⚠️  ENHANCED MODE: Multi-tier confidence system")
        print(f"   - High confidence (0.7+): Direct advice")
        print(f"   - Medium confidence (0.5-0.7): Ask clarifying questions")
        print(f"   - Low confidence (<0.5): Extract symptoms and retry")

    # ──────────────────────────────────────────────────────────────────────────
    # INPUT SANITIZATION
    # ──────────────────────────────────────────────────────────────────────────
    def sanitize_input(self, text: str) -> str:
        """Remove potentially malicious input patterns"""
        text = re.sub(r'<[^>]*>', '', text)  # Remove HTML tags
        
        # Block SQL injection patterns
        sql_keywords = (
            r'\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|'
            r'UNION|--|;|\/\*|\*\/|xp_|CAST\(|CONVERT\()\b'
        )
        text = re.sub(sql_keywords, '[BLOCKED]', text, flags=re.IGNORECASE)
        
        # Remove control characters
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        
        # HTML entity encoding
        text = (text
                .replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;')
                .replace('"', '&quot;')
                .replace("'", '&#x27;'))
        
        return text.strip()

    # ──────────────────────────────────────────────────────────────────────────
    # SAFETY LAYER - Emergency Detection
    # ──────────────────────────────────────────────────────────────────────────
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
        Uses GPT-4o-mini to classify symptom severity.
        Returns: "acute", "urgent", or "normal"
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
            for tier in ("acute", "urgent", "normal"):
                if tier in result:
                    return tier
            return "normal"
        except Exception:
            return "normal"

    def check_safety(self, text: str) -> Tuple[str, Optional[str]]:
        """
        FIXED: Now always returns a tuple (tier, message).
        Returns (tier, message) where tier is "acute", "urgent", or "ok".
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
                "breathing difficulty, collapse, or poisoning."
            )

        # Layer 2 — LLM severity assessment for everything else
        tier = self.assess_severity(text)
        
        if tier == "acute":
            return (
                "acute",
                "🚨 EMERGENCY ALERT: Based on the symptoms described, your pet needs immediate veterinary attention. "
                "Please bring them to the clinic right away or contact an emergency veterinarian. "
                "Do not wait — this situation requires urgent care."
            )
        elif tier == "urgent":
            return ("urgent", None)  # Handled by LLM response later
        else:
            return ("ok", "")  # Routine case - proceed normally

    # ──────────────────────────────────────────────────────────────────────────
    # ENHANCED: Multi-Layer Symptom Matching
    # ──────────────────────────────────────────────────────────────────────────
    
    def extract_symptoms_from_narrative(self, text: str, animal: str = None) -> str:
        """
        ENHANCED: Convert behavioral/narrative description to medical symptoms
        
        Examples:
        - "didn't play today" → "lethargy, loss of energy, depression"
        - "won't eat breakfast" → "loss of appetite, anorexia"
        - "breathing funny" → "respiratory difficulty, dyspnea"
        """
        animal_note = f" for a {animal}" if animal else ""
        
        prompt = f"""You are a veterinary assistant extracting medical symptoms from a pet owner's description{animal_note}.

Owner's description: "{text}"

Convert behavioral observations and narrative descriptions into clinical veterinary symptom terms.

Common conversions:
- "didn't play", "less active", "just lying around" → lethargy, loss of energy, depression
- "won't eat", "not eating", "refusing food" → loss of appetite, anorexia
- "breathing hard", "breathing fast", "breathing funny" → respiratory distress, dyspnea, tachypnea
- "limping", "favoring leg", "won't walk" → lameness, pain, reluctance to move
- "throwing up", "vomited" → vomiting, emesis
- "loose stool", "watery poop" → diarrhea
- "scratching a lot" → pruritus, itching
- "drinking a lot" → polydipsia, increased thirst
- "peeing a lot" → polyuria, increased urination
- "seems off", "not himself", "acting weird" → behavioral change, malaise

Return ONLY the clinical symptom names, comma-separated. No explanations.
If the description is already using medical terms, return them as-is.
If multiple symptoms are implied, include all of them.

Clinical symptoms:"""
        
        try:
            result = self.ask_llm_direct(prompt).strip()
            # Clean up the response
            result = result.replace('"', '').replace("'", '').strip('.,;:')
            print(f"[SYMPTOM EXTRACTION] '{text}' → '{result}'")
            return result
        except Exception as e:
            print(f"[SYMPTOM EXTRACTION ERROR] {e}")
            return text  # Fallback to original

    def generate_clarification_questions(self, query: str, match: Optional[Dict], score: float, animal: str = None) -> str:
        """
        ENHANCED: Generate specific clarifying questions based on medium-confidence match
        
        When similarity is 0.5-0.7, we're not confident enough to give advice,
        but we have some idea what it might be. Ask targeted questions.
        """
        animal_name = animal if animal else "your pet"
        
        # If we have a potential match, ask about those specific symptoms
        if match:
            disease = match.get('Disease', 'a condition')
            symptoms = match.get('Symptoms_Text', '')
            
            return (
                f"I want to make sure I understand {animal_name}'s symptoms correctly to give you the best advice. "
                f"Based on what you described, I'm wondering if {animal_name} is showing any of these signs:\n\n"
                f"• Lethargy (very tired, lying down more than usual)\n"
                f"• Loss of appetite (not eating or eating less)\n"
                f"• Vomiting or diarrhea\n"
                f"• Weakness or difficulty moving\n"
                f"• Any fever or feeling warm to touch\n\n"
                f"Could you let me know which of these, if any, you're noticing? "
                f"This will help me give you more accurate guidance!"
            )
        else:
            # Generic clarification when no match at all
            return (
                f"I want to give you the most accurate advice for {animal_name}. "
                f"Could you describe the specific symptoms you're seeing? For example:\n\n"
                f"• Is {animal_name} vomiting or having diarrhea?\n"
                f"• Has eating or drinking changed?\n"
                f"• Are there any changes in energy levels or behavior?\n"
                f"• Any coughing, sneezing, or breathing issues?\n\n"
                f"The more specific you can be, the better I can help!"
            )

    def handle_consultation_reason_enhanced(
        self, 
        raw_input: str, 
        animal: str = None
    ) -> Tuple[str, Optional[Dict], float, Optional[str]]:
        """
        ENHANCED: Multi-layer symptom matching with intelligent fallbacks
        
        Returns: (confidence_tier, match, score, clarification_message)
        
        Confidence tiers:
        - "high" (0.7+): Direct match, provide advice
        - "medium" (0.5-0.7): Possible match, ask clarifying questions
        - "extracted" (0.7+ after extraction): Match found after symptom extraction
        - "low" (<0.5): No confident match, ask for more details
        """
        
        # Stage 1: Try direct match
        match, score = self.find_best_match(raw_input, 'symptoms')
        
        print(f"[ENHANCED MATCH] Direct match score: {score:.3f}")
        
        # HIGH CONFIDENCE (0.7+) - Provide advice directly
        if score >= SIMILARITY_THRESHOLD_HIGH:
            print(f"[ENHANCED MATCH] ✅ High confidence match")
            return ("high", match, score, None)
        
        # MEDIUM CONFIDENCE (0.5-0.7) - Ask for clarification
        elif score >= SIMILARITY_THRESHOLD_MED:
            print(f"[ENHANCED MATCH] ⚠️ Medium confidence - requesting clarification")
            clarification = self.generate_clarification_questions(raw_input, match, score, animal)
            return ("medium", match, score, clarification)
        
        # LOW CONFIDENCE (<0.5) - Extract symptoms and retry
        else:
            print(f"[ENHANCED MATCH] 🔄 Low confidence - extracting symptoms")
            extracted_symptoms = self.extract_symptoms_from_narrative(raw_input, animal)
            
            # Retry with extracted symptoms
            if extracted_symptoms and extracted_symptoms != raw_input:
                match_retry, score_retry = self.find_best_match(extracted_symptoms, 'symptoms')
                print(f"[ENHANCED MATCH] Extracted match score: {score_retry:.3f}")
                
                if score_retry >= SIMILARITY_THRESHOLD_HIGH:
                    print(f"[ENHANCED MATCH] ✅ High confidence after extraction")
                    return ("extracted", match_retry, score_retry, None)
                elif score_retry >= SIMILARITY_THRESHOLD_MED:
                    print(f"[ENHANCED MATCH] ⚠️ Medium confidence after extraction")
                    clarification = self.generate_clarification_questions(extracted_symptoms, match_retry, score_retry, animal)
                    return ("medium", match_retry, score_retry, clarification)
            
            # Still no good match - ask for details
            print(f"[ENHANCED MATCH] ❌ No confident match found")
            clarification = self.generate_clarification_questions(raw_input, None, score, animal)
            return ("low", None, score, clarification)

    # ──────────────────────────────────────────────────────────────────────────
    # CSV SYMPTOM MATCHING
    # ──────────────────────────────────────────────────────────────────────────
    def find_best_match(self, query: str, match_type: str = "symptoms") -> Tuple[Optional[Dict], float]:
        """Find best matching entry in symptom database using embeddings"""
        if self.df_symptoms.empty or self.symptom_embeddings is None:
            return None, 0.0

        query_embedding = self.embedding_model.encode(query, convert_to_tensor=True)
        scores = util.cos_sim(query_embedding, self.symptom_embeddings)[0]
        best_idx = scores.argmax().item()
        best_score = scores[best_idx].item()

        # Return match regardless of threshold - let caller decide what to do
        return self.df_symptoms.iloc[best_idx].to_dict(), best_score

    def is_match_dangerous(self, match: Optional[Dict]) -> bool:
        """Check if a CSV match is flagged as dangerous"""
        if match is None:
            return False
        return match.get('is_dangerous', False)

    # ──────────────────────────────────────────────────────────────────────────
    # BREED VALIDATION
    # ──────────────────────────────────────────────────────────────────────────
    def validate_breed_for_species(self, breed: str, species: str) -> bool:
        """Validate that a breed matches the animal species"""
        if species not in self.BREED_WHITELIST:
            return True  # No whitelist for this species, accept any
        
        whitelist = self.BREED_WHITELIST[species]
        breed_lower = breed.lower().strip()
        
        return any(w in breed_lower or breed_lower in w for w in whitelist)

    # ──────────────────────────────────────────────────────────────────────────
    # LLM CALLS - Using GPT-4o-mini via OpenRouter
    # ──────────────────────────────────────────────────────────────────────────
    def _enforce_rate_limit(self):
        """Enforce rate limiting between API calls"""
        elapsed = time.time() - self.last_llm_call
        if elapsed < RATE_LIMIT_SECONDS:
            time.sleep(RATE_LIMIT_SECONDS - elapsed)
        self.last_llm_call = time.time()

    def ask_llm(self, user_prompt: str) -> str:
        """Call LLM with system instruction and rate limiting"""
        self._enforce_rate_limit()
        return self.ask_llm_direct_with_system(user_prompt, self.system_instruction)

    def ask_llm_direct(self, user_prompt: str) -> str:
        """Direct LLM call WITHOUT system instruction (for internal tasks)"""
        self._enforce_rate_limit()
        return self.ask_llm_direct_with_system(user_prompt, system_msg=None)

    def ask_llm_direct_with_system(self, user_prompt: str, system_msg: Optional[str]) -> str:
        """Core LLM call with optional system message"""
        
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        }
        messages = [
            {"role": "system", "content": system_msg or "You are a helpful assistant."},
            {"role": "user", "content": user_prompt},
        ]
        payload = {
            "model": LLM_MODEL,
            "messages": messages,
            "temperature": 0.7,
        }
        
        try:
            print(f"[DEBUG] Calling OpenRouter API ({LLM_MODEL})...")
            res = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
            print(f"[DEBUG] Status Code: {res.status_code}")
            
            if res.status_code == 200:
                result = res.json()
                content = result["choices"][0]["message"]["content"]
                print(f"[DEBUG] Response: {content[:50]}...")
                return content
            else:
                print(f"[ERROR] HTTP {res.status_code}: {res.text}")
                return (
                    "I'm currently unable to reach the AI service. "
                    "Please book a consultation through VetConnect so a vet can assess your pet directly. "
                    "Only a licensed veterinarian can confirm the exact cause."
                )
                
        except Exception as e:
            print(f"[LLM ERROR] {e}")
            return (
                "I'm currently unable to reach the AI service. "
                "Please book a consultation through VetConnect so a vet can assess your pet directly. "
                "Only a licensed veterinarian can confirm the exact cause."
            )

    # ──────────────────────────────────────────────────────────────────────────
    # ENTITY EXTRACTION (with Tagalog support)
    # ──────────────────────────────────────────────────────────────────────────
    def extract_entity_with_ai(self, user_input: str, entity_type: str, exclude: str = None) -> str:
        """
        Extract specific entities (service, animal, breed, pet name) from user input.
        Handles English and Tagalog inputs.
        """
        exclude_note = (
            f'\n5. Do NOT return "{exclude}" — that is the pet\'s name, not the {entity_type}.'
            if exclude else ""
        )
        
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
    # COMPLAINT SUMMARIZER
    # ──────────────────────────────────────────────────────────────────────────
    def summarize_complaint(self, raw_reason: str) -> str:
        """
        Converts raw symptom description into a concise medical complaint label.
        e.g. "my dog has been coughing for a month" → "Chronic Cough"
        """
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
            result = self.ask_llm_direct(prompt).strip().strip('"\'.,;:')
            if not result or len(result.split()) > 10:
                words = raw_reason.strip().split()
                result = ' '.join(words[:6]).title() + ('…' if len(words) > 6 else '')
            return result
        except Exception:
            return raw_reason[:60]

    # ──────────────────────────────────────────────────────────────────────────
    # DATETIME VALIDATION
    # ──────────────────────────────────────────────────────────────────────────
    def validate_datetime(self, user_input: str) -> Tuple[bool, str]:
        """Validate appointment date/time is within clinic hours"""
        time_match = re.search(r"(\d{1,2}):(\d{2})\s*(AM|PM)", user_input.upper())
        if not time_match:
            return False, "Please include a time in 12-hour format (e.g. 10:00 AM)."

        hour_str, minute_str, period = time_match.groups()
        hour = int(hour_str)
        minute = int(minute_str)

        if period == 'PM' and hour != 12:
            hour += 12
        elif period == 'AM' and hour == 12:
            hour = 0

        date_match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", user_input)
        if not date_match:
            return False, "Please include a date in MM/DD/YYYY format (e.g. 03/15/2026)."

        month = int(date_match.group(1))
        day = int(date_match.group(2))
        year = int(date_match.group(3))

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
    # BLOCKCHAIN - Transaction Hash Generation
    # ──────────────────────────────────────────────────────────────────────────
    def generate_transaction_hash(self, booking_data: Dict[str, Any]) -> str:
        """Generate an immutable SHA-256 hash for the appointment"""
        payload = {**booking_data, "_timestamp": time.time()}
        raw_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
        hash_hex = hashlib.sha256(raw_bytes).hexdigest()
        return f"0x{hash_hex}"