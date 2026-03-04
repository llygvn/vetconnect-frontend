"""
VetConnect AI Evaluation System - FIXED VERSION
================================================
Run this instead of the original evaluate_vetbrain.py
"""

import pandas as pd
import json
from datetime import datetime
from vetbrain import VetBrain
from typing import List, Dict, Tuple
import time

class VetBrainEvaluator:
    def __init__(self):
        self.brain = VetBrain()
        self.brain.load_data()
        self.results = {
            "safety_tests": [],
            "entity_extraction_tests": [],
            "threshold_tests": [],
            "response_quality_tests": [],
            "summary": {}
        }
        
    def run_all_tests(self):
        """Run complete evaluation suite"""
        print("=" * 70)
        print("VETCONNECT AI EVALUATION SYSTEM")
        print("=" * 70)
        print(f"Model: GPT-4o-mini")
        print(f"Similarity Threshold: 0.3")
        print(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 70)
        print()
        
        self.test_safety_detection()
        self.test_entity_extraction()
        self.test_similarity_thresholds()
        self.test_response_quality()
        self.generate_summary()
        
        json_file, excel_file = self.save_results()
        
        print("\n" + "=" * 70)
        print("EVALUATION COMPLETE!")
        print("=" * 70)
        print(f"✅ Results saved to: {json_file}")
        print(f"✅ Report saved to: {excel_file}")
        
    def test_safety_detection(self):
        """Test 1: Emergency and Safety Detection"""
        print("\n[TEST 1] SAFETY DETECTION")
        print("-" * 70)
        
        test_cases = [
            {"input": "my dog is bleeding from the mouth and can't breathe", "expected_safety": "acute", "description": "Critical emergency - bleeding + breathing difficulty"},
            {"input": "my cat is having seizures and won't stop shaking", "expected_safety": "acute", "description": "Critical emergency - seizures"},
            {"input": "ang aso ko ay walang malay at hindi gumagalaw", "expected_safety": "acute", "description": "Critical emergency - unconscious (Tagalog)"},
            {"input": "my puppy ate rat poison 30 minutes ago", "expected_safety": "acute", "description": "Critical emergency - poisoning"},
            {"input": "my dog has been vomiting for 3 days and won't eat", "expected_safety": "urgent", "description": "Urgent - persistent vomiting"},
            {"input": "my cat has diarrhea with blood for 2 days", "expected_safety": "urgent", "description": "Urgent - bloody diarrhea"},
            {"input": "my dog needs vaccination", "expected_safety": "ok", "description": "Routine - vaccination"},
            {"input": "my cat is scratching a lot, might be fleas", "expected_safety": "ok", "description": "Routine - possible fleas"},
            {"input": "my rabbit needs grooming", "expected_safety": "ok", "description": "Routine - grooming"}
        ]
        
        for i, test in enumerate(test_cases, 1):
            print(f"\nTest 1.{i}: {test['description']}")
            print(f"Input: '{test['input']}'")
            
            try:
                result = self.brain.check_safety(test['input'])
                
                # FIXED: Handle different return types
                if result is None:
                    tier, msg = "ERROR", "Function returned None"
                elif isinstance(result, tuple) and len(result) >= 2:
                    tier, msg = result[0], result[1]
                else:
                    tier, msg = str(result) if result else "ERROR", "Unexpected return format"
                
                passed = (tier == test['expected_safety'])
                
                self.results["safety_tests"].append({
                    "test_id": f"SAFETY-{i}",
                    "description": test['description'],
                    "input": test['input'],
                    "expected": test['expected_safety'],
                    "actual": tier,
                    "passed": passed,
                    "response": msg[:100] + "..." if len(str(msg)) > 100 else str(msg)
                })
                
                status = "✅ PASS" if passed else "❌ FAIL"
                print(f"Expected: {test['expected_safety']} | Actual: {tier} | {status}")
                time.sleep(1)
                
            except Exception as e:
                print(f"❌ ERROR: {e}")
                self.results["safety_tests"].append({
                    "test_id": f"SAFETY-{i}", "description": test['description'], "input": test['input'],
                    "expected": test['expected_safety'], "actual": "ERROR", "passed": False, "response": str(e)
                })
        
        passed = sum(1 for r in self.results["safety_tests"] if r["passed"])
        total = len(self.results["safety_tests"])
        print(f"\n{'='*70}\nSafety Detection Pass Rate: {passed}/{total} ({passed/total*100:.1f}%)\n{'='*70}")
    
    def test_entity_extraction(self):
        """Test 2: Entity Extraction Accuracy"""
        print("\n\n[TEST 2] ENTITY EXTRACTION")
        print("-" * 70)
        
        test_cases = [
            {"input": "my dog needs a checkup", "entity_type": "animal", "expected": "Dog", "description": "Simple animal - dog"},
            {"input": "ang aso ko ay may sakit", "entity_type": "animal", "expected": "Dog", "description": "Tagalog animal - aso (dog)"},
            {"input": "my pusa is not eating", "entity_type": "animal", "expected": "Cat", "description": "Tagalog animal - pusa (cat)"},
            {"input": "my aspin needs vaccination", "entity_type": "animal", "expected": "Dog", "description": "Filipino breed name - aspin"},
            {"input": "my golden retriever is limping", "entity_type": "breed", "expected": "Golden Retriever", "description": "Dog breed - Golden Retriever"},
            {"input": "my persian cat is sneezing", "entity_type": "breed", "expected": "Persian", "description": "Cat breed - Persian"},
            {"input": "Max is vomiting", "entity_type": "pet name", "expected": "Max", "description": "Simple pet name"},
            {"input": "My dog's name is Buddy", "entity_type": "pet name", "expected": "Buddy", "description": "Name with context"}
        ]
        
        for i, test in enumerate(test_cases, 1):
            print(f"\nTest 2.{i}: {test['description']}")
            print(f"Input: '{test['input']}'")
            
            try:
                extracted = self.brain.extract_entity_with_ai(test['input'], test['entity_type']).strip()
                passed = (extracted.lower() == test['expected'].lower())
                
                self.results["entity_extraction_tests"].append({
                    "test_id": f"ENTITY-{i}", "description": test['description'], "input": test['input'],
                    "entity_type": test['entity_type'], "expected": test['expected'], "actual": extracted, "passed": passed
                })
                
                status = "✅ PASS" if passed else "❌ FAIL"
                print(f"Expected: '{test['expected']}' | Actual: '{extracted}' | {status}")
                time.sleep(1)
                
            except Exception as e:
                print(f"❌ ERROR: {e}")
                self.results["entity_extraction_tests"].append({
                    "test_id": f"ENTITY-{i}", "description": test['description'], "input": test['input'],
                    "entity_type": test['entity_type'], "expected": test['expected'], "actual": "ERROR", "passed": False
                })
        
        passed = sum(1 for r in self.results["entity_extraction_tests"] if r["passed"])
        total = len(self.results["entity_extraction_tests"])
        print(f"\n{'='*70}\nEntity Extraction Pass Rate: {passed}/{total} ({passed/total*100:.1f}%)\n{'='*70}")
    
    def test_similarity_thresholds(self):
        """Test 3: Similarity Threshold Analysis"""
        print("\n\n[TEST 3] SIMILARITY THRESHOLD ANALYSIS")
        print("-" * 70)
        
        test_cases = [
            {"query": "my dog has diarrhea and won't eat", "relevance": "high"},
            {"query": "vomiting and fever", "relevance": "high"},
            {"query": "my pet seems tired lately", "relevance": "medium"},
            {"query": "feeling under the weather", "relevance": "low"},
            {"query": "what's the weather today", "relevance": "none"},
            {"query": "tell me a joke", "relevance": "none"}
        ]
        
        original_threshold = getattr(self.brain, 'SIMILARITY_THRESHOLD', 0.3)
        
        for threshold in [0.3, 0.5, 0.7, 0.9]:
            print(f"\nTesting with threshold: {threshold}\n" + "-" * 70)
            if hasattr(self.brain, 'SIMILARITY_THRESHOLD'):
                self.brain.SIMILARITY_THRESHOLD = threshold
            
            for test in test_cases:
                try:
                    match, score = self.brain.find_best_match(test['query'], 'symptoms')
                    accepted = (score >= threshold)
                    self.results["threshold_tests"].append({
                        "threshold": threshold, "query": test['query'], "relevance": test['relevance'],
                        "similarity_score": score, "accepted": accepted, "match_found": match is not None
                    })
                    print(f"  '{test['query'][:40]}...' - Score: {score:.3f} - {'✅ Accepted' if accepted else '❌ Rejected'}")
                except Exception as e:
                    print(f"  ERROR: {e}")
        
        if hasattr(self.brain, 'SIMILARITY_THRESHOLD'):
            self.brain.SIMILARITY_THRESHOLD = original_threshold
        
        print(f"\n{'='*70}\nThreshold analysis complete.\n{'='*70}")
    
    def test_response_quality(self):
        """Test 4: Response Quality"""
        print("\n\n[TEST 4] RESPONSE QUALITY")
        print("-" * 70)
        
        for i, test in enumerate([
            {"query": "my dog won't eat and seems tired", "description": "General consultation query"},
            {"query": "vaccination for puppy", "description": "Service inquiry"}
        ], 1):
            print(f"\nTest 4.{i}: {test['description']}\nQuery: '{test['query']}'")
            try:
                match, score = self.brain.find_best_match(test['query'], 'symptoms')
                self.results["response_quality_tests"].append({
                    "test_id": f"QUALITY-{i}", "query": test['query'], "description": test['description'],
                    "match_score": score, "match_found": match is not None
                })
                print(f"Match Score: {score:.3f} | Match: {'Yes' if match else 'No'}")
                time.sleep(1)
            except Exception as e:
                print(f"❌ ERROR: {e}")
                self.results["response_quality_tests"].append({"test_id": f"QUALITY-{i}", "query": test['query'], "error": str(e)})
    
    def generate_summary(self):
        """Generate summary"""
        safety_passed = sum(1 for r in self.results["safety_tests"] if r["passed"])
        safety_total = len(self.results["safety_tests"])
        entity_passed = sum(1 for r in self.results["entity_extraction_tests"] if r["passed"])
        entity_total = len(self.results["entity_extraction_tests"])
        
        self.results["summary"] = {
            "model": "GPT-4o-mini",
            "test_date": datetime.now().isoformat(),
            "safety_detection": {"passed": safety_passed, "total": safety_total, "accuracy": f"{safety_passed/safety_total*100:.1f}%" if safety_total > 0 else "N/A"},
            "entity_extraction": {"passed": entity_passed, "total": entity_total, "accuracy": f"{entity_passed/entity_total*100:.1f}%" if entity_total > 0 else "N/A"},
            "threshold_tests_count": len(self.results["threshold_tests"]),
            "response_quality_tests_count": len(self.results["response_quality_tests"]),
            "overall_pass_rate": f"{(safety_passed + entity_passed) / (safety_total + entity_total) * 100:.1f}%" if (safety_total + entity_total) > 0 else "N/A"
        }
    
    def save_results(self):
        """Save results - FIXED FOR WINDOWS"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # FIXED: No path, saves in current directory
        json_filename = f"evaluation_results_{timestamp}.json"
        excel_filename = f"evaluation_report_{timestamp}.xlsx"
        
        with open(json_filename, 'w') as f:
            json.dump(self.results, f, indent=2)
        
        with pd.ExcelWriter(excel_filename, engine='openpyxl') as writer:
            if self.results["summary"]:
                pd.DataFrame({
                    'Metric': ['Model', 'Test Date', 'Safety Accuracy', 'Entity Accuracy', 'Overall Pass Rate'],
                    'Value': [
                        self.results["summary"].get("model", "N/A"),
                        self.results["summary"].get("test_date", "N/A"),
                        self.results["summary"].get("safety_detection", {}).get("accuracy", "N/A"),
                        self.results["summary"].get("entity_extraction", {}).get("accuracy", "N/A"),
                        self.results["summary"].get("overall_pass_rate", "N/A")
                    ]
                }).to_excel(writer, sheet_name='Summary', index=False)
            
            if self.results["safety_tests"]:
                pd.DataFrame(self.results["safety_tests"]).to_excel(writer, sheet_name='Safety Tests', index=False)
            if self.results["entity_extraction_tests"]:
                pd.DataFrame(self.results["entity_extraction_tests"]).to_excel(writer, sheet_name='Entity Extraction', index=False)
            if self.results["threshold_tests"]:
                pd.DataFrame(self.results["threshold_tests"]).to_excel(writer, sheet_name='Threshold Analysis', index=False)
            if self.results["response_quality_tests"]:
                pd.DataFrame(self.results["response_quality_tests"]).to_excel(writer, sheet_name='Response Quality', index=False)
        
        return json_filename, excel_filename


if __name__ == "__main__":
    print("🚀 VetConnect AI Evaluation - FIXED VERSION")
    print("📁 Files will save in current directory\n")
    evaluator = VetBrainEvaluator()
    evaluator.run_all_tests()
    print("\n✅ Done! Check your folder for the Excel and JSON files.")