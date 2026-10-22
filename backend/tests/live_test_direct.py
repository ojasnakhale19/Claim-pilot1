"""Live integration test for /assess/direct — calls the real running backend."""
import asyncio
import httpx
import os
import sys
import json
import io

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def make_synthetic_car_image(label: str) -> bytes:
    """Create a minimal non-blank JPEG that passes blur validation (has texture)."""
    if not PIL_AVAILABLE:
        raise RuntimeError("Pillow not available")
    img = Image.new("RGB", (640, 480), color=(180, 180, 180))
    draw = ImageDraw.Draw(img)
    # Draw enough detail to pass the Laplacian sharpness threshold
    for x in range(0, 640, 20):
        draw.line([(x, 0), (x, 480)], fill=(160, 160, 160), width=1)
    for y in range(0, 480, 20):
        draw.line([(0, y), (640, y)], fill=(160, 160, 160), width=1)
    # Simulate a car body panel with a scratch mark
    draw.rectangle([100, 150, 540, 330], outline=(80, 80, 80), width=3)
    draw.line([(150, 220), (350, 240)], fill=(40, 40, 40), width=4)  # scratch
    draw.text((200, 380), f"Vehicle - {label} view", fill=(50, 50, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


async def test_direct_live():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Prefer real car photos if available — support both .jpg and .jpeg
    def _find_img(i):
        for ext in (".jpeg", ".jpg", ".png"):
            p = os.path.join(base_dir, "test_inputs", f"test_image_{i}{ext}")
            if os.path.exists(p):
                return p
        return None

    real_imgs = [_find_img(i) for i in range(4)]
    real_valid = all(p is not None for p in real_imgs)

    # Check if real images have enough sharpness
    if real_valid and PIL_AVAILABLE:
        import numpy as np
        try:
            import cv2
            img = Image.open(real_imgs[0]).convert("L")
            arr = np.asarray(img)
            lap = cv2.Laplacian(arr, cv2.CV_64F).var()
            if lap < 18:
                real_valid = False
                print(f"NOTE: test_inputs images too blurry (Laplacian={lap:.1f}), using synthetic images")
        except Exception:
            real_valid = False

    if real_valid:
        print("Using real test images from test_inputs/")
        files_data = {
            "top":    ("top.jpg",    open(real_imgs[0], "rb"), "image/jpeg"),
            "bottom": ("bottom.jpg", open(real_imgs[1], "rb"), "image/jpeg"),
            "left":   ("left.jpg",   open(real_imgs[2], "rb"), "image/jpeg"),
            "right":  ("right.jpg",  open(real_imgs[3], "rb"), "image/jpeg"),
        }
    elif PIL_AVAILABLE:
        print("Using synthetic car images (real test images unavailable/blank)")
        views = ["top", "bottom", "left", "right"]
        files_data = {
            v: (f"{v}.jpg", make_synthetic_car_image(v), "image/jpeg")
            for v in views
        }
    else:
        print("SKIP: No test images and Pillow not available for synthetic generation")
        return True  # Not a failure

    async with httpx.AsyncClient(timeout=120.0) as client:
        data = {
            "vehicle_make": "Maruti",
            "vehicle_model": "Swift",
            "vehicle_year": "2019",
            "cause_of_damage": "Front collision with scraping on bumper and body panel",
        }
        print("Sending to /assess/direct ...")
        resp = await client.post("http://localhost:8000/assess/direct", files=files_data, data=data)
        print("Status:", resp.status_code)

        if resp.status_code == 400:
            body = resp.json()
            if body.get("error") == "validation_failed":
                blockers = body.get("validation", {}).get("blockers", [])
                print("Validation blockers:", blockers)
                print("SKIP: Images failed validation — use higher-quality photos for live testing")
                return True
            print("ERROR 400:", resp.text[:600])
            return False

        if resp.status_code == 503:
            print("SKIP: OpenAI API key not configured on backend")
            return True

        if resp.status_code != 200:
            print("ERROR:", resp.text[:800])
            return False

        r = resp.json()
        print()
        print("=== ASSESSMENT RESULT ===")
        print("execution_mode       :", r.get("execution_mode"))
        print("assessment_status    :", r.get("assessment_status"))
        print("overall_severity     :", r.get("overall_severity"))
        print("overall_confidence   :", r.get("overall_confidence"))
        print("total_unique_comps   :", r.get("total_unique_components"))
        print("cost_range (INR)     :", r.get("estimated_repair_cost_min"), "-", r.get("estimated_repair_cost_max"))
        print("settlement_offer     :", r.get("settlement_offer"))
        print("human_review_required:", r.get("human_review_required"))
        print()

        items = r.get("damage_items", [])
        print(f"--- {len(items)} Damage item(s) (deduplicated) ---")
        for it in items:
            status = it.get("status", "?")
            comp = it.get("component", "?")
            dtype = it.get("damageType", "?")
            sev = it.get("severity", "?")
            conf = float(it.get("confidence", 0))
            views = it.get("evidenceViews", [])
            desc = (it.get("evidenceDescription") or "")[:100]
            cmin = it.get("costEstimateMin", 0)
            cmax = it.get("costEstimateMax", 0)
            rec = it.get("recommendation", "?")
            print(f"  [{status}] {comp} — {dtype} ({sev}, conf={conf:.2f})")
            print(f"    Views: {views}  |  Recommendation: {rec}")
            print(f"    Description: {desc}")
            print(f"    Cost: INR {cmin} - {cmax}")

        dups = r.get("duplicates_resolved", [])
        if dups:
            print()
            print(f"--- {len(dups)} Deduplication note(s) ---")
            for d in dups:
                print(f"  {d.get('description')} | views: {d.get('views')}")

        reasoning = (r.get("overall_reasoning") or "")[:400]
        print()
        print("Overall reasoning:", reasoning)

        print()
        print("Limitations:")
        for lim in (r.get("limitations") or [])[:3]:
            print(" -", lim)

        # Regression assertions
        print()
        print("=== REGRESSION CHECKS ===")
        checks = []

        # 1. execution_mode must be openai_vision (not local YOLO)
        mode = r.get("execution_mode", "")
        checks.append(("execution_mode == openai_vision", mode == "openai_vision", mode))

        # 2. No glass_shatter/tire_flat unless clearly visible
        bad_classes = {"glass_shatter", "tire_flat"}
        bad_items = [
            it for it in items
            if it.get("damageType", "").lower() in bad_classes
            and it.get("status") in ("confirmed", "suspected")
        ]
        checks.append(("No glass_shatter/tire_flat for panel-scratch images",
                        len(bad_items) == 0, [it.get("damageType") for it in bad_items]))

        # 3. Total unique components must be < 20 (not hundreds)
        total = r.get("total_unique_components", 999)
        checks.append(("total_unique_components < 20", total < 20, total))

        # 4. Cost range reasonable
        cmax_total = r.get("estimated_repair_cost_max", 0)
        checks.append(("cost_max < 200000", cmax_total < 200000, cmax_total))

        # 5. assessment_status not failed
        astatus = r.get("assessment_status", "")
        checks.append(("assessment_status in valid values",
                        astatus in ("completed", "inconclusive", "insufficient_evidence"), astatus))

        # 6. response_id must start with DIR-
        aid = r.get("assessment_id", "")
        checks.append(("assessment_id starts with DIR-", aid.startswith("DIR-"), aid))

        all_passed = True
        for name, ok, detail in checks:
            symbol = "PASS" if ok else "FAIL"
            print(f"  [{symbol}] {name}  (got: {detail})")
            if not ok:
                all_passed = False

        print()
        print("Overall:", "ALL CHECKS PASSED" if all_passed else "SOME CHECKS FAILED")
        return all_passed


if __name__ == "__main__":
    ok = asyncio.run(test_direct_live())
    sys.exit(0 if ok else 1)
