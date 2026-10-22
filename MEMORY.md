# ClaimPilot AI — Memory & Architecture Document
**Last Updated:** 2026-10-22 (Updated 23:42 UTC)  
**Version:** 3.1.0 — Workflow Progression & YOLO+Vision Merging  
**Purpose:** Complete system documentation for integration and maintenance

---

## 🔄 LATEST FIXES (2026-10-22 Session 2)

### Workflow Progression & Settlement Button — FIXED ✅
**Issue:** 14-frame video+4-view assessment displayed results inline instead of transitioning through workflow stages. Settlement button was unresponsive.

**Root Cause:** 
- `VideoFourViewInference.tsx` was storing results in component state and showing them inline
- "Continue to Settlement" button dispatched a custom event instead of calling parent callback
- Parent never received signal to transition from 'upload' → 'assessing' → 'assessment'

**Fixes Applied:**

1. **VideoFourViewInference.tsx** — Removed inline results display
   - Changed line ~302: Removed `setInferenceResults(result); setShowResults(true);`
   - Now calls `onInferenceComplete(result)` directly after API succeeds
   - Component hides itself immediately, parent handles the rest
   - Results view section still in code but never renders (showResults stays false)

2. **Settlement Button Wired Correctly**
   - Line ~1007: Changed from `window.dispatchEvent(new CustomEvent(...))` to direct `onInferenceComplete(inferenceResults)` call
   - This was redundant anyway since we now call callback immediately

3. **Effect:** Workflow now properly transitions:
   - User uploads video + 4 photos → clicks "Start Assessment"
   - VideoFourViewInference processes → calls `handleVideoFourViewComplete(result)`
   - Parent sets `stage('assessment')` → DamageAnnotation component shows damage summary
   - User can review → click "Proceed to Chat" → settlement negotiation
   - Settlement button correctly wired to `handleConfirmOffer()` callback

### YOLO+Vision Detection Merging — IMPLEMENTED ✅
**New Feature:** `/assess/video-four-view` endpoint now supports YOLO detection merged with OpenAI Vision

**Implementation:**
- Backend: Added `use_yolo: bool = Form(default=False)` parameter to `/assess/video-four-view`
- When `use_yolo=true`, backend runs Detector on all 14 images (10 video frames + 4 photos)
- Merging logic (main.py ~1130-1160):
  - Vision results (OpenAI) are primary (higher confidence)
  - YOLO results added only for damage types NOT already in Vision
  - YOLO confidence reduced by 40% (secondary source)
  - Only adds YOLO detections if confidence ≥ threshold
- Frontend: VideoFourViewInference.tsx now sends `use_yolo=true` in FormData (line ~287)

**Result:** Both models now contribute:
- OpenAI Vision: High-level reasoning, deduplication, evidence-grounded
- YOLO: Computer vision confirmations, catches edge cases Vision might miss

### Confidence Threshold Adjustment (Prior Session)
**Status:** ✅ Already applied in `integrated_pipeline/config.py`
- From: `{dent:0.25, scratch:0.25, crack:0.30, glass_shatter:0.30, lamp_broken:0.30, tire_flat:0.25}`
- To: `{dent:0.15, scratch:0.15, crack:0.18, glass_shatter:0.18, lamp_broken:0.18, tire_flat:0.15}`
- Reason: Lower thresholds catch marginal but valid damage, 0.25–0.30 was rejecting legitimate detections

---

## 🔄 INTEGRATION LOG (2026-10-22 Session 1)

