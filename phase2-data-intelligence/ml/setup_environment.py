#!/usr/bin/env python3
"""
ML Pipeline Setup for Claude Max API Analytics
Phase 2: Model preparation and feature engineering
"""

import os
import json
from datetime import datetime
from pathlib import Path

def setup_ml_environment():
    """Initialize ML environment and dependencies"""
    
    requirements = {
        "core": [
            "numpy>=1.24.0",
            "pandas>=2.0.0",
            "scikit-learn>=1.3.0",
            "duckdb>=0.9.0",
        ],
        "ml": [
            "tensorflow>=2.14.0",
            "xgboost>=2.0.0",
            "lightgbm>=4.0.0",
        ],
        "data": [
            "pyarrow>=13.0.0",
            "polars>=0.19.0",
        ],
        "utils": [
            "python-dotenv>=1.0.0",
            "pydantic>=2.0.0",
            "pydantic-settings>=2.0.0",
        ]
    }
    
    config = {
        "timestamp": datetime.now().isoformat(),
        "ml_models": {
            "performance_predictor": {
                "type": "regression",
                "features": [
                    "usage_frequency",
                    "avg_response_time",
                    "error_rate",
                    "code_quality_score"
                ],
                "target": "performance_score"
            },
            "adoption_classifier": {
                "type": "classification",
                "features": [
                    "stars_growth",
                    "fork_growth",
                    "maintenance_activity"
                ],
                "target": "adoption_class"
            },
            "anomaly_detector": {
                "type": "unsupervised",
                "algorithm": "isolation_forest",
                "contamination": 0.1
            }
        },
        "feature_store": {
            "backend": "duckdb",
            "update_frequency_hours": 1,
            "retention_days": 90
        }
    }
    
    return requirements, config

def create_feature_engineering_pipeline():
    """Define feature engineering transformations"""
    
    pipeline_spec = {
        "stages": [
            {
                "name": "hunter_aggregation",
                "type": "aggregation",
                "window_days": 7,
                "metrics": [
                    "stars_growth",
                    "fork_growth",
                    "commit_frequency"
                ]
            },
            {
                "name": "api_metrics_aggregation",
                "type": "time_series",
                "window_minutes": 60,
                "metrics": [
                    "request_rate",
                    "avg_response_time",
                    "p95_response_time",
                    "error_rate"
                ]
            },
            {
                "name": "feature_normalization",
                "type": "scaling",
                "method": "standard_scaler",
                "fit_on_training_data": True
            },
            {
                "name": "feature_selection",
                "type": "selection",
                "method": "recursive_feature_elimination",
                "n_features": 15
            }
        ],
        "output_features": [
            "engagement_index",
            "quality_score",
            "adoption_potential",
            "performance_stability"
        ]
    }
    
    return pipeline_spec

if __name__ == "__main__":
    req, cfg = setup_ml_environment()
    pipeline = create_feature_engineering_pipeline()
    
    print(f"ML Environment initialized at {cfg['timestamp']}")
    print(f"Pipeline stages: {len(pipeline['stages'])}")
    print(f"Output features: {len(pipeline['output_features'])}")
