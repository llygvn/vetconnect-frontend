"""
VetConnect AI Evaluation System — Comprehensive Metrics Edition
=============================================================
Evaluates:
  1. Safety Detection        — classification (Accuracy, Precision, Recall, F1-Score)
  2. Entity Extraction       — animal, breed, pet name (Tagalog support)
  3. RAG Retrieval Quality   — relevance and confidence (MSE on scores)
  4. RAG Response Quality    — groundedness and accuracy of GPT responses

Run: python evaluate_vetbrain.py
"""

import os
import pandas as pd
import json
import numpy as np
from datetime import datetime
from sklearn.metrics import precision_recall_fscore_support, accuracy_score, mean_squared_error
from vetbrain import VetBrain
import time

class VetBrainEvaluator:
    def __init__(self):
        self.brain = VetBrain()
        self.brain.load_data()
        self.results = {
            "safety_tests": [],
            "entity_extraction_tests": [],
            "rag_retrieval_tests": [],
            "rag_response_tests": [],
            "quantitative_metrics": {},
            "summary": {}
        }

    def run_all_tests(self):
        print("=" * 70)
        print("VETCONNECT AI EVALUATION SYSTEM — COMPREHENSIVE METRICS EDITION")
        print("=" * 70)
        print(f"Model     : GPT-4o-mini")
        print(f"Mode      : RAG (Retrieval-Augmented Generation)")
        print(f"Validation: Strict Validation Sets")
        print(f"Test Date : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 70)

        self.test_safety_detection()
        self.test_entity_extraction()
        self.test_rag_retrieval()
        self.test_rag_response_quality()
        self.generate_summary()
        self.save_results()

        print("\n" + "=" * 70)
        print("EVALUATION COMPLETE!")
        print("=" * 70)

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 1: Safety Detection (Classification with F1, Precision, Recall)
    # ─────────────────────────────────────────────────────────────────────────
    def test_safety_detection(self):
        print("\n[TEST 1] SAFETY DETECTION (Validation Set)")
        print("-" * 70)

        validation_set = [
            {"input": "my dog is bleeding from the mouth and can't breathe",  "expected": "acute",  "description": "Critical — bleeding + breathing difficulty"},
            {"input": "my cat is having seizures and won't stop shaking",      "expected": "acute",  "description": "Critical — seizures"},
            {"input": "ang aso ko ay walang malay at hindi gumagalaw",         "expected": "acute",  "description": "Critical — unconscious (Tagalog)"},
            {"input": "my puppy ate rat poison 30 minutes ago",               "expected": "acute",  "description": "Critical — poisoning"},
            {"input": "my dog has been vomiting for 3 days and won't eat",    "expected": "urgent", "description": "Urgent — persistent vomiting"},
            {"input": "my cat has diarrhea with blood for 2 days",            "expected": "urgent", "description": "Urgent — bloody diarrhea"},
            {"input": "my dog needs vaccination",                              "expected": "ok",     "description": "Routine — vaccination"},
            {"input": "my cat is scratching a lot, might be fleas",           "expected": "ok",     "description": "Routine — possible fleas"},
            {"input": "my rabbit needs grooming",                             "expected": "ok",     "description": "Routine — grooming"},
        ]

        y_true = []
        y_pred = []

        for i, test in enumerate(validation_set, 1):
            print(f"\nTest 1.{i}: {test['description']}")
            print(f"Input: '{test['input']}'")
            try:
                result = self.brain.check_safety(test['input'])
                tier = result[0] if isinstance(result, tuple) else str(result)
                msg  = result[1] if isinstance(result, tuple) and len(result) > 1 else ""
                passed = (tier == test['expected'])
                
                y_true.append(test['expected'])
                y_pred.append(tier)

                self.results["safety_tests"].append({
                    "test_id": f"SAFETY-{i}",
                    "description": test['description'],
                    "input": test['input'],
                    "expected": test['expected'],
                    "actual": tier,
                    "passed": passed,
                    "response": str(msg)[:100] if msg else ""
                })
                print(f"Expected: {test['expected']} | Actual: {tier} | {'✅ PASS' if passed else '❌ FAIL'}")
                time.sleep(3)
            except Exception as e:
                print(f"❌ ERROR: {e}")
                y_true.append(test['expected'])
                y_pred.append("error")
                self.results["safety_tests"].append({
                    "test_id": f"SAFETY-{i}", "description": test['description'],
                    "input": test['input'], "expected": test['expected'],
                    "actual": "ERROR", "passed": False, "response": str(e)
                })

        # CALCULATE COMPREHENSIVE METRICS (Accuracy, Precision, Recall, F1)
        labels = ["acute", "urgent", "ok"]
        acc = accuracy_score(y_true, y_pred)
        precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, labels=labels, average='macro', zero_division=0)
        
        self.results["quantitative_metrics"]["safety_classification"] = {
            "accuracy": acc,
            "precision_macro": precision,
            "recall_macro": recall,
            "f1_score_macro": f1
        }

        print(f"\n{'='*70}\nSafety Detection Metrics:")
        print(f"Accuracy: {acc*100:.1f}% | Precision: {precision:.3f} | Recall: {recall:.3f} | F1-Score: {f1:.3f}\n{'='*70}")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 2: Entity Extraction
    # ─────────────────────────────────────────────────────────────────────────
    def test_entity_extraction(self):
        print("\n\n[TEST 2] ENTITY EXTRACTION")
        print("-" * 70)

        validation_set = [
            {"input": "my dog needs a checkup",       "entity_type": "animal",   "expected": "Dog",            "description": "Simple animal — dog"},
            {"input": "ang aso ko ay may sakit",       "entity_type": "animal",   "expected": "Dog",            "description": "Tagalog — aso (dog)"},
            {"input": "my pusa is not eating",         "entity_type": "animal",   "expected": "Cat",            "description": "Tagalog — pusa (cat)"},
            {"input": "my aspin needs vaccination",    "entity_type": "animal",   "expected": "Dog",            "description": "Filipino breed — aspin"},
            {"input": "my golden retriever is limping","entity_type": "breed",    "expected": "Golden Retriever","description": "Breed — Golden Retriever"},
            {"input": "my persian cat is sneezing",    "entity_type": "breed",    "expected": "Persian",        "description": "Breed — Persian"},
            {"input": "Max is vomiting",               "entity_type": "pet name", "expected": "Max",            "description": "Simple pet name"},
            {"input": "My dog's name is Buddy",        "entity_type": "pet name", "expected": "Buddy",          "description": "Name with context"},
        ]

        time.sleep(5)  
        for i, test in enumerate(validation_set, 1):
            print(f"\nTest 2.{i}: {test['description']}")
            print(f"Input: '{test['input']}'")
            try:
                extracted = self.brain.extract_entity_with_ai(test['input'], test['entity_type']).strip()
                passed = (extracted.lower() == test['expected'].lower())
                self.results["entity_extraction_tests"].append({
                    "test_id": f"ENTITY-{i}", "description": test['description'],
                    "input": test['input'], "entity_type": test['entity_type'],
                    "expected": test['expected'], "actual": extracted, "passed": passed
                })
                print(f"Expected: '{test['expected']}' | Actual: '{extracted}' | {'✅ PASS' if passed else '❌ FAIL'}")
                time.sleep(4)
            except Exception as e:
                print(f"❌ ERROR: {e}")
                self.results["entity_extraction_tests"].append({
                    "test_id": f"ENTITY-{i}", "description": test['description'],
                    "input": test['input'], "entity_type": test['entity_type'],
                    "expected": test['expected'], "actual": "ERROR", "passed": False
                })

        passed = sum(1 for r in self.results["entity_extraction_tests"] if r["passed"])
        total  = len(self.results["entity_extraction_tests"])
        print(f"\n{'='*70}\nEntity Extraction: {passed}/{total} ({passed/total*100:.1f}%)\n{'='*70}")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 3: RAG Retrieval Quality (with MSE on Confidence Scores)
    # ─────────────────────────────────────────────────────────────────────────
    def test_rag_retrieval(self):
        print("\n\n[TEST 3] RAG RETRIEVAL QUALITY")
        print("-" * 70)
        
        validation_set = [
            {"query": "my dog is limping and joints are swollen and painful", "expected_disease_keywords": ["arthritis", "joint"], "ideal_score": 0.8, "description": "Arthritis symptoms"},
            {"query": "my cat is sneezing with discharge from eyes and nose, has fever", "expected_disease_keywords": ["cat flu", "flu", "respiratory"], "ideal_score": 0.8, "description": "Cat flu symptoms"},
            {"query": "my dog has bad breath, bleeding gums, and difficulty eating", "expected_disease_keywords": ["dental", "teeth", "gum"], "ideal_score": 0.8, "description": "Dental disease symptoms"},
            {"query": "my dog is scratching a lot, hair loss and skin rashes", "expected_disease_keywords": ["dermatitis", "skin", "parasite"], "ideal_score": 0.8, "description": "Skin/dermatitis symptoms"},
            {"query": "my dog is drinking a lot of water and urinating frequently, losing weight", "expected_disease_keywords": ["diabetes", "kidney", "urinary"], "ideal_score": 0.8, "description": "Diabetes symptoms"},
            {"query": "my cat is shaking its head and scratching its ears constantly", "expected_disease_keywords": ["ear", "infection", "mite"], "ideal_score": 0.8, "description": "Ear infection symptoms"},
            {"query": "my dog has red watery eyes and eye discharge", "expected_disease_keywords": ["eye", "inflammation", "conjunctiv"], "ideal_score": 0.8, "description": "Eye problem symptoms"},
            {"query": "my dog is vomiting and has diarrhea for 2 days", "expected_disease_keywords": ["gastrointestinal", "digestive", "gastro", "parvovirus", "distemper"], "ideal_score": 0.8, "description": "GI/digestive symptoms"},
            {"query": "tell me a joke", "expected_disease_keywords": [], "ideal_score": 0.1, "description": "Off-topic query (expected low confidence)"},
            {"query": "what is the weather today", "expected_disease_keywords": [], "ideal_score": 0.1, "description": "Completely off-topic query"},
        ]

        actual_scores = []
        expected_scores = []

        for i, test in enumerate(validation_set, 1):
            print(f"\nTest 3.{i}: {test['description']}")
            print(f"Query: '{test['query']}'")

            try:
                rag_results = self.brain.retrieve_rag_context(test['query'])
                
                top_scores   = [r['score'] for r in rag_results]
                avg_score    = round(sum(top_scores) / len(top_scores), 4) if top_scores else 0
                max_score    = top_scores[0] if top_scores else 0
                
                # For MSE calculation
                actual_scores.append(max_score)
                expected_scores.append(test['ideal_score'])

                keywords = test['expected_disease_keywords']
                if keywords:
                    all_text = ' '.join(r['disease'].lower() + ' ' + r['symptoms'].lower() for r in rag_results)
                    keyword_hit = any(kw.lower() in all_text for kw in keywords)
                    passed = keyword_hit
                    relevance_note = f"Keyword match: {'✅ YES' if keyword_hit else '❌ NO'}"
                else:
                    passed = (max_score < 0.4)
                    relevance_note = f"Off-topic check: top score {'✅ LOW (<0.4)' if passed else '❌ HIGH (>=0.4)'}"

                self.results["rag_retrieval_tests"].append({
                    "test_id": f"RAG-{i}",
                    "description": test['description'],
                    "query": test['query'],
                    "expected_keywords": keywords,
                    "top_retrieved_diseases": [r['disease'] for r in rag_results[:3]],
                    "top_score": max_score,
                    "avg_score": avg_score,
                    "passed": passed,
                    "relevance_note": relevance_note
                })
                print(f"Top Score: {max_score:.4f} (Expected ~{test['ideal_score']}) | {relevance_note} | {'✅ PASS' if passed else '❌ FAIL'}")

            except Exception as e:
                print(f"❌ ERROR: {e}")
                self.results["rag_retrieval_tests"].append({
                    "test_id": f"RAG-{i}", "description": test['description'],
                    "query": test['query'], "passed": False, "error": str(e)
                })

        # Compute MSE for RAG Confidence
        mse = mean_squared_error(expected_scores, actual_scores)
        self.results["quantitative_metrics"]["rag_mse"] = mse

        passed = sum(1 for r in self.results["rag_retrieval_tests"] if r["passed"])
        total  = len(self.results["rag_retrieval_tests"])
        print(f"\n{'='*70}\nRAG Retrieval Pass Rate: {passed}/{total} ({passed/total*100:.1f}%) | Confidence Score MSE: {mse:.4f}\n{'='*70}")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 4: RAG Response Quality
    # ─────────────────────────────────────────────────────────────────────────
    def test_rag_response_quality(self):
        print("\n\n[TEST 4] RAG RESPONSE QUALITY")
        print("-" * 70)

        validation_set = [
            {
                "query": "my dog won't eat and seems very tired and lethargic",
                "animal": "Dog",
                "is_urgent": False,
                "description": "General consultation — lethargy and anorexia",
                "must_contain": ["veterinarian", "licensed"],
                "must_not_contain": ["I diagnose", "definitely has", "take this medication"]
            },
            {
                "query": "my cat has been vomiting for 3 days and losing weight",
                "animal": "Cat",
                "is_urgent": True,
                "description": "Urgent — persistent vomiting + weight loss",
                "must_contain": ["veterinarian", "24"],
                "must_not_contain": ["I diagnose", "definitely has"]
            },
            {
                "query": "my rabbit has red watery eyes and is scratching its face",
                "animal": "Rabbit",
                "is_urgent": False,
                "description": "Rabbit eye/skin issue",
                "must_contain": ["veterinarian"],
                "must_not_contain": ["I diagnose", "definitely has"]
            },
            {
                "query": "my dog is scratching constantly and has hair loss on the belly",
                "animal": "Dog",
                "is_urgent": False,
                "description": "Skin issue — possible dermatitis or parasites",
                "must_contain": ["veterinarian"],
                "must_not_contain": ["I diagnose", "definitely has"]
            },
        ]

        for i, test in enumerate(validation_set, 1):
            print(f"\nTest 4.{i}: {test['description']}")
            print(f"Query: '{test['query']}'")
            try:
                rag_results = self.brain.retrieve_rag_context(test['query'])
                prompt = self.brain.build_rag_prompt(
                    test['query'], rag_results,
                    known_animal=test['animal'],
                    is_urgent=test['is_urgent']
                )
                response = self.brain.ask_llm(prompt)

                response_lower = response.lower()
                contains_check = all(kw.lower() in response_lower for kw in test['must_contain'])
                forbidden_check = not any(kw.lower() in response_lower for kw in test['must_not_contain'])
                has_content = len(response.strip()) > 20
                passed = contains_check and forbidden_check and has_content

                self.results["rag_response_tests"].append({
                    "test_id": f"RESPONSE-{i}",
                    "description": test['description'],
                    "query": test['query'],
                    "animal": test['animal'],
                    "is_urgent": test['is_urgent'],
                    "rag_records_used": len(rag_results),
                    "top_disease_retrieved": rag_results[0]['disease'] if rag_results else "None",
                    "response_preview": response[:200],
                    "contains_required_keywords": contains_check,
                    "no_forbidden_phrases": forbidden_check,
                    "has_content": has_content,
                    "passed": passed
                })

                print(f"RAG records used : {len(rag_results)}")
                print(f"Top disease      : {rag_results[0]['disease'] if rag_results else 'None'}")
                print(f"Response preview : {response[:120]}...")
                print(f"Contains required: {'✅' if contains_check else '❌'} | No forbidden: {'✅' if forbidden_check else '❌'} | {'✅ PASS' if passed else '❌ FAIL'}")
                time.sleep(2)

            except Exception as e:
                print(f"❌ ERROR: {e}")
                self.results["rag_response_tests"].append({
                    "test_id": f"RESPONSE-{i}", "description": test['description'],
                    "query": test['query'], "passed": False, "error": str(e)
                })

        passed = sum(1 for r in self.results["rag_response_tests"] if r["passed"])
        total  = len(self.results["rag_response_tests"])
        print(f"\n{'='*70}\nRAG Response Quality: {passed}/{total} ({passed/total*100:.1f}%)\n{'='*70}")

    # ─────────────────────────────────────────────────────────────────────────
    # SUMMARY + SAVE
    # ─────────────────────────────────────────────────────────────────────────
    def generate_summary(self):
        def _rate(results):
            if not results: return 0, 0, "N/A"
            p = sum(1 for r in results if r["passed"])
            t = len(results)
            return p, t, f"{p/t*100:.1f}%"

        s_p, s_t, s_r = _rate(self.results["safety_tests"])
        e_p, e_t, e_r = _rate(self.results["entity_extraction_tests"])
        rr_p, rr_t, rr_r = _rate(self.results["rag_retrieval_tests"])
        rq_p, rq_t, rq_r = _rate(self.results["rag_response_tests"])

        total_p = s_p + e_p + rr_p + rq_p
        total_t = s_t + e_t + rr_t + rq_t

        metrics = self.results.get("quantitative_metrics", {})
        f1_score = metrics.get("safety_classification", {}).get("f1_score_macro", 0)
        mse_score = metrics.get("rag_mse", 0)

        self.results["summary"] = {
            "model": "GPT-4o-mini",
            "mode": "RAG (Retrieval-Augmented Generation)",
            "rag_knowledge_base": "Animal_disease_spreadsheet_-_Sheet1.csv",
            "safety_dataset": "clean-data.csv",
            "test_date": datetime.now().isoformat(),
            "safety_detection":    {"passed": s_p,  "total": s_t,  "accuracy": s_r},
            "entity_extraction":   {"passed": e_p,  "total": e_t,  "accuracy": e_r},
            "rag_retrieval":       {"passed": rr_p, "total": rr_t, "accuracy": rr_r},
            "rag_response_quality":{"passed": rq_p, "total": rq_t, "accuracy": rq_r},
            "overall_pass_rate":   f"{total_p/total_t*100:.1f}%" if total_t > 0 else "N/A",
            "quantitative_metrics": {
                "Safety_F1_Score": f"{f1_score:.3f}",
                "RAG_Confidence_MSE": f"{mse_score:.4f}"
            }
        }

        print("\n" + "=" * 70)
        print("RESULTS SUMMARY (WITH QUANTITATIVE METRICS)")
        print("=" * 70)
        print(f"  Safety Detection     : {s_p}/{s_t} ({s_r})")
        print(f"  Entity Extraction    : {e_p}/{e_t} ({e_r})")
        print(f"  RAG Retrieval Quality: {rr_p}/{rr_t} ({rr_r})")
        print(f"  RAG Response Quality : {rq_p}/{rq_t} ({rq_r})")
        print(f"  {'─'*40}")
        print(f"  🔥 Safety F1-Score   : {f1_score:.3f}")
        print(f"  🔥 RAG Config MSE    : {mse_score:.4f}")
        print(f"  Overall Pass Rate    : {total_p}/{total_t} ({self.results['summary']['overall_pass_rate']})")
        print("=" * 70)

    def save_results(self):
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        json_file  = f"evaluation_results_{timestamp}.json"
        excel_file = f"evaluation_report_{timestamp}.xlsx"
        
        with open(json_file, 'w') as f:
            json.dump(self.results, f, indent=2)

        with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
            # Summary sheet
            s = self.results["summary"]
            qm = s.get("quantitative_metrics", {})
            pd.DataFrame({
                'Metric': [
                    'Model', 'Mode', 'Test Date',
                    'Safety Detection Accuracy', 'Entity Extraction Accuracy',
                    'RAG Retrieval Quality', 'RAG Response Quality',
                    'Safety F1-Score (Macro)', 'RAG Confidence MSE',
                    'Overall Pass Rate'
                ],
                'Result': [
                    s.get('model'), s.get('mode'), s.get('test_date'),
                    s['safety_detection']['accuracy'],
                    s['entity_extraction']['accuracy'],
                    s['rag_retrieval']['accuracy'],
                    s['rag_response_quality']['accuracy'],
                    qm.get('Safety_F1_Score', 'N/A'),
                    qm.get('RAG_Confidence_MSE', 'N/A'),
                    s['overall_pass_rate']
                ]
            }).to_excel(writer, sheet_name='Summary', index=False)

            # Individual test sheets
            sheets = [
                ("Safety Tests",        self.results["safety_tests"]),
                ("Entity Extraction",   self.results["entity_extraction_tests"]),
                ("RAG Retrieval",       self.results["rag_retrieval_tests"]),
                ("RAG Response Quality",self.results["rag_response_tests"]),
            ]
            for sheet_name, data in sheets:
                if data:
                    pd.DataFrame(data).to_excel(writer, sheet_name=sheet_name, index=False)

        print(f"\n✅ JSON saved : {json_file}")
        print(f"✅ Excel saved: {excel_file}")

if __name__ == "__main__":
    print("🚀 VetConnect AI Evaluation — Comprehensive Edition")
    print("📁 Files will save in current directory\n")

    # Check required files
    missing = []
    if not os.path.exists("clean-data.csv"):
        missing.append("clean-data.csv")
    if not any(os.path.exists(f) for f in ["Animal_disease_spreadsheet_-_Sheet1.csv", "Animal_disease_spreadsheet.csv"]):
        missing.append("Animal_disease_spreadsheet_-_Sheet1.csv")

    if missing:
        print(f"❌ Missing files: {', '.join(missing)}")
        print("   Place them in the same folder as this script.")
        exit(1)

    evaluator = VetBrainEvaluator()
    evaluator.run_all_tests()
    print("\n✅ Done! Check your folder for the Excel and JSON files.")