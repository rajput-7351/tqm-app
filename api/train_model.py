import os
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import confusion_matrix

SEED = 42
rng = np.random.default_rng(SEED)
N = 40000
COST_ESCAPE = 450
COST_FALSE_ALARM = 25


def make_data(n=N):
    df = pd.DataFrame({
        "machine": rng.choice(["M1", "M2", "M3", "M4"], n, p=[.30, .30, .25, .15]),
        "shift": rng.choice(["A", "B", "C"], n, p=[.40, .35, .25]),
        "supplier": rng.choice(["S1", "S2", "S3"], n, p=[.50, .30, .20]),
        "operator_exp_yrs": rng.gamma(3, 1.5, n).clip(0.2, 15),
        "tool_wear_pct": rng.beta(2, 3, n) * 100,
        "spindle_temp_c": rng.normal(62, 6, n),
        "vibration_mm_s": rng.gamma(4, 0.6, n),
        "coolant_conc_pct": rng.normal(8, 1.2, n),
        "humidity_pct": rng.normal(55, 10, n),
        "days_since_gauge_cal": rng.integers(0, 90, n),
        "days_since_pm": rng.integers(0, 60, n),
    })
    z = (
        -6.4
        + 0.050 * df.tool_wear_pct
        + 0.14 * (df.spindle_temp_c - 62).clip(0)
        + 0.60 * (df.vibration_mm_s - 2.4).clip(0)
        - 0.20 * df.operator_exp_yrs
        + 1.50 * (df.supplier == "S3")
        + 1.00 * (df.machine == "M4")
        + 0.60 * (df.shift == "C")
        + 0.020 * df.days_since_pm
        + 0.90 * (df.coolant_conc_pct < 6.5)
        + 0.02 * (df.humidity_pct - 60).clip(0)
    )
    df["rejected"] = (rng.random(n) < 1 / (1 + np.exp(-z))).astype(int)

    types = [
        "Dimensional deviation", "Surface scratches", "Burrs/flash",
        "Porosity/voids", "Misassembly", "Coating defect", "Cracks", "Others"
    ]
    base = np.array([32, 22, 15, 12, 8, 5, 3.5, 2.5], dtype=float)
    labels = np.full(n, "OK", dtype=object)
    for i in np.where(df.rejected == 1)[0]:
        w = base.copy()
        if df.tool_wear_pct[i] > 60:
            w[[0, 2]] *= 1.6
        if df.vibration_mm_s[i] > 3.5:
            w[1] *= 1.6
        if df.supplier[i] == "S3":
            w[3] *= 2.0
        if df.operator_exp_yrs[i] < 1.5:
            w[4] *= 1.8
        labels[i] = rng.choice(types, p=w / w.sum())
    df["defect_type"] = labels
    return df


if __name__ == "__main__":
    df = make_data()
    os.makedirs("public", exist_ok=True)
    df.head(1500).to_csv("public/sample_plant_data.csv", index=False)

    features = [c for c in df.columns if c not in ("rejected", "defect_type")]
    cat = ["machine", "shift", "supplier"]
    num = [c for c in features if c not in cat]
    X, y = df[features], df.rejected
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, stratify=y, random_state=SEED)

    pre = ColumnTransformer([
        ("num", StandardScaler(), num),
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat),
    ])
    model = HistGradientBoostingClassifier(learning_rate=0.05, max_depth=4, max_iter=300, random_state=SEED)
    pipe = Pipeline([("pre", pre), ("model", model)]).fit(X_tr, y_tr)

    p = pipe.predict_proba(X_te)[:, 1]
    ths = np.linspace(0.02, 0.8, 79)
    costs = [
        (lambda tn, fp, fn, tp: fn * COST_ESCAPE + fp * COST_FALSE_ALARM)(
            *confusion_matrix(y_te, p >= t).ravel()
        )
        for t in ths
    ]
    t_best = float(ths[int(np.argmin(costs))])

    os.makedirs("api", exist_ok=True)
    joblib.dump({"pipeline": pipe, "threshold": t_best, "features": features}, "api/defect_model.joblib")
    print("Saved api/defect_model.joblib and public/sample_plant_data.csv")