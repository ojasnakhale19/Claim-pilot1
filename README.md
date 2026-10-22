# ClaimPilot AI — Vehicle Damage Assessment & Settlement Platform

A complete, production-ready platform for AI-powered vehicle damage assessment and insurance claim settlement. Combines a cinematic React frontend with a dual-model FastAPI backend featuring policy-driven decision governance.

---

## Architecture Overview

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

## Quick Start

### Prerequisites
- **Node.js 18+** (frontend)
- **Python 3.11+** (backend)
- **Git**

### 1. Clone & Install Frontend
```bash
git clone https://github.com/ojasnakhale19/Claim-Pilot.git
cd claimpilot-ai
npm install
```

### 2. Setup Backend
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\Activate.ps1
# Linux/Mac:
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Convert Model to ONNX (for browser inference)
```bash
cd ..  # back to project root
python convert_to_onnx.py backend/models/best.pt public/best.onnx
```

### 4. Configure Environment
```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your API keys (optional):
# GEMINI_API_KEY=xxx      # For hybrid AI assessment
# OPENAI_API_KEY=xxx      # Alternative LLM provider / negotiation
# AI_PROVIDER=gemini      # or openai

# Frontend (at project root)
cp .env.example .env
# Edit VITE_API_URL if backend runs elsewhere
```

### 5. Run Development Servers

**Terminal 1 - Backend (port 8000):**
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend (port 5173):**
```bash
npm run dev
```

Open **http://localhost:5173** — the frontend proxies API calls to `http://localhost:8000`.

---

## Backend API Endpoints

### Policy-Driven Assessment (CarDD + Decision Engine)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/assess/health` | Model + policy engine status |
| `POST` | `/assess/` | **Main endpoint** — single image → detections + policy decision + trace |
| `GET` | `/assess/policy` | Current rules.yaml + SOP configuration |

### Video + Four-View Assessment (14 images with deduplication)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/assess/video-four-view` | 1 video (8-10s) + 4 photos (top/bottom/left/right) → 10 frames + 4 photos = 14 images with **deduplicated** damage detection |

### Multi-Modal Assessment (Collective Evidence)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/assess/multimodal` | 3+ photos + 1 video → collective decision from all evidence |

### Hybrid AI Assessment (LLM-Enhanced)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/assess/hybrid` | YOLO detections + Gemini/OpenAI vision reasoning |
| `GET` | `/ai/provider/status` | LLM provider configuration status |

### ICICI Lombard Policy Screening
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/policy/icici-lombard/suitability` | Screen claim against ICICI Lombard policy terms, CTL thresholds, exclusions |

### Negotiation Engine
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/negotiate/start` | Initialize negotiation session from assessment |
| `POST` | `/negotiate/{session_id}/respond` | Process claimant response, return counter-offer |
| `GET` | `/negotiate/{session_id}` | Get negotiation history |

### Original ClaimPilot Endpoints (Preserved)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/assess/general` | Multi-image, settlement offers, HF YOLOv11 |
| `POST` | `/assess/four-view` | Structured 4-view (top/bottom/left/right) |
| `GET` | `/model/info` | Model metadata |

---

## Video + Four-View Deduplication Logic

The `/assess/video-four-view` endpoint processes **14 images** (10 video frames + 4 photos) but **deduplicates detections** before cost estimation:

1. **Extract** 10 uniformly spaced frames from 8-10s video
2. **Detect** damage on all 14 images independently
3. **Merge OpenAI Vision + YOLO** (dual-model for comprehensive detection)
   - **OpenAI Vision**: Primary (high confidence, AI-grounded reasoning)
   - **YOLO**: Secondary confirmations (computer vision verification)
   - Vision results take precedence; YOLO adds non-duplicate detections
4. **Deduplicate**: Group by damage type, keep highest-confidence detection per type
5. **Estimate costs** using unique damage instances only
6. **Response** includes both raw count and unique count

This prevents the same scratch/dent appearing in multiple frames from inflating repair estimates.

### Dual-Model Advantages
- **Vision Strengths**: Deep reasoning, multi-modal understanding, deduplication logic
- **YOLO Strengths**: Computer vision accuracy, edge case detection, real-time performance
- **Combined**: More comprehensive damage detection with cross-validation

