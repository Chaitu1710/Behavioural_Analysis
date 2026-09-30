"""
Digital Behavioral Fingerprinting & Web Analytics System
FastAPI Machine Learning Service (main.py)

Exposes REST Endpoints:
- POST /api/profile (PCA variance reduction, K-Means clustering)
- POST /api/detect-anomaly (Mahalanobis distance, Isolation Forest anomaly detection)
- GET /health
"""

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import logging

from pipeline import ml_pipeline

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MLEngine")

app = FastAPI(
  title="Behavioral Machine Learning Engine",
  description="FastAPI service for PCA dimensionality reduction, K-Means clustering, and Mahalanobis anomaly detection.",
  version="1.0.0"
)

# Enable CORS for Node Express backend & React frontend
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# ----------------------------------------------------
# PYDANTIC SCHEMAS
# ----------------------------------------------------

class TelemetryRecord(BaseModel):
    userId: Optional[str] = "usr_anonymous"
    sessionId: Optional[str] = "sess_default"
    activeTabDuration: float = Field(0.0, ge=0.0)
    domainSwitches: int = Field(0, ge=0)
    idleStateDuration: float = Field(0.0, ge=0.0)
    scrollVelocity: float = Field(0.0, ge=0.0)
    mouseActivityScore: float = Field(0.0, ge=0.0)
    activeHour: int = Field(12, ge=0, le=23)
    currentDomain: Optional[str] = "unknown"
    timestamp: Optional[str] = None

class ProfileRequest(BaseModel):
    records: List[TelemetryRecord]

class AnomalyDetectionResponse(BaseModel):
    anomaly_score: float
    is_anomaly: bool
    mahalanobis_distance: float
    cluster_id: int
    archetype: str

# ----------------------------------------------------
# API ROUTES
# ----------------------------------------------------

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Behavioral ML Engine",
        "is_model_fitted": ml_pipeline.is_fitted
    }

@app.post("/api/profile")
def generate_behavioral_profile(payload: ProfileRequest):
    """
    Exposes profiling endpoint: fits scaler, PCA (>=85% variance), and K-Means.
    Returns archetype centroids and 2D PCA point dataset for chart rendering.
    """
    records_dict = [r.model_dump() for r in payload.records]
    
    if len(records_dict) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Minimum of 4 telemetry records required to compute PCA and K-Means clusters."
        )

    try:
        results = ml_pipeline.fit(records_dict)
        logger.info(f"Fitted ML pipeline on {len(records_dict)} records. PCA components: {results['n_components']}")
        return {
            "success": True,
            **results
        }
    except Exception as e:
        logger.error(f"Error fitting ML pipeline: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fit ML profile pipeline: {str(e)}"
        )

@app.post("/api/detect-anomaly", response_model=AnomalyDetectionResponse)
def detect_behavioral_anomaly(record: TelemetryRecord):
    """
    Evaluates real-time anomaly score for an incoming telemetry event using Mahalanobis distance
    against K-Means cluster centroids & Isolation Forest.
    """
    try:
        record_dict = record.model_dump()
        result = ml_pipeline.detect_anomaly(record_dict)
        return result
    except Exception as e:
        logger.error(f"Error calculating anomaly score: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Anomaly detection calculation failed: {str(e)}"
        )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
