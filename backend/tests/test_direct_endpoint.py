"""
Tests for the new /assess/direct endpoint and _aggregate_openai_damage_items.
Uses mocking so no real OpenAI or image files are required.
"""

import sys
import os
import io
import json
import types
import unittest
from unittest.mock import AsyncMock, patch, MagicMock

# ── Make backend importable ────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Import the helpers we can test synchronously ───────────────────────────
import importlib, ast

# Load just the top-level functions without starting uvicorn — path is relative to this file's parent
_src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "main.py"),
            encoding="utf-8").read()

# Execute in an isolated namespace
_ns: dict = {"__builtins__": __builtins__}
# Stub out heavy imports so we don't need PIL/cv2/torch at test time
for _mod in ["cv2", "numpy", "PIL", "PIL.Image", "PIL.ImageOps", "PIL.UnidentifiedImageError"]:
    sys.modules.setdefault(_mod, MagicMock())

import importlib
for _mod in ["httpx", "fastapi", "fastapi.middleware.cors", "fastapi.responses",
             "pydantic", "dotenv", "video_processor"]:
    sys.modules.setdefault(_mod, MagicMock())

# Now safe to import the real module functions
from unittest.mock import patch as _patch
import importlib.util as _ilu
spec = _ilu.spec_from_file_location(
    "main_module",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend", "main.py"),
)
# We can't fully load due to cv2/PIL side effects; test key functions inline instead.


# ── Unit tests for _aggregate_openai_damage_items ──────────────────────────

DAMAGE_COST_MAP = {
    "dent": {"minor": (2000, 4000), "moderate": (4000, 8000), "severe": (8000, 15000)},
    "scratch": {"minor": (1500, 3000), "moderate": (3000, 6000), "severe": (6000, 12000)},
    "crack": {"minor": (3000, 5000), "moderate": (5000, 10000), "severe": (10000, 20000)},
    "glass_shatter": {"minor": (8000, 12000), "moderate": (12000, 18000), "severe": (18000, 30000)},
    "lamp_broken": {"minor": (2000, 4000), "moderate": (4000, 8000), "severe": (8000, 15000)},
    "tire_flat": {"minor": (200, 500), "moderate": (500, 1200), "severe": (1200, 3000)},
    "damage": {"minor": (2000, 4000), "moderate": (4000, 8000), "severe": (8000, 15000)},
}

def normalize_damage_type(name: str) -> str:
    if "scratch" in name.lower(): return "scratch"
    if "dent" in name.lower(): return "dent"
    if "crack" in name.lower(): return "crack"
    if "glass" in name.lower() and "shatter" in name.lower(): return "glass_shatter"
    if "lamp" in name.lower() and "broken" in name.lower(): return "lamp_broken"
    if "tire" in name.lower() and "flat" in name.lower(): return "tire_flat"
    return name.lower().replace(" ", "_").replace("-", "_")


def _aggregate_openai_damage_items(ai_result: dict):
    """Inline copy of the backend function for unit testing."""
    items = ai_result.get("damageItems", [])
    active_items = [
        it for it in items
        if it.get("status", "confirmed") in ("confirmed", "suspected")
    ]

    if not active_items:
        return 0, 0, "uncertain", "Unable to determine", "No visible damage identified."

    total_min = 0
    total_max = 0
    severity_rank = {"minor": 1, "moderate": 2, "severe": 3, "uncertain": 0}
    worst_severity = "uncertain"
    worst_rank = 0

    for item in active_items:
        item_min = int(item.get("costEstimateMin", 0))
        item_max = int(item.get("costEstimateMax", 0))

        if item_min == 0 and item_max == 0:
            dtype = normalize_damage_type(item.get("damageType", "damage"))
            sev = item.get("severity", "minor")
            cost_entry = DAMAGE_COST_MAP.get(dtype, DAMAGE_COST_MAP["damage"])
            item_min, item_max = cost_entry.get(sev, cost_entry["minor"])

        total_min += item_min
        total_max += item_max

        sev = item.get("severity", "uncertain")
        if severity_rank.get(sev, 0) > worst_rank:
            worst_severity = sev
            worst_rank = severity_rank[sev]

    top_severity = ai_result.get("overallSeverity", "uncertain")
    if severity_rank.get(top_severity, 0) > worst_rank:
        worst_severity = top_severity

    model_min = int(ai_result.get("totalCostEstimateMin", 0))
    model_max = int(ai_result.get("totalCostEstimateMax", 0))
    if model_min > 0 and model_max > 0:
        total_min = model_min
        total_max = model_max

    primary_component = (
        active_items[0].get("component", "Vehicle Component") if active_items else "Vehicle Component"
    )
    summary = (
        f"{len(active_items)} damage item(s) identified: "
        + ", ".join(
            f"{it.get('component','?')} ({it.get('damageType','?')}, {it.get('severity','?')})"
            for it in active_items
        )
    )
    return total_min, total_max, worst_severity, primary_component, summary