---

## Decision Governance (Policy Engine)

The `/assess/` endpoint uses a **deterministic policy engine** — no LLM involved in core decisions.

### Policy Files
```
policies/
├── rules.yaml           # Decision rules (versioned)
└── damage_triage.md     # SOP evidence & next steps

knowledge/
├── repair_playbook.md   # Repair guidance
└── sla_notes.md         # Service level agreements
```

### Decision Rules (`rules.yaml`)
```yaml
version: 1
thresholds:
  auto_approve_conf: 0.85
  human_review_conf: 0.55

rules:
  - name: auto_approve_minor_scratch
    if:
      damage_type_in: ["scratch"]
      severity_in: ["minor"]
      confidence_gte: 0.85
    then:
      action: "AUTO_APPROVE"
      sop_ref: "damage_triage.md#minor-scratch"
      reason: "High-confidence minor scratch matches auto-approval policy."

  - name: human_review_moderate_dent
    if:
      damage_type_in: ["dent"]
      severity_in: ["moderate"]
      confidence_gte: 0.55
    then:
      action: "HUMAN_REVIEW"
      sop_ref: "damage_triage.md#moderate-damage"
      reason: "Moderate dent should be reviewed by an operator before approval."

  - name: escalate_severe_damage
    if:
      severity_in: ["severe"]
      confidence_gte: 0.55
    then:
      action: "ESCALATE"
      sop_ref: "damage_triage.md#severe-damage"
      reason: "Severe damage should be escalated for specialist assessment."

  # Rules for all 10 CarDD classes:
  - name: human_review_crack
    if: { damage_type_in: ["crack"], confidence_gte: 0.55 }
    then: { action: "HUMAN_REVIEW", ... }

  - name: human_review_glass_shatter
    if: { damage_type_in: ["glass_shatter"], confidence_gte: 0.55 }
    then: { action: "HUMAN_REVIEW", ... }

  - name: human_review_lamp_broken
    if: { damage_type_in: ["lamp_broken"], confidence_gte: 0.55 }
    then: { action: "HUMAN_REVIEW", ... }

  - name: human_review_tire_flat
    if: { damage_type_in: ["tire_flat"], confidence_gte: 0.55 }
    then: { action: "HUMAN_REVIEW", ... }

  - name: low_confidence_human_review
    if: { confidence_lt: 0.55 }
    then: { action: "HUMAN_REVIEW", ... }
```

### Human Override (Governance)
Every decision can be overridden by a human operator:
- Override action: `AUTO_APPROVE` | `HUMAN_REVIEW` | `ESCALATE`
- Override reason: `False severity` | `Poor image quality` | `Hidden damage suspected` | `Vehicle type/context mismatch` | `Other`
- Mandatory comment field
- Immutable audit log with timestamp, original decision, override details

---

## CarDD Model Details

| Metric | Value |
|--------|-------|
| **Model** | YOLOv8n (nano) |
| **Dataset** | CarDD (4,000+ images, 9,000+ annotations) |
| **Classes** | 10: crack, crash, dent, dislocated_part, glass_shatter, lamp_broken, no_part, rub, scratch, tire_flat |
| **mAP@50** | 0.581 |
| **mAP@50-95** | 0.409 |
| **Precision** | 0.675 |
| **Recall** | 0.534 |
| **Image Size** | 640×640 |
| **Epochs** | 50 |
| **Model Size** | 5.9 MB |
| **Inference** | CPU real-time (~50ms) |

Training notebook: `notebooks/train_yolov8_cardd.ipynb` (reproducible on Google Colab T4 GPU, ~20 min)

---

## Frontend Features

### Assessment Modes
1. **Demo Mode** — Simulated assessment based on photo count (no backend required)
2. **AI Assessment** — Local YOLO inference (ONNX Runtime Web) or backend `/assess/four-view`
3. **Video + 4-View** — Backend `/assess/video-four-view` with deduplication

### Mandatory Vehicle Information
Before assessment, users must provide:
- **Car Company** (dropdown from car_data.json)
- **Car Model** (filtered by company)
- **Cause of Damage** (text area)

These fields are validated and passed to AI negotiation for accurate pricing.

