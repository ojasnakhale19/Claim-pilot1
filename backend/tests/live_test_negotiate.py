"""Live integration test for /negotiate endpoint."""
import asyncio
import httpx
import sys

BASE = "http://localhost:8000"

PAYLOAD = {
    "vehicle_company": "Maruti",
    "vehicle_model": "Swift",
    "vehicle_year": "2019",
    "cause_of_damage": "Front collision with scraping on bumper",
    "damage_summary": "Front Bumper (scratch, moderate)",
    "severity": "moderate",
    "primary_component": "Front Bumper",
    "cost_min": 3000,
    "cost_max": 6000,
    "settlement_offer": 3150,
    "settlement_min": 1650,
    "settlement_max": 5100,
    "damage_items": [
        {
            "component": "Front Bumper",
            "damageType": "scratch",
            "severity": "moderate",
            "status": "confirmed",
            "recommendation": "repair",
            "costEstimateMin": 3000,
            "costEstimateMax": 6000,
            "evidenceDescription": "Linear scratches across bumper edge with paint transfer"
        }
    ],
    "overall_reasoning": "Front bumper shows moderate scratching consistent with a low-speed collision.",
    "chat_history": []
}

TURNS = [
    "Hello, can you explain this settlement offer?",
    "Can you offer more? The repair shop quoted me ₹5,500.",
    "I accept the offer.",
]


async def run():
    all_passed = True
    print("=" * 60)
    print("LIVE NEGOTIATION TEST — /negotiate endpoint")
    print("=" * 60)

    async with httpx.AsyncClient(timeout=40.0) as client:
        history = []
        current_offer = PAYLOAD["settlement_offer"]

        for i, user_msg in enumerate(TURNS):
            payload = {**PAYLOAD, "user_message": user_msg,
                       "chat_history": history,
                       "settlement_offer": current_offer}

            print(f"\n[Turn {i+1}] USER: {user_msg}")
            resp = await client.post(f"{BASE}/negotiate", json=payload)

            if resp.status_code == 503:
                print("SKIP — OpenAI key not configured on backend")
                return True
            if resp.status_code != 200:
                print(f"FAIL — HTTP {resp.status_code}: {resp.text[:300]}")
                return False

            r = resp.json()
            print(f"[Turn {i+1}] BOT : {r['message'][:200]}")
            print(f"           provider={r['provider_used']}  is_offer={r['is_offer']}  "
                  f"new_offer={r.get('new_offer')}  "
                  f"exclusion={r['exclusion_detected']}")

            # Update history and offer
            history.append({"sender": "user", "text": user_msg})
            history.append({"sender": "bot",  "text": r["message"]})
            if r.get("new_offer"):
                current_offer = r["new_offer"]

        print()
        print("=== CHECKS ===")
        checks = [
            ("provider_used == openai",
             r.get("provider_used") == "openai",
             r.get("provider_used")),
            ("Response is a non-empty string",
             len(r.get("message", "")) > 10,
             len(r.get("message", ""))),
            ("No exclusion detected for normal collision",
             not r["exclusion_detected"],
             r["exclusion_detected"]),
        ]

        for name, ok, detail in checks:
            sym = "PASS" if ok else "FAIL"
            print(f"  [{sym}] {name}  (got: {detail})")
            if not ok:
                all_passed = False

        print()
        print("Overall:", "ALL CHECKS PASSED" if all_passed else "SOME CHECKS FAILED")
        return all_passed


if __name__ == "__main__":
    ok = asyncio.run(run())
    sys.exit(0 if ok else 1)
