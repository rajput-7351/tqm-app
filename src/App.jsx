import React, { useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, BarChart, CartesianGrid
} from "recharts";
import { Upload, AlertTriangle, CheckCircle, IndianRupee, Sliders, Play, Database } from "lucide-react";

export default function App() {
  const [tab, setTab] = useState("batch");
  const [file, setFile] = useState(null);
  const [costEscape, setCostEscape] = useState(450);
  const [costFalseAlarm, setCostFalseAlarm] = useState(25);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Single unit simulator state
  const [unit, setUnit] = useState({
    machine: "M4",
    shift: "C",
    supplier: "S3",
    operator_exp_yrs: 0.8,
    tool_wear_pct: 75,
    spindle_temp_c: 70,
    vibration_mm_s: 4.0,
    coolant_conc_pct: 6.0,
    humidity_pct: 65,
    days_since_gauge_cal: 80,
    days_since_pm: 50,
  });
  const [singleResult, setSingleResult] = useState(null);

const handleAnalyze = async (uploadedFile = file) => {
    if (!uploadedFile) return;
    setLoading(true);
    setError("");
    try {
      let fileToSend = uploadedFile;

      // Vercel serverless functions have a hard 4.5 MB payload limit.
      // If the CSV is larger than 3.8 MB, slice the top ~25,000 rows in-browser.
      const MAX_BYTES = 3.8 * 1024 * 1024;
      if (uploadedFile.size > MAX_BYTES) {
        const rawText = await uploadedFile.text();
        const lines = rawText.split(/\r?\n/);
        const header = lines[0];
        const sampledLines = [header];
        let currentBytes = header.length;

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          currentBytes += lines[i].length + 1;
          if (currentBytes > MAX_BYTES) break;
          sampledLines.push(lines[i]);
        }

        const trimmedCsv = sampledLines.join("\n");
        fileToSend = new File([trimmedCsv], uploadedFile.name, { type: "text/csv" });
      }

      const formData = new FormData();
      formData.append("file", fileToSend);
      formData.append("cost_escape", costEscape);
      formData.append("cost_false_alarm", costFalseAlarm);

      const res = await fetch("/api/analyze-csv", { method: "POST", body: formData });
      const text = await res.text();
      if (!res.ok) {
        setError(`Server Error (${res.status}): ${text.slice(0, 200)}`);
        setLoading(false);
        return;
      }
      const data = JSON.parse(text);
      if (data.error) {
        setError(data.error);
      } else {
        setAnalysis(data);
      }
    } catch (err) {
      setError(`Network Error: ${err.message}`);
    }
    setLoading(false);
  };

  const loadSampleDataset = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/sample_plant_data.csv");
      const blob = await res.blob();
      const sampleFile = new File([blob], "sample_plant_data.csv", { type: "text/csv" });
      setFile(sampleFile);
      await handleAnalyze(sampleFile);
    } catch (err) {
      setError("Sample dataset not found. Upload any CSV with the required columns.");
      setLoading(false);
    }
  };

  const handlePredictSingle = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/predict-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(unit),
    });
    const data = await res.json();
    setSingleResult(data);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-4 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              TQM Defect & Quality Cost Analyzer
            </h1>
            <p className="text-sm text-slate-400">
              Six Sigma Predictive Inspection • Pareto & Fishbone Root-Cause Engine
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setTab("batch")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                tab === "batch" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              CSV Batch Analysis
            </button>
            <button
              onClick={() => setTab("single")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                tab === "single" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Single Unit Simulator
            </button>
          </div>
        </header>

        {tab === "batch" ? (
          <>
            {/* Upload & Cost Controls */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition">
                    <Upload size={16} />
                    {file ? file.name : "Upload New Plant CSV"}
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files[0];
                        if (f) {
                          setFile(f);
                          handleAnalyze(f);
                        }
                      }}
                    />
                  </label>

                  <button
                    onClick={loadSampleDataset}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border border-slate-700 transition"
                  >
                    <Database size={16} />
                    Load Sample Dataset
                  </button>
                </div>

                <button
                  onClick={() => handleAnalyze()}
                  disabled={!file || loading}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white py-2 px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition"
                >
                  <Sliders size={16} />
                  {loading ? "Analyzing..." : "Recalculate Cost & Threshold"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-800">
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 flex justify-between">
                    <span>Escape Cost (Rework / Warranty)</span>
                    <span className="text-amber-400 font-semibold">₹{costEscape}</span>
                  </label>
                  <input
                    type="range" min="100" max="2000" step="25" value={costEscape}
                    onChange={(e) => setCostEscape(Number(e.target.value))}
                    className="w-full mt-2 accent-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 flex justify-between">
                    <span>False Alarm Inspection Cost</span>
                    <span className="text-emerald-400 font-semibold">₹{costFalseAlarm}</span>
                  </label>
                  <input
                    type="range" min="5" max="200" step="5" value={costFalseAlarm}
                    onChange={(e) => setCostFalseAlarm(Number(e.target.value))}
                    className="w-full mt-2 accent-blue-500"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/40 text-red-300 p-4 rounded-xl text-sm">
                {error}
              </div>
            )}

            {analysis && (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    title="Units Flagged"
                    value={`${analysis.flagged_count} / ${analysis.total_rows}`}
                    sub={`${analysis.flagged_rate_pct}% inspection load`}
                    icon={<AlertTriangle className="text-amber-400" size={20} />}
                  />
                  <KpiCard
                    title="Net Quality Savings"
                    value={`₹${analysis.metrics.net_savings.toLocaleString()}`}
                    sub={`${analysis.metrics.savings_pct}% cost reduction`}
                    icon={<IndianRupee className="text-emerald-400" size={20} />}
                  />
                  <KpiCard
                    title="Optimal Threshold"
                    value={analysis.threshold_used}
                    sub={analysis.has_ground_truth ? `PR-AUC: ${analysis.metrics.pr_auc}` : "Cost-calibrated"}
                    icon={<Sliders className="text-blue-400" size={20} />}
                  />
                  <KpiCard
                    title="Top Root-Cause Driver"
                    value={analysis.drivers[0]?.feature || "N/A"}
                    sub={analysis.drivers[0] ? `Importance: ${analysis.drivers[0].importance}` : "Requires 'rejected' column"}
                    icon={<CheckCircle className="text-purple-400" size={20} />}
                  />
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <h2 className="text-base font-semibold mb-4">Pareto Analysis (80/20 Defect Drivers)</h2>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={analysis.pareto}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="category" stroke="#94a3b8" fontSize={11} />
                          <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} />
                          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#f87171" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                          <Bar yAxisId="left" dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="cumulative_pct" stroke="#ef4444" strokeWidth={2} dot />
                          <ReferenceLine yAxisId="right" y={80} stroke="#64748b" strokeDasharray="4 4" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <h2 className="text-base font-semibold mb-4">Fishbone Input: Rejection Drivers</h2>
                    <div className="h-72">
                      {analysis.drivers.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analysis.drivers.slice(0, 8)} layout="vertical" margin={{ left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                            <YAxis type="category" dataKey="feature" stroke="#94a3b8" fontSize={11} width={115} />
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                            <Bar dataKey="importance" fill="#10b981" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                          Include the ground-truth "rejected" column in your CSV to compute feature importance.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* High-Risk Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 overflow-x-auto">
                  <h2 className="text-base font-semibold mb-3">Top 100 Highest-Risk Units</h2>
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Risk Prob</th>
                        <th className="py-2 px-3">Action</th>
                        <th className="py-2 px-3">Machine</th>
                        <th className="py-2 px-3">Shift</th>
                        <th className="py-2 px-3">Supplier</th>
                        <th className="py-2 px-3">Tool Wear</th>
                        <th className="py-2 px-3">Vibration</th>
                        <th className="py-2 px-3">Spindle °C</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {analysis.top_risk_units.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-semibold text-amber-400">
                            {(row.reject_probability * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              row.flagged ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"
                            }`}>
                              {row.flagged ? "INSPECT" : "PASS"}
                            </span>
                          </td>
                          <td className="py-2 px-3">{row.machine}</td>
                          <td className="py-2 px-3">{row.shift}</td>
                          <td className="py-2 px-3">{row.supplier}</td>
                          <td className="py-2 px-3">{Number(row.tool_wear_pct).toFixed(1)}%</td>
                          <td className="py-2 px-3">{Number(row.vibration_mm_s).toFixed(2)}</td>
                          <td className="py-2 px-3">{Number(row.spindle_temp_c).toFixed(1)}°C</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : (
          /* Single Unit Simulator */
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold mb-4">Simulate Single Unit Parameters</h2>
            <form onSubmit={handlePredictSingle} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SelectField label="Machine" value={unit.machine} options={["M1", "M2", "M3", "M4"]}
                onChange={(v) => setUnit({ ...unit, machine: v })} />
              <SelectField label="Shift" value={unit.shift} options={["A", "B", "C"]}
                onChange={(v) => setUnit({ ...unit, shift: v })} />
              <SelectField label="Supplier" value={unit.supplier} options={["S1", "S2", "S3"]}
                onChange={(v) => setUnit({ ...unit, supplier: v })} />

              <NumField label="Operator Exp (yrs)" value={unit.operator_exp_yrs} step="0.1"
                onChange={(v) => setUnit({ ...unit, operator_exp_yrs: v })} />
              <NumField label="Tool Wear (%)" value={unit.tool_wear_pct} step="1"
                onChange={(v) => setUnit({ ...unit, tool_wear_pct: v })} />
              <NumField label="Spindle Temp (°C)" value={unit.spindle_temp_c} step="0.5"
                onChange={(v) => setUnit({ ...unit, spindle_temp_c: v })} />
              <NumField label="Vibration (mm/s)" value={unit.vibration_mm_s} step="0.1"
                onChange={(v) => setUnit({ ...unit, vibration_mm_s: v })} />
              <NumField label="Coolant Conc (%)" value={unit.coolant_conc_pct} step="0.1"
                onChange={(v) => setUnit({ ...unit, coolant_conc_pct: v })} />
              <NumField label="Humidity (%)" value={unit.humidity_pct} step="1"
                onChange={(v) => setUnit({ ...unit, humidity_pct: v })} />
              <NumField label="Days Since Gauge Cal" value={unit.days_since_gauge_cal} step="1"
                onChange={(v) => setUnit({ ...unit, days_since_gauge_cal: Math.round(v) })} />
              <NumField label="Days Since PM" value={unit.days_since_pm} step="1"
                onChange={(v) => setUnit({ ...unit, days_since_pm: Math.round(v) })} />

              <div className="sm:col-span-3 pt-2">
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2">
                  <Play size={16} /> Predict Defect Risk
                </button>
              </div>
            </form>

            {singleResult && (
              <div className={`mt-6 p-4 rounded-xl border flex items-center justify-between ${
                singleResult.flag_for_inspection
                  ? "bg-red-500/10 border-red-500/40 text-red-300"
                  : "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
              }`}>
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-80">Prediction Outcome</p>
                  <p className="text-xl font-bold mt-0.5">
                    {singleResult.flag_for_inspection ? "FLAG FOR INSPECTION" : "PASS — NO EXTRA INSPECTION"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-80">Rejection Probability</p>
                  <p className="text-2xl font-mono font-bold">
                    {(singleResult.reject_probability * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ title, value, sub, icon }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start justify-between">
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        <p className="text-xs text-slate-400 mt-1">{sub}</p>
      </div>
      <div className="p-2 bg-slate-800 rounded-lg">{icon}</div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function NumField({ label, value, step, onChange }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
      />
    </div>
  );
}