### AI Negotiation with Vehicle Context
The negotiation AI receives:
- Vehicle make/model → model-specific parts pricing
- Cause of damage → policy exclusion detection (wear/tear, DUI, racing → escalate)
- Settlement reasoning includes vehicle context

### UI Components
- Cinematic 3D wheel, light sweeps, inspection bay
- Centered detection cards with damage type + confidence
- 5-stage workflow: Upload → Scan → Report → Negotiate → Done
- Dark automotive theme with electric/cyan accents

---

## Latest Updates (October 22, 2026)

### Workflow Progression & YOLO+Vision Merging (v3.1.0)

**Critical Fixes:**
1. ✅ **Workflow Progression** — Fixed 14-frame assessment to properly transition through workflow stages instead of displaying results inline
2. ✅ **Settlement Button** — Fixed settlement button to use parent callbacks instead of custom events
3. ✅ **YOLO+Vision Merging** — Implemented dual-model detection combining OpenAI Vision (primary) with YOLO (secondary confirmations)
4. ✅ **Confidence Thresholds** — Lowered from 0.25–0.30 to 0.15–0.20 for better damage detection
5. ✅ **Error Handling** — Added defensive null checks to prevent undefined array access crashes

**Files Modified:**
- `src/components/cinematic/VideoFourViewInference.tsx` — Removed inline results display, call parent callback immediately
- `src/pages/ClaimFlowPage.tsx` — Added Array.isArray() checks and fallback values
- `backend/main.py` — Added YOLO merging logic and proper response building
- `backend/integrated_pipeline/config.py` — Lowered confidence thresholds
- `MEMORY.md` — Complete documentation of changes

**Workflow Flow (Now Working):**
```
User uploads video + 4 photos
  → Backend: OpenAI Vision + YOLO detection
  → Results merged (Vision primary, YOLO secondary)
  → Parent transitions: upload → assessing → assessment
  → DamageAnnotation shows results
  → User proceeds to settlement negotiation
  → ✅ Complete workflow working correctly
```

**Testing:**
- Backend: http://127.0.0.1:8000
- Frontend: http://localhost:5174
- All endpoints tested and verified
- No console errors or runtime crashes

---

### Build & Run (CPU)
```bash
docker build -t claimpilot-ai:cpu .
docker run --rm -p 8000:8000 -p 5173:5173 claimpilot-ai:cpu
```

### Docker Compose (Production)
```bash
docker-compose up --build
```

**Services:**
- `backend` — FastAPI on port 8000
- `frontend` — Nginx + Vite preview on port 5173

---

## Project Structure

```
claimpilot-ai/
├── .github/workflows/ci.yml       # GitHub Actions CI/CD
├── backend/
│   ├── main.py                    # FastAPI app (all endpoints)
│   ├── damage_assessment.py       # Policy-driven /assess/ router
│   ├── car_damage_detector.py     # CarDD YOLOv8 wrapper
│   ├── multimodal_assessment.py   # 3+ photos + 1 video collective
│   ├── video_processor.py         # Video frame extraction
│   ├── icici_lombard_screening.py # ICICI Lombard policy screening
│   ├── negotiation_engine.py      # ChatGPT-powered negotiation
│   ├── utils.py                   # Shared utilities
│   ├── requirements.txt           # Python dependencies
│   ├── .env.example               # Environment template
│   ├── agentic/                   # Decision engine
│   │   ├── decision_agent.py      # Policy evaluation
│   │   ├── adapters.py            # CV → signal conversion
│   │   ├── schemas.py             # Pydantic dataclasses
│   │   ├── trace.py               # Decision trace builder
│   │   ├── explainer.py           # Customer explanations
│   │   ├── policy_loader.py       # YAML policy parser
│   │   ├── sop_retriever.py       # SOP section extraction
│   │   ├── rag/simple_retriever.py # Knowledge RAG
│   │   ├── strategies.py          # Repair strategy simulator
│   │   └── vision/                # Inpainting/after-preview
│   ├── policies/                  # Decision policies
│   │   ├── rules.yaml             # Explicit rules
│   │   └── damage_triage.md       # SOP evidence
│   ├── knowledge/                 # RAG knowledge base
│   │   ├── repair_playbook.md
│   │   └── sla_notes.md
│   ├── models/
│   │   └── best.pt                # CarDD-trained YOLOv8n (5.9 MB)
│   ├── tests/
│   │   └── test_api.py            # 28 endpoint tests
│   └── agentic/tests/             # 10 unit tests
├── src/                           # React frontend
│   ├── components/
│   │   ├── cinematic/             # 3D wheel, light sweeps, upload bay
│   │   │   ├── FourViewInference.tsx
│   │   │   ├── VideoFourViewInference.tsx
│   │   │   ├── ICICILombardEligibilityPanel.tsx
│   │   │   └── ...
│   │   └── ui/                    # shadcn/ui components
│   ├── pages/ClaimFlowPage.tsx    # 5-stage workflow
│   ├── lib/
│   │   ├── utils.ts               # API client + helpers
│   │   ├── yoloInference.ts       # ONNX Runtime Web inference
│   │   ├── aiService.ts           # AI negotiation (Gemini/OpenAI/local)
│   │   └── settlementCalculator.ts # Parts database pricing
│   └── ...
├── notebooks/
│   └── train_yolov8_cardd.ipynb   # Model training (Colab)
├── convert_to_onnx.py             # PyTorch → ONNX converter
├── tests/                         # Backend integration tests
├── docs/screenshots/              # UI documentation
├── data/sample_images/            # Test images
├── public/best.onnx               # ONNX model for browser inference
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
├── LICENSE
├── pytest.ini
└── README.md
```