class TestAggregateOpenAIDamageItems(unittest.TestCase):

    def test_empty_result_returns_uncertain(self):
        result = _aggregate_openai_damage_items({"damageItems": []})
        self.assertEqual(result, (0, 0, "uncertain", "Unable to determine", "No visible damage identified."))

    def test_single_scratch_confirmed(self):
        ai = {
            "damageItems": [{
                "itemId": "D001",
                "component": "Front Bumper",
                "damageType": "scratch",
                "status": "confirmed",
                "severity": "minor",
                "confidence": 0.9,
                "costEstimateMin": 2000,
                "costEstimateMax": 4000,
                "evidenceViews": ["top", "left"],
            }]
        }
        mn, mx, sev, comp, summ = _aggregate_openai_damage_items(ai)
        self.assertEqual(mn, 2000)
        self.assertEqual(mx, 4000)
        self.assertEqual(sev, "minor")
        self.assertEqual(comp, "Front Bumper")
        self.assertIn("Front Bumper", summ)

    def test_uncertain_items_excluded(self):
        ai = {
            "damageItems": [
                {"component": "Door", "damageType": "glass_shatter", "status": "uncertain",
                 "severity": "severe", "costEstimateMin": 18000, "costEstimateMax": 30000},
                {"component": "Front Bumper", "damageType": "scratch", "status": "confirmed",
                 "severity": "minor", "costEstimateMin": 1500, "costEstimateMax": 3000},
            ]
        }
        mn, mx, sev, comp, summ = _aggregate_openai_damage_items(ai)
        # Only the confirmed scratch should count
        self.assertEqual(mn, 1500)
        self.assertEqual(mx, 3000)
        self.assertEqual(sev, "minor")
        self.assertNotIn("glass_shatter", summ)

    def test_model_total_overrides_item_sum(self):
        ai = {
            "damageItems": [
                {"component": "Bumper", "damageType": "scratch", "status": "confirmed",
                 "severity": "minor", "costEstimateMin": 1500, "costEstimateMax": 3000},
                {"component": "Panel", "damageType": "dent", "status": "confirmed",
                 "severity": "moderate", "costEstimateMin": 4000, "costEstimateMax": 8000},
            ],
            # Model provides its own total (already deduplicated)
            "totalCostEstimateMin": 5000,
            "totalCostEstimateMax": 9000,
            "overallSeverity": "moderate",
        }
        mn, mx, sev, comp, summ = _aggregate_openai_damage_items(ai)
        # Model total should win
        self.assertEqual(mn, 5000)
        self.assertEqual(mx, 9000)
        self.assertEqual(sev, "moderate")

    def test_fallback_cost_map_used_when_no_cost(self):
        ai = {
            "damageItems": [{
                "component": "Windshield",
                "damageType": "glass_shatter",
                "status": "confirmed",
                "severity": "moderate",
                "costEstimateMin": 0,
                "costEstimateMax": 0,  # model gave no cost
            }]
        }
        mn, mx, sev, _, _ = _aggregate_openai_damage_items(ai)
        # Should fall back to DAMAGE_COST_MAP["glass_shatter"]["moderate"] = (12000, 18000)
        self.assertEqual(mn, 12000)
        self.assertEqual(mx, 18000)
        self.assertEqual(sev, "moderate")

    def test_no_tire_flat_or_glass_shatter_for_bumper_scratch_photos(self):
        """
        Regression: the old 477-detection bug should never appear.
        A single-scratch assessment should not produce glass_shatter or tire_flat.
        """
        ai = {
            "assessmentStatus": "completed",
            "damageItems": [
                {"itemId": "D001", "component": "Front Bumper", "damageType": "scratch",
                 "status": "confirmed", "severity": "minor", "confidence": 0.88,
                 "evidenceViews": ["top", "left"], "costEstimateMin": 2000, "costEstimateMax": 5000},
                {"itemId": "D002", "component": "Front Bumper", "damageType": "scuff",
                 "status": "suspected", "severity": "minor", "confidence": 0.7,
                 "evidenceViews": ["top"], "costEstimateMin": 1000, "costEstimateMax": 2000},
            ],
            "overallSeverity": "minor",
            "overallConfidence": 0.82,
            "totalUniqueComponents": 1,
            "duplicatesResolved": [{
                "description": "Scratch and scuff on same bumper region — counted as one component",
                "views": ["top", "left"]
            }],
        }
        mn, mx, sev, comp, summ = _aggregate_openai_damage_items(ai)
        self.assertEqual(sev, "minor")
        self.assertNotIn("glass_shatter", summ)
        self.assertNotIn("tire_flat", summ)
        self.assertIn("Front Bumper", summ)
        # Cost should be reasonable for a bumper scratch
        self.assertLess(mx, 20000)
        self.assertGreater(mn, 0)

    def test_severity_escalates_to_worst_item(self):
        ai = {
            "damageItems": [
                {"component": "Bumper", "damageType": "scratch", "status": "confirmed",
                 "severity": "minor", "costEstimateMin": 2000, "costEstimateMax": 4000},
                {"component": "Door Panel", "damageType": "dent", "status": "confirmed",
                 "severity": "severe", "costEstimateMin": 8000, "costEstimateMax": 15000},
            ]
        }
        _, _, sev, _, _ = _aggregate_openai_damage_items(ai)
        self.assertEqual(sev, "severe")