### Integrated 14-Frame Majority Voting Pipeline — Bug Fixes & Router Mounting
**Source:** `D:\Model Training\car_parts_inference\` → `D:\Model Training\claimpilot-ai\backend\integrated_pipeline\`

The `car_parts_inference/` standalone pipeline was previously adapted into `backend/integrated_pipeline/`. This session fixed the broken integration:

**Fixes Applied:**
1. **`config.py` MODEL_PATH** — Changed from relative `Path("best.pt")` to absolute `backend/models/best.pt`
2. **`router.py` get_detector()** — Fixed parameter name `confidence_threshold` → `confidence`; removed call to nonexistent `update_confidence_threshold()` method
3. **`main.py`** — Added `import logging`, `import time`, `logger` definition, `MODEL_PATH` definition; fixed inline endpoint parameter (`confidence` instead of `confidence_threshold`); removed redundant local `import os`
4. **`main.py`** — Mounted `integrated_pipeline.router` via `app.include_router(integrated_router)` — adds 3 new endpoints
5. **`requirements.txt`** — Added `pandas`, `matplotlib`, `seaborn`, `tqdm` for integrated pipeline

**New Endpoints (from mounted router):**
- `GET /assess/integrated/health` — Model status
- `POST /assess/integrated/fourteen-frame` — 14-frame majority voting assessment
- `GET /assess/integrated/config` — Pipeline configuration

**Fixed Endpoint:**
- `POST /assess/integrated-fourteen-frame` (inline in main.py) — Was completely broken (NameError: logger, MODEL_PATH, time; TypeError: confidence_threshold). Now works.

### Previous Integration (2024-10-22)
**Added Components:**
- `backend/integrated_pipeline/config.py` — Configuration with CarDD class mapping, label mapping (lamp_broken → scratch), severity weights
- `backend/integrated_pipeline/detector.py` — CarDamageDetector with label mapping, majority voting across 14 frames (4 images + 10 video frames), AggregatedResult with per-frame breakdown
- `backend/integrated_pipeline/visualizer.py` — Annotated outputs, CSV/JSON reports, visualization charts
- `backend/integrated_pipeline/router.py` — FastAPI endpoint `POST /assess/integrated/fourteen-frame`
- `backend/integrated_pipeline/__init__.py` — Package exports

**Modified:**
- `backend/main.py` — Added import and endpoint `POST /assess/integrated-fourteen-frame`

---

### ⚠ Testing Environment Note
On this Windows machine, uvicorn now works correctly (tested Oct 2026). Previous networking issues with asyncio socket binding appear resolved. All endpoints tested and verified working.

---

## 🏗 SYSTEM ARCHITECTURE OVERVIEW
```
┌─────────────────────────────────────────────────────────────────┐
│                        CLAIMPILOT AI                            │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React 19 + TypeScript + Vite)                       │
│  ├── Cinematic automotive UI (dark theme, 3D animations)       │
│  ├── 5-stage claim flow: Upload → Scan → Report → Negotiate    │
│  ├── Local YOLO inference (ONNX Runtime Web)                   │
│  └── REST API client (lib/utils.ts)                            │
├─────────────────────────────────────────────────────────────────┤
│  Backend (FastAPI + Python) — Multi-Assessment Architecture    │
│  ├── /assess/               → CarDD YOLOv8n + Policy Engine    │
│  │   CarDD-trained (10 classes, mAP@50: 0.581)                 │
│  │   Deterministic decisions: AUTO_APPROVE / HUMAN_REVIEW / ESCALATE │
│  │   Full decision trace + SOP evidence + human override log   │
│  ├── /assess/general        → Multi-image, settlement offers   │
│  ├── /assess/four-view      → Structured 4-view inspection     │
│  ├── /assess/video-four-view→ Video (10 frames) + 4 photos     │
│  │   Deduplicated detections across 14 images                  │
│  ├── /assess/hybrid         → LLM-enhanced (Gemini/OpenAI)     │
│  ├── /assess/multimodal     → 3+ photos + 1 video (collective) │
│  ├── /assess/integrated/    → 14-frame majority voting (YOLO)  │
│  │   4 images + 1 video (10 frames) = 14 frames                │
│  │   Label mapping: lamp_broken → scratch                     │
│  ├── /policy/icici-lombard  → ICICI Lombard policy screening   │
│  ├── /negotiate             → ChatGPT-powered settlement chat  │
│  └── /negotiate/{id}/respond → Negotiation round handling      │
├─────────────────────────────────────────────────────────────────┤
│  Governance Layer                                               │
│  ├── policies/rules.yaml     — Explicit decision rules          │
│  ├── policies/damage_triage.md — SOP evidence & next steps     │
│  ├── knowledge/              — RAG knowledge base               │
│  └── Human override audit trail (immutable, timestamped)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 CORE COMPONENTS & FILES