---

## Testing

### Backend Tests
```bash
cd backend
pytest ../tests/test_api.py agentic/tests/ -v
# 38 tests covering:
# - Health checks (root + assess)
# - Image validation
# - Assessment endpoints (general, four-view, hybrid, video-four-view, multimodal)
# - Policy endpoint
# - Error handling
# - Decision agent unit tests (all 10 CarDD classes)
# - RAG retriever
```

### Frontend Linting
```bash
npm run lint
```

### Run All Tests via npm
```bash
npm run backend:test
```

---

## Environment Variables

### Backend (`backend/.env`)
```env
# Model Configuration
AUTOSETTLE_MODEL_PATH=              # Local path to custom model (optional)
AUTOSETTLE_HF_REPO=shanexf/car-damage-yolo11m-ft
AUTOSETTLE_HF_FILENAME=damage_best.pt

# Image Validation Thresholds
AUTOSETTLE_MIN_IMAGE_SIDE=240
AUTOSETTLE_MIN_LAPLACIAN_VARIANCE=18
AUTOSETTLE_NEAR_DUPLICATE_DISTANCE=3
AUTOSETTLE_LOW_CONFIDENCE_THRESHOLD=0.40

# Hybrid AI (Optional)
AI_PROVIDER=gemini                  # or openai
GEMINI_API_KEY=                     # Required if AI_PROVIDER=gemini
GEMINI_MODEL=gemini-1.5-flash-latest
OPENAI_API_KEY=                     # Required if AI_PROVIDER=openai / negotiation
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

## Key Features Summary

| Feature | Description |
|---------|-------------|
| **Deduplicated Video Assessment** | 14 images → unique damage instances only |
| **Policy-Driven Decisions** | Deterministic rules.yaml, no LLM in core decision |
| **Full Audit Trail** | Decision trace with SOP references |
| **Human Override** | Governance-compliant override with reasons |
| **Local Browser Inference** | ONNX Runtime Web, 100% client-side |
| **Vehicle-Specific Pricing** | Parts database with make/model costs |
| **ICICI Lombard Screening** | Policy terms, CTL thresholds, exclusions |
| **AI Negotiation** | ChatGPT/Gemini with vehicle context awareness |
| **Exclusion Detection** | Wear/tear, DUI, racing → auto-escalate |
| **Cinematic UI** | 3D wheel, light sweeps, dark automotive theme |

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- **CarDD Dataset**: USTC Car Damage Detection dataset
- **Ultralytics**: YOLOv8 framework
- **FastAPI**: Modern Python web framework
- **React/Vite/Tailwind**: Frontend stack
- **shadcn/ui**: Accessible component library
- **ONNX Runtime Web**: Browser inference