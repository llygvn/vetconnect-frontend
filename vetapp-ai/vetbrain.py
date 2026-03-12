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
from typing import Tuple, Optional, Dict, Any, List

# ==========================================
# CONFIGURATION
# ==========================================
load_dotenv()
API_KEY = os.getenv("OPENROUTER_API_KEY")
LLM_MODEL = "openai/gpt-4o-mini"
CLINIC_OPEN = 7   # 7:00 AM
CLINIC_CLOSE = 20  # 8:00 PM

# Minimum seconds between LLM calls (Rate Limiting)
RATE_LIMIT_SECONDS = 3

# RAG configuration
RAG_TOP_K = 5  # Number of top matches to retrieve for context

# ==========================================
# VETBRAIN — AI Logic Class (RAG-Enhanced)
# ==========================================

class VetBrain:
    def __init__(self):
        self.status = "Loading..."
        self.df_services = pd.DataFrame()
        self.df_symptoms = pd.DataFrame()       # clean-data.csv (safety + ML eval)
        self.df_rag = pd.DataFrame()            # Animal_disease_spreadsheet (RAG knowledge base)
        self.symptom_embeddings = None
        self.rag_embeddings = None
        self.embedding_model = None
        self.last_llm_call = 0.0

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
        self.tagalog_animal_map = {
            "aso": "Dog", "aspin": "Dog", "askal": "Dog",
            "pusa": "Cat", "puspin": "Cat",
            "kuneho": "Rabbit",
            "hamster": "Hamster",
            "pagong": "Turtle",
            "ibon": "Bird",
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

        # ── Breed whitelist ────────────────────────────────────────────────
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
10. HALLUCINATION PREVENTION — CRITICAL: You will be given context extracted directly
    from a verified veterinary knowledge base. You MUST only discuss conditions and
    advice that is explicitly provided to you in the prompt context.
    NEVER fabricate, add, or infer any drug names, dosages, diagnostic tests,
    or conditions beyond what is explicitly given to you.
    Your role is to communicate the knowledge base findings in a clear, empathetic
    tone — not to generate new medical information.
"""

    # ──────────────────────────────────────────────────────────────────────────
    # STARTUP
    # ──────────────────────────────────────────────────────────────────────────
    def load_data(self):
        """Load veterinary knowledge base and initialize embedding model"""
        print("⏳ Initializing VetConnect AI... (RAG Mode)")

        # --- A. SERVICES ---
        services_data = [
            {"Name": "Spay & Neuter", "User_Phrases": "kapon, castrate, fix, ligation", "Advice / Notes": "Fasting required (8-12 hours)."},
            {"Name": "Consultation", "User_Phrases": "checkup, vet visit, sick, matamlay, ayaw kumain", "Advice / Notes": "Bring medical records."},
            {"Name": "Vaccination", "User_Phrases": "anti-rabies, 5in1, 4in1, shots, bakuna, parvo", "Advice / Notes": "Puppies start at 6-8 weeks."},
            {"Name": "Deworming", "User_Phrases": "purga, worms, bulate, deworm", "Advice / Notes": "Required every 2 weeks for puppies."},
            {"Name": "Grooming", "User_Phrases": "ligua, gupit, bath, haircut, smell bad", "Advice / Notes": "Inform us if aggressive."},
        ]
        self.df_services = pd.DataFrame(services_data)

        # --- B. SAFETY DATASET (clean-data.csv) — kept for safety detection ---
        try:
            self.df_symptoms = pd.read_csv("clean-data.csv")
            cols = ['Symptom 1', 'Symptom 2', 'Symptom 3', 'Symptom 4', 'Symptom 5']
            self.df_symptoms['Symptoms_Text'] = self.df_symptoms[cols].apply(
                lambda x: ', '.join(x.dropna().astype(str)), axis=1
            )
            self.df_symptoms['is_dangerous'] = (
                self.df_symptoms['Dangerous'].str.lower().str.strip() == 'yes'
            )
            self.df_symptoms['combined_text'] = (
                self.df_symptoms['Animal'].astype(str) + " "
                + self.df_symptoms['Symptoms_Text'].astype(str)
            )
            print(f"✅ Safety dataset loaded: {len(self.df_symptoms)} rows.")
        except Exception as e:
            print(f"⚠️  Warning: clean-data.csv error ({e}). Safety detection may be limited.")
            self.df_symptoms = pd.DataFrame()

        # --- C. RAG KNOWLEDGE BASE (Animal_disease_spreadsheet) ---
        try:
            rag_candidates = [
                "Animal_disease_spreadsheet_-_Sheet1.csv",
                "Animal_disease_spreadsheet.csv",
            ]
            rag_path = next((p for p in rag_candidates if os.path.exists(p)), None)
            if rag_path:
                self.df_rag = pd.read_csv(rag_path)
                
                # IMPORTANT: Reset index to ensure Pandas ILOC perfectly matches PyTorch tensor indexing
                self.df_rag.reset_index(drop=True, inplace=True) 
                
                # Rename unnamed column to Disease
                self.df_rag = self.df_rag.rename(columns={"Unnamed: 0": "Disease"})
                # Build rich combined text for embedding (symptoms + description)
                self.df_rag['rag_text'] = self.df_rag.apply(self._build_rag_text, axis=1)
                print(f"✅ RAG knowledge base loaded: {len(self.df_rag)} diseases.")
            else:
                print("⚠️  RAG knowledge base not found. Falling back to safety dataset only.")
                self.df_rag = pd.DataFrame()
        except Exception as e:
            print(f"⚠️  RAG load error ({e}).")
            self.df_rag = pd.DataFrame()

        # --- D. EMBEDDING MODEL ---
        print("⏳ Loading embedding model...")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

        # Safety dataset embeddings
        if not self.df_symptoms.empty:
            self.symptom_embeddings = self.embedding_model.encode(
                self.df_symptoms["combined_text"].tolist(), convert_to_tensor=True
            )
            print(f"✅ Safety embeddings built: {len(self.df_symptoms)} rows.")

        # RAG knowledge base embeddings
        if not self.df_rag.empty:
            self.rag_embeddings = self.embedding_model.encode(
                self.df_rag["rag_text"].tolist(), convert_to_tensor=True
            )
            print(f"✅ RAG embeddings built: {len(self.df_rag)} diseases.")

        self.status = "Ready"
        print("✅ VetConnect AI Ready! RAG mode active.")
        print(f"   Safety DB : {len(self.df_symptoms)} rows (clean-data.csv)")
        print(f"   RAG KB    : {len(self.df_rag)} diseases (Animal_disease_spreadsheet)")

    def _build_rag_text(self, row) -> str:
        """Build searchable text from a RAG knowledge base row"""
        parts = []
        if pd.notna(row.get('Disease', '')):
            parts.append(str(row['Disease']))
        if pd.notna(row.get('Symptoms', '')):
            parts.append(str(row['Symptoms']))
        if pd.notna(row.get('Description', '')):
            # Include first 200 chars of description for context
            parts.append(str(row['Description'])[:200])
        return ' '.join(parts)

    # ──────────────────────────────────────────────────────────────────────────
    # INPUT SANITIZATION
    # ──────────────────────────────────────────────────────────────────────────
    def sanitize_input(self, text: str) -> str:
        """Remove potentially malicious input patterns"""
        text = re.sub(r'<[^>]*>', '', text)
        sql_keywords = (
            r'\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|'
            r'UNION|--|;|\/\*|\*\/|xp_|CAST\(|CONVERT\()\\b'
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
    # SAFETY LAYER
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
        """Uses GPT-4o-mini to classify symptom severity"""
        prompt = (
            "You are a veterinary triage assistant. A pet owner sent this message:\n"
            f'"{text}"\n\n'
            "Classify the severity as ONE of these three options:\n\n"
            "ACUTE   — Emergency RIGHT NOW. ONLY for: active bleeding, seizure, "
            "cannot breathe, collapse, confirmed poisoning, loss of consciousness.\n\n"
            "URGENT  — Needs vet within 24-48 hours. ONLY when owner EXPLICITLY mentions: "
            "duration of 3+ days, getting worse, wont stop, not improving, "
            "multiple serious symptoms together, or visible pain/crying.\n\n"
            "NORMAL  — Everything else. Single mild symptoms = ALWAYS normal. "
            "Scratching, licking, sneezing, mild lethargy, not eating once = NORMAL. "
            "When in doubt, default to NORMAL.\n\n"
            "STRICT RULES:\n"
            "- Default to NORMAL unless there is EXPLICIT evidence of urgency.\n"
            "- Single symptom + NO duration stated = NORMAL.\n"
            "- Only classify URGENT if owner explicitly states duration or worsening.\n"
            "- Tagalog: maliksi/aktibo = active (normal), matamlay = lethargic, "
            "hindi kumakain = not eating, nagsusuka = vomiting.\n\n"
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
        """Returns (tier, message) where tier is 'acute', 'urgent', or 'ok'."""
        text_lower = text.lower()

        # Layer 1 — undeniable acute keywords
        if any(w in text_lower for w in self._undeniable_acute):
            return (
                "acute",
                "🚨 EMERGENCY ALERT: Critical symptoms detected. "
                "Do not wait — bring your pet to the clinic IMMEDIATELY "
                "or contact an emergency veterinarian right away. "
                "Time is critical for conditions involving bleeding, seizures, "
                "breathing difficulty, collapse, or poisoning."
            )

        # Layer 2 — LLM severity assessment
        tier = self.assess_severity(text)
        if tier == "acute":
            return (
                "acute",
                "🚨 EMERGENCY ALERT: Based on the symptoms described, your pet needs immediate veterinary attention. "
                "Please bring them to the clinic right away or contact an emergency veterinarian. "
                "Do not wait — this situation requires urgent care."
            )
        elif tier == "urgent":
            return ("urgent", None)
        else:
            return ("ok", "")

    # ──────────────────────────────────────────────────────────────────────────
    # RAG — Retrieval-Augmented Generation
    # ──────────────────────────────────────────────────────────────────────────
    def retrieve_rag_context(self, query: str, animal: str = None, top_k: int = RAG_TOP_K) -> List[Dict]:
        """
        Retrieve top-K most relevant disease records from the RAG knowledge base.
        Includes Metadata Filtering by animal species to prevent cross-species hallucinations.
        """
        if self.df_rag.empty or self.rag_embeddings is None:
            return []

        # ── Metadata Filtering Step (Isolating species) ───────────────────────
        valid_indices = list(range(len(self.df_rag)))
        
        if animal:
            animal_lower = animal.lower()
            filtered_indices = []
            has_animal_col = 'Animal' in self.df_rag.columns
            
            for idx in valid_indices:
                row = self.df_rag.iloc[idx]
                is_match = False
                
                if has_animal_col and pd.notna(row['Animal']):
                    if animal_lower in str(row['Animal']).lower():
                        is_match = True
                else:
                    # Fallback: Check if animal name is in Disease or Description
                    text_to_check = str(row.get('Disease', '')) + " " + str(row.get('Description', ''))
                    if animal_lower in text_to_check.lower():
                        is_match = True
                        
                if is_match:
                    filtered_indices.append(idx)
                    
            # Only apply filter if we found matches (fallback to all if filter is too strict/dataset missing labels)
            if filtered_indices:
                valid_indices = filtered_indices
                print(f"[RAG] Metadata filter applied: {len(valid_indices)} records found for '{animal}'")
            else:
                print(f"[RAG] Metadata filter found no exact matches for '{animal}', searching entire DB.")

        # Subset the embeddings tensor based on filtered indices
        filtered_embeddings = self.rag_embeddings[valid_indices]

        # ── Keyword Extraction Step ───────────────────────────────────────────
        # Extract clinical symptom keywords BEFORE embedding search
        extracted = self.extract_symptoms_from_narrative(query, animal=animal)
        search_query = extracted if extracted and extracted != query else query
        print(f"[RAG] Search query after extraction: '{search_query[:60]}'")

        query_embedding = self.embedding_model.encode(search_query, convert_to_tensor=True)
        
        # Calculate Cosine Similarity ONLY against the filtered embeddings
        scores = util.cos_sim(query_embedding, filtered_embeddings)[0]

        # Get top-K indices sorted by score
        top_local_indices = scores.argsort(descending=True)[:top_k].tolist()

        results = []
        for local_idx in top_local_indices:
            score = scores[local_idx].item()
            if score < 0.2:  # Skip very irrelevant results
                continue
                
            # Map the local tensor index back to the original dataframe index
            original_idx = valid_indices[local_idx]
            row = self.df_rag.iloc[original_idx]
            
            results.append({
                "disease": str(row.get("Disease", "Unknown")),
                "symptoms": str(row.get("Symptoms", "")),
                "description": str(row.get("Description", ""))[:300],
                "recognition": str(row.get("Recognition", ""))[:200],
                "treatment": str(row.get("Treatment", ""))[:200],
                "advice": str(row.get("Advice/ Prevention", ""))[:200],
                "similar_conditions": str(row.get("Similar Conditions", "")),
                "score": round(score, 4),
            })

        print(f"[RAG] Retrieved {len(results)} relevant records for query: '{query[:50]}'")
        for r in results[:3]:
            print(f"  → {r['disease']} (score: {r['score']})")

        return results

    def build_rag_prompt(
        self,
        query: str,
        rag_results: List[Dict],
        known_animal: str = None,
        is_urgent: bool = False
    ) -> str:
        """
        Build a GPT prompt using retrieved RAG context.
        GPT reasons over multiple retrieved records instead of a single match.
        """
        subject = known_animal if known_animal else "the pet"

        if not rag_results:
            # No RAG results — safe fallback
            urgency_note = (
                f"Recommend booking a vet visit within 24 hours through this chat. "
                f"End with: 'If {subject} starts struggling to breathe, shows pale or blue gums, "
                f"or collapses, please go to an emergency clinic immediately.'"
                if is_urgent else
                "Recommend proceeding with a consultation booking through this chat."
            )
            return (
                f"The owner has a {subject} and reports: {query}. "
                f"No specific matching condition was found in our veterinary knowledge base. "
                f"Write a 2-3 sentence professional response that acknowledges the symptoms, "
                f"{urgency_note} "
                f"Do NOT suggest any specific condition, drug, or treatment. "
                "End with 'Only a licensed veterinarian can confirm the exact cause.'"
            )

        # Build context block from retrieved records
        context_lines = []
        for i, r in enumerate(rag_results, 1):
            context_lines.append(
                f"[Record {i}] Disease: {r['disease']}\n"
                f"  Symptoms: {r['symptoms']}\n"
                f"  Description: {r['description']}\n"
                f"  Recognition: {r['recognition']}\n"
                f"  Treatment context: {r['treatment']}\n"
                f"  Prevention/Advice: {r['advice']}"
            )
        context_block = "\n\n".join(context_lines)

        urgency_instruction = ""
        if is_urgent:
            urgency_instruction = (
                f"\n4. Recommend booking a vet visit within 24 hours through this chat.\n"
                f"5. End with: 'If {subject} starts struggling to breathe, shows pale or blue gums, "
                f"or collapses, please go to an emergency clinic immediately.'"
            )

        return (
            f"You are VetBot for VetConnect Veterinary Clinic.\n\n"
            f"The owner has a {subject} and reports: \"{query}\"\n\n"
            f"Below are the most relevant records from our veterinary knowledge base "
            f"(retrieved by semantic search — sorted by relevance):\n\n"
            f"{context_block}\n\n"
            f"INSTRUCTIONS:\n"
            f"1. Use ONLY the information above to inform your response. "
            f"Do NOT add conditions, drugs, dosages, or information not present in these records.\n"
            f"2. You may reference the most relevant condition(s) from the records above, "
            f"but NEVER state a diagnosis as fact. Use 'Possible causes include' or 'This may be related to'.\n"
            f"3. Write a 2-3 sentence empathetic, professional response for a {subject} owner.\n"
            f"{urgency_instruction}\n"
            f"Always end with: 'Only a licensed veterinarian can confirm the exact cause.'\n"
            f"Only refer to the {subject}. Never name another species."
        )

    # ──────────────────────────────────────────────────────────────────────────
    # SAFETY DATASET MATCHING (kept for is_dangerous check)
    # ──────────────────────────────────────────────────────────────────────────
    def find_best_match(self, query: str, match_type: str = "symptoms") -> Tuple[Optional[Dict], float]:
        """Find best matching entry in safety symptom database"""
        if self.df_symptoms.empty or self.symptom_embeddings is None:
            return None, 0.0

        query_embedding = self.embedding_model.encode(query, convert_to_tensor=True)
        scores = util.cos_sim(query_embedding, self.symptom_embeddings)[0]
        best_idx = scores.argmax().item()
        best_score = scores[best_idx].item()

        return self.df_symptoms.iloc[best_idx].to_dict(), best_score

    def is_match_dangerous(self, match: Optional[Dict]) -> bool:
        """Check if a safety dataset match is flagged as dangerous"""
        if match is None:
            return False
        return match.get('is_dangerous', False)

    # ──────────────────────────────────────────────────────────────────────────
    # SYMPTOM EXTRACTION (for narrative inputs)
    # ──────────────────────────────────────────────────────────────────────────
    def extract_symptoms_from_narrative(self, text: str, animal: str = None) -> str:
        """Convert behavioral/narrative description to medical symptom terms"""
        animal_note = f" for a {animal}" if animal else ""
        prompt = f"""You are a veterinary assistant extracting medical symptoms from a pet owner's description{animal_note}.

Owner's description: "{text}"

Convert behavioral observations into clinical veterinary symptom terms.
Return ONLY the clinical symptom names, comma-separated. No explanations.

Clinical symptoms:"""
        try:
            result = self.ask_llm_direct(prompt).strip()
            result = result.replace('"', '').replace("'", '').strip('.,;:')
            print(f"[SYMPTOM EXTRACTION] '{text[:50]}' → '{result[:50]}'")
            return result
        except Exception as e:
            print(f"[SYMPTOM EXTRACTION ERROR] {e}")
            return text

    # ──────────────────────────────────────────────────────────────────────────
    # COMPLAINT SUMMARIZER
    # ──────────────────────────────────────────────────────────────────────────
    def summarize_complaint(self, raw_reason: str) -> str:
        """Converts raw symptom description into a concise medical complaint label"""
        prompt = (
            f'You are a veterinary receptionist summarizing a pet owner\'s complaint.\n'
            f'Owner\'s description: "{raw_reason}"\n\n'
            f'Rules:\n'
            f'1. Return ONLY a short medical complaint label of 3–6 words.\n'
            f'2. Use Title Case.\n'
            f'3. Be specific but concise.\n'
            f'4. Do NOT include pet names, owner names, or filler words.\n'
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
    # BREED VALIDATION
    # ──────────────────────────────────────────────────────────────────────────
    def validate_breed_for_species(self, breed: str, species: str) -> bool:
        """Validate that a breed matches the animal species"""
        if species not in self.BREED_WHITELIST:
            return True
        whitelist = self.BREED_WHITELIST[species]
        breed_lower = breed.lower().strip()
        return any(w in breed_lower or breed_lower in w for w in whitelist)

    # ──────────────────────────────────────────────────────────────────────────
    # LLM CALLS
    # ──────────────────────────────────────────────────────────────────────────
    def _enforce_rate_limit(self):
        elapsed = time.time() - self.last_llm_call
        if elapsed < RATE_LIMIT_SECONDS:
            time.sleep(RATE_LIMIT_SECONDS - elapsed)
        self.last_llm_call = time.time()

    def ask_llm(self, user_prompt: str) -> str:
        """Call LLM with system instruction"""
        self._enforce_rate_limit()
        return self.ask_llm_direct_with_system(user_prompt, self.system_instruction)

    def ask_llm_direct(self, user_prompt: str) -> str:
        """Direct LLM call without system instruction (for internal tasks)"""
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
    # ENTITY EXTRACTION
    # ──────────────────────────────────────────────────────────────────────────
    def extract_entity_with_ai(self, user_input: str, entity_type: str, exclude: str = None) -> str:
        """Extract specific entities from user input with Tagalog support"""
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
            f'2. If a correction is present, extract the corrected value.\n'
            f'3. If no valid {entity_type} found, return "None".\n'
            f'4. Remove punctuation. Use Title Case.{exclude_note}{tagalog_note}\n'
            f'Output:'
        )
        raw = self.ask_llm_direct(prompt).strip().replace('"', '').replace("'", "")
        return raw.title()

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