### Backend (Python/FastAPI)
| File | Purpose | Mounted? |
|------|---------|----------|
| `backend/main.py` | Main FastAPI app with all endpoints | ✅ Live |
| `backend/car_damage_detector.py` | CarDD YOLOv8 wrapper (6 damage classes) | Via damage_assessment |
| `backend/damage_assessment.py` | Policy-driven /assess/ router | ❌ Not mounted |
| `backend/video_processor.py` | Video frame extraction | ✅ Used by main.py |
| `backend/multimodal_assessment.py` | Collective 3+ photos + 1 video assessment | ❌ Not mounted |
| `backend/icici_lombard_screening.py` | ICICI Lombard policy screening | ❌ Not mounted |
| `backend/negotiation_engine.py` | ChatGPT-powered negotiation | ❌ Not mounted |
| `backend/integrated_pipeline/` | 14-frame majority voting pipeline | ✅ Mounted (this session) |
| `backend/agentic/decision_agent.py` | Policy evaluation engine | Via damage_assessment |
| `backend/agentic/adapters.py` | CV → signal conversion | Via damage_assessment |
| `backend/agentic/schemas.py` | Pydantic dataclasses | Via damage_assessment |
| `backend/agentic/trace.py` | Decision trace builder | Via damage_assessment |
| `backend/agentic/explainer.py` | Customer explanations | Via damage_assessment |
| `backend/agentic/policy_loader.py` | YAML policy parser | Via damage_assessment |
| `backend/agentic/sop_retriever.py` | SOP section extraction | Via damage_assessment |
| `backend/agentic/rag/simple_retriever.py` | Knowledge RAG | Via damage_assessment |
| `backend/agentic/strategies.py` | Repair strategy simulator | Via damage_assessment |
| `backend/agentic/vision/` | Inpainting/after-preview | Standalone |
| `backend/evaluate_model.py` | Model evaluation (mAP, precision/recall) | Standalone |

### Integrated Pipeline (`backend/integrated_pipeline/`)
| File | Purpose |
|------|---------|
| `config.py` | Model path (absolute), 6 CarDD classes (underscores), label mapping, severity config, colors, limits |
| `detector.py` | CarDamageDetector (YOLO), SeverityAssessor, aggregate_results() majority voting |
| `visualizer.py` | Visualizer — annotated images/video, CSV reports, severity JSON, matplotlib charts |
| `router.py` | APIRouter(prefix="/assess/integrated") — health, fourteen-frame, config endpoints |
| `__init__.py` | Exports all config + detector + visualizer + router |

### Frontend (React/TypeScript)
| File | Purpose |
|------|---------|
| `src/lib/yoloInference.ts` | ONNX Runtime Web inference (browser) |
| `src/lib/aiService.ts` | AI negotiation (Gemini/OpenAI/local) |
| `src/lib/settlementCalculator.ts` | Parts database pricing |
| `src/lib/utils.ts` | API client + helpers |
| `src/pages/ClaimFlowPage.tsx` | 5-stage workflow |
| `src/components/cinematic/` | 3D wheel, light sweeps, upload bay |

### Policy & Knowledge
| File | Purpose |
|------|---------|
| `backend/policies/rules.yaml` | Decision rules (versioned) |
| `backend/policies/damage_triage.md` | SOP evidence & next steps |
| `backend/knowledge/repair_playbook.md` | Repair guidance |
| `backend/knowledge/sla_notes.md` | Service level agreements |

---

## 🌐 API ENDPOINTS SUMMARY

### Live Endpoints (served by main.py)
| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/health` | Health check | ✅ Working |
| GET | `/ai/provider/status` | AI provider info (OpenAI) | ✅ Working |
| POST | `/assess/four-view` | 4 photos → OpenAI vision assessment | ✅ Accessible |
| POST | `/assess/hybrid` | Base64 JSON → OpenAI vision | ✅ Accessible |
| POST | `/assess/video-four-view` | 1 video + 4 photos → OpenAI vision | ✅ Accessible |
| POST | `/assess/integrated-fourteen-frame` | 4 images + 1 video → 14-frame YOLO | ✅ Fixed (this session) |
| POST | `/assess/direct` | Primary frontend path → OpenAI | ✅ Accessible |
| POST | `/report` | Generate claim report via OpenAI | ✅ Accessible |
| POST | `/negotiate` | Settlement negotiation via OpenAI | ✅ Accessible |
| GET | `/assess/integrated/health` | Integrated pipeline model status | ✅ New (this session) |
| POST | `/assess/integrated/fourteen-frame` | 14-frame majority voting (router) | ✅ New (this session) |
| GET | `/assess/integrated/config` | Pipeline configuration | ✅ New (this session) |

### Defined but NOT Mounted
| Method | Endpoint | Source File |
|--------|----------|------------|
| GET | `/assess/health` | damage_assessment.py |
| POST | `/assess` | damage_assessment.py |
| GET | `/assess/policy` | damage_assessment.py |
| POST | `/assess/multimodal` | multimodal_assessment.py |
| POST | `/policy/icici-lombard/suitability` | icici_lombard_screening.py |
| GET | `/idogur10/health` | idogur10_integration.py |
| POST | `/idogur10/assess` | idogur10_integration.py |

---

## 🔄 KEY WORKFLOWS

### 1. Four-View Assessment (`/assess/four-view`)
```
Upload 4 photos (top/bottom/left/right)
    ↓