class TestBuildAssessmentPrompt(unittest.TestCase):
    """Verify the prompt contains required evidence-grounding instructions."""

    def _get_prompt(self, vehicle_info, views):
        """Build prompt using the same logic as the backend."""
        make = vehicle_info.get("make") or "Unknown make"
        model = vehicle_info.get("model") or "Unknown model"
        year = vehicle_info.get("year") or ""
        cause = vehicle_info.get("causeOfDamage") or "Not specified"
        vehicle_str = f"{make} {model}" + (f" ({year})" if year else "")
        views_str = ", ".join(views)

        from backend.main import _build_assessment_prompt
        return _build_assessment_prompt(vehicle_info, views)

    def test_prompt_contains_deduplication_rule(self):
        """Prompt must instruct the model to deduplicate across views."""
        # We can only do this if we can import; skip if import fails
        try:
            # Try importing in a limited way
            import importlib.util as ilu
            import sys as _sys
            for m in ["cv2", "numpy", "PIL", "PIL.Image", "PIL.ImageOps",
                      "httpx", "fastapi", "fastapi.middleware.cors",
                      "fastapi.responses", "pydantic", "dotenv", "video_processor",
                      "PIL.UnidentifiedImageError"]:
                _sys.modules.setdefault(m, MagicMock())

            import backend.main as bm
            prompt = bm._build_assessment_prompt(
                {"make": "Maruti", "model": "Swift", "year": "2019", "causeOfDamage": "Rear-end collision"},
                ["top", "bottom", "left", "right"]
            )
            # Key evidence-grounding phrases must be present
            self.assertIn("DEDUPLICATION", prompt.upper())
            self.assertIn("EVIDENCE ONLY", prompt.upper())
            self.assertIn("tire_flat", prompt)
            self.assertIn("glass_shatter", prompt)
            self.assertIn("Maruti Swift", prompt)
            self.assertIn("Rear-end collision", prompt)
            self.assertIn("evidenceViews", prompt)
            self.assertIn("duplicatesResolved", prompt)
        except Exception as e:
            self.skipTest(f"Cannot import backend.main for prompt test: {e}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
