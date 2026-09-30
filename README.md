# Digital Behavioral Fingerprinting & Web Analytics System

A full-stack cybersecurity analytics system that captures passive browser interactions, ingests telemetry via a REST API, processes feature scaling & PCA dimensionality reduction in Python, assigns user session archetypes with K-Means clustering, detects behavioral anomalies using Mahalanobis distance & Isolation Forest, and visualizes live telemetry metrics on a React dashboard.

---

## 🏗️ System Architecture & Architecture Stack

```
 ┌──────────────────────────────────┐
 │ Chrome Extension (Manifest V3)   │
 │ - Tab duration & domain switches │
 │ - Scroll velocity & focus state  │
 └─────────────────┬────────────────┘
                   │ HTTP POST (http://localhost:5000/api/telemetry)
                   ▼
 ┌──────────────────────────────────┐        HTTP POST        ┌──────────────────────────────────┐
 │ Express.js Ingestion API         │ ──────────────────────► │ Python FastAPI ML Engine         │
 │ - Node.js REST endpoints         │                         │ - StandardScaler                 │
 │ - MongoDB / In-Memory Store      │ ◄────────────────────── │ - PCA (>=85% Variance)           │
 └─────────────────┬────────────────┘       Calculated        │ - K-Means Archetype Clusters     │
                   │                       Anomaly Score      │ - Mahalanobis Distance / IsoForest│
                   │ GET /api/telemetry                       └──────────────────────────────────┘
                   ▼
 ┌──────────────────────────────────┐
 │ React Dashboard (Vite + Tailwind)│
 │ - Recharts PCA 2D Scatter Plot   │
 │ - 24-Hour Active Hours Heatmap   │
 │ - Continuous Anomaly Stream Log  │
 │ - Interactive Payload Simulator  │
 └──────────────────────────────────┘
```

---

## 📁 Project Directory Structure

```
/Behavorial_analysis
├── extension/
│   ├── manifest.json       # Manifest V3 (tabs, idle, storage permissions)
│   ├── background.js      # Tab switching, idle listener & API flusher
│   └── content.js         # Scroll velocity, key/mouse event tracking
│
├── backend-express/
│   ├── server.js          # Express API server & Mongoose setup
│   ├── models/
│   │   └── Telemetry.js   # Telemetry Schema definition
│   └── package.json       # Node.js dependencies
│
├── ml-engine/
│   ├── main.py            # FastAPI service exposing /api/profile & /api/detect-anomaly
│   ├── pipeline.py        # StandardScaler, PCA, KMeans, Mahalanobis Distance
│   └── requirements.txt   # Python ML dependencies
│
└── frontend-dashboard/
    ├── index.html         # HTML template
    ├── vite.config.js     # Vite dev server configuration
    ├── package.json       # React & Recharts dependencies
    └── src/
        ├── main.jsx       # React DOM entrypoint
        ├── index.css      # Dark glassmorphism design system
        └── App.jsx        # Complete interactive dashboard UI
```

---

## 🧮 Mathematical ML Pipeline Specifications

1. **Standard Z-Score Feature Scaling:**
   $$\mathbf{z} = \frac{\mathbf{x} - \boldsymbol{\mu}}{\boldsymbol{\sigma}}$$
   Standardizes features (`activeTabDuration`, `domainSwitches`, `idleStateDuration`, `scrollVelocity`, `mouseActivityScore`, `activeHour`) to have zero mean and unit variance.

2. **Principal Component Analysis (PCA):**
   Selects $k$ components dynamically such that cumulative explained variance ratio $\sum_{i=1}^k \lambda_i / \sum \lambda \ge 0.85$.

3. **Mahalanobis Distance Anomaly Scoring:**
   $$D_M(\mathbf{x}) = \sqrt{(\mathbf{x} - \boldsymbol{\mu}_k)^T \boldsymbol{\Sigma}^{-1} (\mathbf{x} - \boldsymbol{\mu}_k)}$$
   Measures statistical distance from sample $\mathbf{x}$ to its assigned K-Means cluster centroid $\boldsymbol{\mu}_k$, taking into account covariance between behavioral features.

---

## 🚀 How to Run the Project

### 1. Python ML Engine (Port 8000)
```bash
cd ml-engine
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python main.py
```

### 2. Node.js Express Backend (Port 5000)
```bash
cd backend-express
npm install
npm run dev
```

### 3. React Dashboard (Port 5173)
```bash
cd frontend-dashboard
npm install
npm run dev
```

### 4. Chrome Extension Installation
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** toggle in the upper-right corner.
3. Click **Load unpacked** and select the `/extension` directory.

---

## 📡 Key API Routes

- `POST /api/telemetry` — Ingest raw telemetry event & return enriched real-time anomaly score.
- `GET /api/telemetry` — Query stored telemetry logs.
- `GET /api/profile` — Proxy request to Python ML engine for PCA & K-Means clustering.
- `POST /api/telemetry/seed` — Generate sample synthetic records for immediate visualization.