Validate views (resolution, blur, duplicates)
    ↓
OpenAI GPT-4o-mini vision assessment (deduplication in prompt)
    ↓
Aggregate damage items → cost estimation
    ↓
Return: assessment_id, damages, severity, settlement offer
```

### 2. Video + Four-View Assessment (`/assess/video-four-view`)
```
Upload 1 video (8-10s) + 4 photos
    ↓
Extract 10 uniform frames from video
    ↓
OpenAI GPT-4o-mini on 14 images (frames=low detail, photos=high detail)
    ↓
Deduplicate damage items via AI prompt
    ↓
Return: 14-image assessment with unique damage instances
```

### 3. Integrated 14-Frame Pipeline (`/assess/integrated/fourteen-frame`)
```
Upload 4 images + 1 video
    ↓
YOLO detection on 4 images + 10 video frames = 14 total
    ↓
Normalize class names (spaces → underscores)
    ↓
Apply label mapping (lamp_broken → scratch)
    ↓
Assess severity per frame (weighted scoring)
    ↓
Majority voting: each frame votes for damage types present
    ↓
Return: majority damage type, severity, per-frame details, vote counts
```

### 4. Policy-Driven Assessment (`/assess/` — not mounted)
```
Upload single image
    ↓
YOLOv8n CarDD detection (6 classes: dent, scratch, crack, glass_shatter, lamp_broken, tire_flat)
    ↓
Pick primary detection → convert to DamageSignal
    ↓
DecisionAgent evaluates rules.yaml sequentially
    ↓
Match rule → load SOP → build decision trace
    ↓
Return: AUTO_APPROVE / HUMAN_REVIEW / ESCALATE + full trace
```

### 5. Human Override Governance
```
Operator sees decision + trace
    ↓
Selects: AUTO_APPROVE | HUMAN_REVIEW | ESCALATE
    ↓
Chooses reason: False severity | Poor image quality | Hidden damage | Vehicle mismatch | Other
    ↓
Mandatory comment
    ↓
Immutable audit log: timestamp, original decision, override details
```

### 6. Browser Inference (ONNX Runtime Web)
```
Load /best.onnx (640×640, 10 CarDD classes)
    ↓
Letterbox resize → normalize → tensor (NCHW)
    ↓
WASM execution provider
    ↓
Parse output [1, 14, 8400] → NMS → filter to 6 valid classes
    ↓
