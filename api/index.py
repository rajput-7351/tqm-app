import io
import os
import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.metrics import confusion_matrix, roc_auc_score, average_precision_score
from sklearn.inspection import permutation_importance

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "defect_model.joblib")
ARTIFACT = joblib.load(MODEL_PATH)
PIPELINE = ARTIFACT["pipeline"]
FEATURES = ARTIFACT["features"]
DEFAULT_THRESHOLD = float(ARTIFACT["threshold"])


class UnitRecord(BaseModel):
    machine: str
    shift: str
    supplier: str
    operator_exp_yrs: float
    tool_wear_pct: float
    spindle_temp_c: float
    vibration_mm_s: float
    coolant_conc_pct: float
    humidity_pct: float
    days_since_gauge_cal: int
    days_since_pm: int
    threshold: float = DEFAULT_THRESHOLD


@app.post("/api/predict-single")
def predict_single(record: UnitRecord):
    data = record.model_dump()
    thresh = data.pop("threshold")
    df = pd.DataFrame([data])[FEATURES]
    prob = float(PIPELINE.predict_proba(df)[0, 1])
    return {
        "reject_probability": round(prob, 4),
        "flag_for_inspection": prob >= thresh,
        "threshold_used": thresh,
    }


@app.post("/api/analyze-csv")
async def analyze_csv(
    file: UploadFile = File(...),
    cost_escape: float = Form(450.0),
    cost_false_alarm: float = Form(25.0),
):
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))

    missing = [col for col in FEATURES if col not in df.columns]
    if missing:
        return {"error": f"Missing required columns in CSV: {missing}"}

    X = df[FEATURES]
    probs = PIPELINE.predict_proba(X)[:, 1]
    df["reject_probability"] = np.round(probs, 4)

    has_labels = "rejected" in df.columns
    threshold = DEFAULT_THRESHOLD
    metrics = {}
    drivers = []

    if has_labels:
        y_true = df["rejected"].astype(int).values
        ths = np.linspace(0.02, 0.80, 79)
        costs = []
        for t in ths:
            tn, fp, fn, tp = confusion_matrix(y_true, probs >= t).ravel()
            costs.append(fn * cost_escape + fp * cost_false_alarm)

        best_idx = int(np.argmin(costs))
        threshold = float(round(ths[best_idx], 3))
        tn, fp, fn, tp = confusion_matrix(y_true, probs >= threshold).ravel()
        base_cost = float(y_true.sum() * cost_escape)
        opt_cost = float(costs[best_idx])

        metrics = {
            "roc_auc": round(float(roc_auc_score(y_true, probs)), 3),
            "pr_auc": round(float(average_precision_score(y_true, probs)), 3),
            "recall": round(float(tp / max(tp + fn, 1)), 4),
            "precision": round(float(tp / max(tp + fp, 1)), 4),
            "baseline_cost": round(base_cost, 2),
            "optimized_cost": round(opt_cost, 2),
            "net_savings": round(base_cost - opt_cost, 2),
            "savings_pct": round((1 - opt_cost / max(base_cost, 1)) * 100, 1),
        }

        sample_idx = np.random.choice(len(X), min(len(X), 1500), replace=False)
        imp = permutation_importance(
            PIPELINE, X.iloc[sample_idx], y_true[sample_idx],
            scoring="average_precision", n_repeats=3, random_state=42
        )
        imp_series = pd.Series(imp.importances_mean, index=FEATURES).sort_values(ascending=False)
        drivers = [
            {"feature": feat, "importance": round(float(val), 4)}
            for feat, val in imp_series.items()
        ]
    else:
        expected_defects = float(probs.sum())
        base_cost = expected_defects * cost_escape
        flagged = probs >= threshold
        expected_fn_cost = float(probs[~flagged].sum() * cost_escape)
        expected_fp_cost = float((1 - probs[flagged]).sum() * cost_false_alarm)
        opt_cost = expected_fn_cost + expected_fp_cost
        metrics = {
            "baseline_cost": round(base_cost, 2),
            "optimized_cost": round(opt_cost, 2),
            "net_savings": round(base_cost - opt_cost, 2),
            "savings_pct": round((1 - opt_cost / max(base_cost, 1)) * 100, 1),
        }

    df["flagged"] = probs >= threshold

    pareto = []
    if "defect_type" in df.columns and has_labels:
        counts = df[df["rejected"] == 1]["defect_type"].value_counts()
    else:
        flagged_df = df[df["flagged"]]
        counts = (flagged_df["machine"] + " / " + flagged_df["supplier"]).value_counts()

    if len(counts) > 0:
        cum_pct = (counts.cumsum() / counts.sum() * 100).round(1)
        for label, cnt in counts.items():
            pareto.append({
                "category": str(label),
                "count": int(cnt),
                "cumulative_pct": float(cum_pct[label]),
            })

    top_risk_rows = (
        df.sort_values("reject_probability", ascending=False)
        .head(100)
        .to_dict(orient="records")
    )

    return {
        "total_rows": len(df),
        "flagged_count": int(df["flagged"].sum()),
        "flagged_rate_pct": round(float(df["flagged"].mean() * 100), 2),
        "threshold_used": threshold,
        "has_ground_truth": has_labels,
        "metrics": metrics,
        "pareto": pareto,
        "drivers": drivers,
        "top_risk_units": top_risk_rows,
    }