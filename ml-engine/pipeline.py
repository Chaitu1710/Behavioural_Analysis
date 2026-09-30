"""
Digital Behavioral Fingerprinting & Web Analytics System
Machine Learning Pipeline (pipeline.py)

Mathematical Core:
1. Z-Score Scaling (StandardScaler)
2. PCA (Principal Component Analysis retaining >= 85% variance)
3. K-Means Clustering for Archetype Profiling
4. Mahalanobis Distance & Isolation Forest for Anomaly Detection
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from scipy.spatial.distance import mahalanobis


class BehavioralMLPipeline:
    def __init__(self, n_clusters: int = 4, target_variance: float = 0.85):
        self.n_clusters = n_clusters
        self.target_variance = target_variance
        
        # Models & Scalers
        self.scaler = StandardScaler()
        self.pca = None
        self.kmeans = None
        self.iso_forest = None
        
        # State
        self.is_fitted = False
        self.feature_names = [
            'activeTabDuration',
            'domainSwitches',
            'idleStateDuration',
            'scrollVelocity',
            'mouseActivityScore',
            'activeHour'
        ]
        
        # Cluster Centroids & Covariance Matrix for Mahalanobis Distance
        self.cluster_centroids = None
        self.inv_cov_matrix = None
        self.archetype_labels = {
            0: "Focused Researcher",
            1: "Context Switcher",
            2: "Passive Lurker",
            3: "Anomalous Explorer"
        }

    def _extract_feature_matrix(self, records: List[Dict[str, Any]]) -> pd.DataFrame:
        """Extracts and formats numeric feature matrix from telemetry records."""
        df = pd.DataFrame(records)
        
        # Ensure all feature columns exist with defaults
        for col in self.feature_names:
            if col not in df.columns:
                df[col] = 0.0
                
        # Fill missing values and ensure float type
        X_df = df[self.feature_names].fillna(0.0).astype(float)
        return X_df

    def fit(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Fits the ML Pipeline on historical telemetry data:
        1. Standard Z-Score scaling
        2. PCA retaining >= 85% variance
        3. K-Means clustering
        4. Isolation Forest & Covariance estimation for Mahalanobis distance
        """
        if len(records) < 4:
            raise ValueError("At least 4 telemetry records are required to train the ML pipeline.")

        X_df = self._extract_feature_matrix(records)
        
        # 1. Z-Score Scaling
        X_scaled = self.scaler.fit_transform(X_df)
        
        # 2. PCA: Dynamically determine n_components to explain >= target_variance (85%)
        # First fit full PCA to evaluate variance ratio
        full_pca = PCA()
        full_pca.fit(X_scaled)
        cum_variance = np.cumsum(full_pca.explained_variance_ratio_)
        
        # Find minimum components that reach >= 85% variance (or at least 2 for visualization)
        n_components_req = np.argmax(cum_variance >= self.target_variance) + 1
        n_components_final = max(2, min(n_components_req, X_scaled.shape[1]))
        
        self.pca = PCA(n_components=n_components_final)
        X_pca = self.pca.fit_transform(X_scaled)
        
        explained_variance = self.pca.explained_variance_ratio_.tolist()
        total_variance_explained = float(np.sum(explained_variance))

        # 3. K-Means Clustering for Behavioral Archetypes
        actual_clusters = min(self.n_clusters, len(records))
        self.kmeans = KMeans(n_clusters=actual_clusters, random_state=42, n_init=10)
        cluster_labels = self.kmeans.fit_predict(X_scaled)
        self.cluster_centroids = self.kmeans.cluster_centers_

        # 4. Covariance matrix for Mahalanobis Distance computation
        cov_matrix = np.cov(X_scaled, rowvar=False)
        # Regularize matrix to prevent singularity if variance is near 0
        cov_matrix += np.eye(cov_matrix.shape[0]) * 1e-6
        self.inv_cov_matrix = np.linalg.pinv(cov_matrix)

        # 5. Isolation Forest for Ensemble Anomaly Detection
        self.iso_forest = IsolationForest(contamination=0.12, random_state=42)
        self.iso_forest.fit(X_scaled)

        self.is_fitted = True

        # Generate Archetype Descriptions based on cluster centroids
        archetype_summary = []
        for i in range(actual_clusters):
            centroid = self.scaler.inverse_transform(self.cluster_centroids[i].reshape(1, -1))[0]
            count = int(np.sum(cluster_labels == i))
            archetype_name = self.archetype_labels.get(i, f"Archetype {i+1}")
            
            archetype_summary.append({
                "cluster_id": i,
                "name": archetype_name,
                "count": count,
                "centroid_features": {
                    "activeTabDuration": round(float(centroid[0]), 2),
                    "domainSwitches": round(float(centroid[1]), 2),
                    "idleStateDuration": round(float(centroid[2]), 2),
                    "scrollVelocity": round(float(centroid[3]), 2),
                    "mouseActivityScore": round(float(centroid[4]), 2),
                    "activeHour": round(float(centroid[5]), 1)
                }
            })

        # Format 2D PCA point dataset for Scatter Chart in Frontend
        pca_chart_points = []
        for i in range(len(records)):
            pca_chart_points.append({
                "x": round(float(X_pca[i, 0]), 3),
                "y": round(float(X_pca[i, 1]), 3),
                "cluster_id": int(cluster_labels[i]),
                "archetype": self.archetype_labels.get(int(cluster_labels[i]), "Standard User"),
                "userId": records[i].get("userId", "usr_unknown"),
                "domain": records[i].get("currentDomain", "unknown")
            })

        return {
            "total_variance_explained": round(total_variance_explained, 4),
            "explained_variance_ratio": [round(float(v), 4) for v in explained_variance],
            "n_components": n_components_final,
            "archetypes": archetype_summary,
            "pca_chart_points": pca_chart_points
        }

    def compute_mahalanobis_distance(self, x_scaled: np.ndarray, cluster_id: int) -> float:
        """Calculates Mahalanobis distance of sample x_scaled to assigned cluster centroid."""
        if self.cluster_centroids is None or self.inv_cov_matrix is None:
            return 0.0
        centroid = self.cluster_centroids[cluster_id]
        delta = x_scaled - centroid
        try:
            dist = mahalanobis(x_scaled, centroid, self.inv_cov_matrix)
            return float(dist)
        except Exception:
            # Fallback to Euclidean distance if numerical matrix inversion encounters singular error
            return float(np.linalg.norm(delta))

    def detect_anomaly(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Detects behavioral anomalies for a single telemetry record using:
        1. Distance against K-Means cluster centroid in Z-scaled space
        2. Isolation Forest score
        3. Mahalanobis distance metric
        """
        if not self.is_fitted:
            # Quick heuristic fallback if model not trained yet
            domain_switches = float(record.get('domainSwitches', 0))
            scroll_vel = float(record.get('scrollVelocity', 0))
            active_hr = float(record.get('activeHour', 12))
            
            raw_score = (domain_switches * 5) + (scroll_vel / 20) + (25 if active_hr < 5 else 0)
            score = min(100.0, max(0.0, raw_score))
            return {
                "anomaly_score": round(score, 2),
                "is_anomaly": score > 60.0,
                "mahalanobis_distance": round(score / 15.0, 3),
                "cluster_id": 0,
                "archetype": "Unfitted Baseline"
            }

        X_df = self._extract_feature_matrix([record])
        X_scaled = self.scaler.transform(X_df)[0]

        # Predict nearest cluster
        cluster_id = int(self.kmeans.predict(X_scaled.reshape(1, -1))[0])
        archetype_name = self.archetype_labels.get(cluster_id, "Standard User")

        # Mahalanobis Distance calculation
        m_dist = self.compute_mahalanobis_distance(X_scaled, cluster_id)

        # Isolation Forest anomaly score (-1 for anomaly, 1 for normal)
        iso_score = float(self.iso_forest.score_samples(X_scaled.reshape(1, -1))[0])
        # Iso score is typically in range [-0.8, 0.2]. Map to 0-100 anomaly scale
        iso_anomaly_component = max(0.0, min(100.0, (0.2 - iso_score) * 100))

        # Mahalanobis component (scaled: m_dist > 3.0 indicates significant deviation)
        m_anomaly_component = max(0.0, min(100.0, (m_dist / 4.0) * 100))

        # Composite Anomaly Score (weighted ensemble)
        composite_score = (0.55 * m_anomaly_component) + (0.45 * iso_anomaly_component)
        final_anomaly_score = round(float(np.clip(composite_score, 0.0, 100.0)), 2)

        # Threshold: Score >= 65.0 is flagged as an anomaly
        is_anomaly = bool(final_anomaly_score >= 65.0)

        return {
            "anomaly_score": final_anomaly_score,
            "is_anomaly": is_anomaly,
            "mahalanobis_distance": round(m_dist, 3),
            "isolation_score": round(iso_score, 4),
            "cluster_id": cluster_id,
            "archetype": archetype_name
        }


# Global Singleton Pipeline Instance
ml_pipeline = BehavioralMLPipeline()