Return detections for UI display
```

---

## 🎯 CARDD MODEL SPECIFICATIONS
| Property | Value |
|----------|-------|
| **Model** | YOLOv8n (nano) |
| **Dataset** | CarDD (4,000+ images, 9,000+ annotations) |
| **Classes (10)** | crack, crash, dent, dislocated_part, glass_shatter, lamp_broken, no_part, rub, scratch, tire_flat |
| **Valid Insurance Classes (6)** | dent, scratch, crack, glass_shatter, lamp_broken, tire_flat |
| **mAP@50** | 0.581 |
| **mAP@50-95** | 0.409 |
| **Precision** | 0.675 |
| **Recall** | 0.534 |
| **Image Size** | 640×640 |
| **Epochs** | 50 |
| **Model Size** | 5.9 MB (19MB on disk) |
| **Inference** | CPU real-time (~50ms) |

---

## 📋 POLICY ENGINE RULES (rules.yaml)

### Thresholds
- `auto_approve_conf: 0.85`
- `human_review_conf: 0.55`

### Rules (evaluated in order)
1. **auto_approve_minor_scratch** — scratch + minor + conf≥0.85 → AUTO_APPROVE
2. **human_review_moderate_dent** — dent + moderate + conf≥0.55 → HUMAN_REVIEW
3. **escalate_severe_damage** — severe + conf≥0.55 → ESCALATE
4. **human_review_crack** — crack + conf≥0.55 → HUMAN_REVIEW
5. **human_review_glass_shatter** — glass_shatter + conf≥0.55 → HUMAN_REVIEW
6. **human_review_lamp_broken** — lamp_broken + conf≥0.55 → HUMAN_REVIEW
7. **human_review_tire_flat** — tire_flat + conf≥0.55 → HUMAN_REVIEW
8. **low_confidence_human_review** — conf<0.55 → HUMAN_REVIEW

---

## 🔧 ENVIRONMENT CONFIGURATION

### Backend (`backend/.env`)
```env
# Model
AUTOSETTLE_MODEL_PATH=
AUTOSETTLE_HF_REPO=shanexf/car-damage-yolo11m-ft
AUTOSETTLE_HF_FILENAME=damage_best.pt
# Image Validation
AUTOSETTLE_MIN_IMAGE_SIDE=240
AUTOSETTLE_MIN_LAPLACIAN_VARIANCE=10
AUTOSETTLE_NEAR_DUPLICATE_DISTANCE=3
AUTOSETTLE_LOW_CONFIDENCE_THRESHOLD=0.40
# Hybrid AI (Optional)
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash-latest
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
# Server
HOST=0.0.0.0
PORT=8000
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=INFO
```

### Frontend (`.env` at root)
```env
VITE_API_URL=http://localhost:8000
VITE_DEMO_MODE=true
VITE_LOCAL_AI_ENABLED=true
VITE_HYBRID_AI_ENABLED=false
VITE_YOLO_MODEL_PATH=/best.onnx
VITE_CONFIDENCE_THRESHOLD=0.25
VITE_DEFAULT_ASSESSMENT_MODE=ai
```

---

## 🧪 TESTING

### Backend Tests
```bash
cd backend
pytest ../tests/test_api.py agentic/tests/ -v
```

### Frontend Linting
```bash
npm run lint
```

---

## 📁 PROJECT STRUCTURE (Key Paths)
```
claimpilot-ai/
├── backend/
│   ├── main.py                      # FastAPI app (live)
│   ├── car_damage_detector.py       # YOLOv8 CarDD wrapper
│   ├── damage_assessment.py         # Policy-driven /assess/ (not mounted)
│   ├── video_processor.py           # Frame extraction
│   ├── multimodal_assessment.py     # Collective evidence (not mounted)
│   ├── icici_lombard_screening.py   # Policy screening (not mounted)
│   ├── negotiation_engine.py        # ChatGPT negotiation
│   ├── evaluate_model.py            # Model evaluation
│   ├── integrated_pipeline/         # 14-frame majority voting ✅ MOUNTED
│   │   ├── config.py
│   │   ├── detector.py
│   │   ├── visualizer.py
│   │   ├── router.py
│   │   └── __init__.py
│   ├── agentic/
│   │   ├── decision_agent.py        # Policy evaluation
│   │   ├── adapters.py              # CV → signal
│   │   ├── schemas.py               # Pydantic models
│   │   ├── trace.py                 # Decision trace
│   │   ├── explainer.py             # Customer explanations
│   │   ├── policy_loader.py         # YAML parser
│   │   ├── sop_retriever.py         # SOP extraction
│   │   ├── rag/simple_retriever.py  # Knowledge RAG
│   │   ├── strategies.py            # Repair strategies
│   │   ├── expert_ai.py             # LLM commentary (optional)
│   │   ├── llm/                     # LLM client
│   │   └── vision/                  # Inpainting
│   ├── policies/
│   │   ├── rules.yaml               # Decision rules
│   │   └── damage_triage.md         # SOP evidence
│   ├── knowledge/
│   │   ├── repair_playbook.md
│   │   └── sla_notes.md
│   ├── models/best.pt               # CarDD YOLOv8n
│   └── tests/
├── src/
│   ├── lib/yoloInference.ts         # ONNX Runtime Web
│   ├── lib/aiService.ts             # AI negotiation
│   ├── lib/settlementCalculator.ts  # Parts pricing
│   ├── components/cinematic/        # 3D UI components
│   └── pages/ClaimFlowPage.tsx      # 5-stage workflow
├── public/best.onnx                 # Browser ONNX model
├── notebooks/train_yolov8_cardd.ipynb # Training (Colab)
└── convert_to_onnx.py               # PyTorch → ONNX
```

---

## 🔑 CRITICAL INTEGRATION POINTS

### For Adding New Assessment Endpoints:
1. Add route in `backend/main.py` or new router module
2. Use `car_damage_detector.CarDamageDetector` for YOLO inference
3. Use `agentic.decision_agent.DecisionAgent` for policy decisions
4. Follow response schema from `damage_assessment.py` (AssessmentResult)

### For Extending Damage Classes:
1. Update `car_damage_detector.py` class_names mapping
2. Update `backend/main.py` VALID_DAMAGE_CLASSES & normalize_damage_type()
3. Update `src/lib/yoloInference.ts` MODEL_CLASSES & VALID_DAMAGE_CLASSES
4. Add cost entries in DAMAGE_COST_MAP
5. Add rules in `policies/rules.yaml`
6. Add SOP sections in `policies/damage_triage.md`

### For New Policy Rules:
1. Edit `backend/policies/rules.yaml` (maintain version)
2. Add corresponding SOP section in `damage_triage.md`
3. Test with `agentic/tests/`

---

## 🚨 KNOWN CONSTRAINTS & LIMITATIONS
1. **No fallback models** — Requires CarDD-trained `best.pt`
2. **Policy engine is deterministic** — No LLM in core decision path
3. **Video max 10s** — Hardcoded in video_processor
4. **Image max 40MP** — Enforced in decode_image()
5. **Browser inference WASM only** — No WebGPU yet
6. **ONNX model must match** — 10 classes in correct order
7. **Vehicle info mandatory** — make/model/year/cause for all assessments

---

## ⚠ OUTSTANDING ISSUES (not addressed in this integration)

1. **Two backends, one mounted**: `main.py` (OpenAI-vision, live) vs policy-driven `damage_assessment.py` subsystem (defined, not mounted)
2. **Class-count inconsistency**: Trained model is 10-class CarDD, but `car_damage_detector.py` declares only 6 classes
3. **Config vs code drift**: `.env.example` defaults to Gemini; `main.py` hardcodes OpenAI
4. **CI mismatch**: CI expects root `requirements.txt` and `api` module that don't exist
5. **Frontend↔backend drift**: Frontend calls endpoints not served by live `main.py`
6. **icici_lombard_screening bug**: References undefined `ReasonCode.CV_REVIEW_REQUIRED`
7. **idogur10_integration**: Imports non-existent external repo, fails to import

---

## ✅ VERIFICATION CHECKLIST (Post-Integration — Oct 2026)

### Verified Working:
- [x] Backend starts without import errors
- [x] `/health` returns healthy
- [x] `/ai/provider/status` returns OpenAI config (configured: true)
- [x] `/assess/integrated/health` — model_loaded: True, correct absolute path
- [x] `/assess/integrated/config` — 14 frames, 6 classes, label mapping, severity config
- [x] `/assess/integrated/fourteen-frame` — 4 images + 1 video → 14 frames, 200 OK
- [x] `/assess/integrated-fourteen-frame` (inline) — 14 frames, 200 OK
- [x] All pre-existing endpoints accessible (four-view, hybrid, video-four-view, direct, negotiate, report)
- [x] No existing files disturbed beyond targeted fixes
- [x] Missing dependencies (pandas, seaborn) installed and added to requirements.txt

### Files Modified:
1. `backend/integrated_pipeline/config.py` — MODEL_PATH → absolute path
2. `backend/integrated_pipeline/router.py` — Fixed parameter name + removed nonexistent method calls
3. `backend/main.py` — Added logging/time/MODEL_PATH, fixed parameter, mounted router
4. `backend/requirements.txt` — Added pandas, matplotlib, seaborn, tqdm
5. `MEMORY.md` — Updated with integration status and verification results

---

## 📝 INTEGRATION NOTES

### car_parts_inference Pipeline (source)
- **Model**: Ultralytics YOLOv5/v8 (.pt format)
- **Classes**: dent, scratch, crack, glass shatter, lamp broken, tire flat (6 classes)
- **Features**: 
  - Label mapping: "lamp broken" → "scratch"
  - Majority voting across 14 frames (4 images + 10 video frames)
  - Severity assessment with configurable weights
  - Annotated outputs, CSV/JSON reports, visualizations

### Integrated Pipeline (in claimpilot-ai)
- Same detection logic, adapted with underscore class names for CarDD compatibility
- Added `_normalize_model_class_name()` to handle model's raw names (spaces → underscores)
- `MODEL_PATH` now points to `backend/models/best.pt` (absolute)
- Router mounted at `/assess/integrated/` prefix
- Also accessible via inline endpoint at `/assess/integrated-fourteen-frame`

---

## 🔗 REFERENCES
- **CarDD Dataset**: USTC Car Damage Detection
- **Ultralytics YOLOv8**: https://github.com/ultralytics/ultralytics
- **ONNX Runtime Web**: https://onnxruntime.ai/docs/get-started/with-javascript.html
- **FastAPI**: https://fastapi.tiangolo.com/
- **React 19 + Vite**: https://vitejs.dev/
- **shadcn/ui**: https://ui.shadcn.com/
