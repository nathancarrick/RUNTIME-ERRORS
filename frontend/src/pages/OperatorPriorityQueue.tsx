import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface QueueItem {
  id: number;
  shipment_code: string;
  customer_id: number;
  driver_id: number;
  origin: string;
  destination: string;
  current_location: string;
  status: string;
  priority: string;
  category: string;
  deadline: string | null;
  priority_category: string;
  priority_score: number;
  priority_explanation: string;
  overtaken_note: string;
  vehicle_number: string;
  vehicle_type: string;
  estimated_eta: string | null;
  estimated_delay: number;
  created_at: string;
  remaining_distance_km: number;
  remaining_duration_mins: number;
  customer_name: string;
  driver_name: string;
  disruption_type: string | null;
  disruption_severity: string | null;
  disruption_status: string | null;
  recommended_action: string;
  plan_approval_status: string;
  customer_urgency: string | null;
  customer_urgency_message: string | null;
  deadline_feasibility: string;
  remaining_hours: number;
}

interface QueueCounts {
  total: number;
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  medical: number;
  disrupted: number;
}

export default function OperatorPriorityQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<QueueCounts>({
    total: 0,
    p0: 0,
    p1: 0,
    p2: 0,
    p3: 0,
    p4: 0,
    medical: 0,
    disrupted: 0,
  });
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Classification Edit Modal
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [editCategory, setEditCategory] = useState("STANDARD_CARGO");
  const [editDeadline, setEditDeadline] = useState("");
  const [savingClassification, setSavingClassification] = useState(false);

  async function fetchQueue(filter = activeFilter) {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API}/api/priority-queue?category_filter=${filter}`
      );
      if (!response.ok) {
        throw new Error("Failed to load priority queue from PostgreSQL.");
      }

      const data = await response.json();
      setQueue(data.queue || []);
      setCounts(
        data.counts || {
          total: 0,
          p0: 0,
          p1: 0,
          p2: 0,
          p3: 0,
          p4: 0,
          medical: 0,
          disrupted: 0,
        }
      );
    } catch (err: any) {
      setError(err.message || "Failed to fetch priority queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchQueue(activeFilter);
  }, [activeFilter]);

  async function handleRecalculate() {
    try {
      setRecalculating(true);
      setError("");
      setSuccessMsg("");

      const response = await fetch(`${API}/api/priority-queue/recalculate`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Recalculation failed.");
      }

      const data = await response.json();
      setQueue(data.queue || []);
      setCounts(data.counts || counts);
      setSuccessMsg("✓ Fair Priority Engine recalculated all active shipments in PostgreSQL!");
    } catch (err: any) {
      setError(err.message || "Recalculation error.");
    } finally {
      setRecalculating(false);
    }
  }

  async function handleSaveClassification() {
    if (!selectedItem) return;

    try {
      setSavingClassification(true);
      setError("");

      const response = await fetch(
        `${API}/api/shipments/${selectedItem.shipment_code}/classification`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: editCategory,
            deadline: editDeadline || null,
            operator_username: "operator",
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to update classification.");
      }

      setSuccessMsg(
        `✓ Shipment ${selectedItem.shipment_code} updated to ${editCategory}. Priority set to ${data.priority_category} (${data.priority_score} pts)!`
      );
      setSelectedItem(null);
      await fetchQueue(activeFilter);
    } catch (err: any) {
      setError(err.message || "Classification update failed.");
    } finally {
      setSavingClassification(false);
    }
  }

  function openEditModal(item: QueueItem) {
    setSelectedItem(item);
    setEditCategory(item.category || "STANDARD_CARGO");
    setEditDeadline(item.deadline ? item.deadline.slice(0, 16) : "");
  }

  function getTierBadge(tier: string) {
    switch (tier) {
      case "P0":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            P0 — Life-Critical
          </span>
        );
      case "P1":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-orange-500/20 text-orange-300 border border-orange-500/40">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            P1 — Urgent Medical
          </span>
        );
      case "P2":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            P2 — High Priority
          </span>
        );
      case "P3":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            P3 — Normal Priority
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            P4 — Flexible
          </span>
        );
    }
  }

  function getCategoryPill(category: string) {
    if (category === "EMERGENCY_MEDICAL") {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-red-950 text-red-300 border border-red-600/50">
          🚨 EMERGENCY MEDICAL
        </span>
      );
    }
    if (category === "URGENT_MEDICAL" || category === "MEDICINE") {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-950 text-purple-300 border border-purple-600/50">
          💊 MEDICAL / PHARMA
        </span>
      );
    }
    if (category === "PERISHABLE" || category === "TIME_CRITICAL") {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-600/50">
          ⏱ TIME CRITICAL
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 text-slate-400 border border-slate-800">
        📦 {category.replace("_", " ")}
      </span>
    );
  }

  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-cyan-400 text-xs font-black tracking-[0.25em]">
            EXPLAINABLE DISPATCH ENGINE
          </div>
          <h1 className="text-3xl md:text-4xl font-black mt-2 text-white">
            Multi-Shipment Priority Queue
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-2xl">
            Fair, distance-aware priority ranking evaluated by Medical/Emergency SLA, deadline feasibility, disruption impact, and request-time tie-breaking.
          </p>
        </div>

        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="px-5 py-2.5 rounded-xl bg-cyan-400 text-slate-950 font-black text-xs hover:bg-cyan-300 transition flex items-center gap-2 shadow-lg shadow-cyan-400/20"
        >
          {recalculating ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              Recalculating...
            </>
          ) : (
            <>
              <span>⚡</span>
              Recalculate Priorities
            </>
          )}
        </button>
      </div>

      {/* FEEDBACK BANNERS */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 font-bold flex items-center justify-between text-sm">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="text-xs underline text-emerald-400">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-600/40 text-red-300 font-bold flex items-center justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-xs underline text-red-400">
            Dismiss
          </button>
        </div>
      )}

      {/* METRICS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase">Total Active</div>
          <div className="text-2xl font-black text-white mt-1">{counts.total}</div>
        </div>

        <div className="bg-red-950/30 border border-red-900/50 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-red-400 uppercase">P0 Life-Critical</div>
          <div className="text-2xl font-black text-red-300 mt-1">{counts.p0}</div>
        </div>

        <div className="bg-orange-950/30 border border-orange-900/50 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-orange-400 uppercase">P1 Urgent Medical</div>
          <div className="text-2xl font-black text-orange-300 mt-1">{counts.p1}</div>
        </div>

        <div className="bg-amber-950/30 border border-amber-900/50 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-amber-400 uppercase">P2 High Priority</div>
          <div className="text-2xl font-black text-amber-300 mt-1">{counts.p2}</div>
        </div>

        <div className="bg-cyan-950/30 border border-cyan-900/50 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-cyan-400 uppercase">P3 Normal</div>
          <div className="text-2xl font-black text-cyan-300 mt-1">{counts.p3}</div>
        </div>

        <div className="bg-purple-950/30 border border-purple-900/50 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-purple-400 uppercase">Medical Deliveries</div>
          <div className="text-2xl font-black text-purple-300 mt-1">{counts.medical}</div>
        </div>
      </div>

      {/* FILTER PILLS */}
      <div className="flex flex-wrap gap-2 pt-2 border-b border-slate-800 pb-4">
        {[
          { id: "ALL", label: `All Shipments (${counts.total})` },
          { id: "MEDICAL", label: `Medical & Pharma (${counts.medical})` },
          { id: "EMERGENCY", label: `P0 / P1 Emergencies (${counts.p0 + counts.p1})` },
          { id: "CRITICAL_DISRUPTION", label: `Disrupted (${counts.disrupted})` },
          { id: "AT_RISK", label: "At Risk / Overdue" },
          { id: "CUSTOMER_URGENCY", label: "Urgent Customer Requests" },
          { id: "NORMAL", label: "Normal Deliveries" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeFilter === f.id
                ? "bg-cyan-400 text-slate-950 font-black"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* QUEUE LISTING */}
      {loading ? (
        <div className="text-center py-24">
          <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-slate-400 text-sm">Evaluating Fair Priority rankings from PostgreSQL...</div>
        </div>
      ) : queue.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center text-slate-500">
          No shipments matching filter "{activeFilter}".
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((item, index) => {
            const isOvertaken = Boolean(item.overtaken_note);
            const isAtRisk = item.deadline_feasibility === "AT_RISK" || item.deadline_feasibility === "BREACHED";

            return (
              <div
                key={item.shipment_code}
                className={`bg-slate-900 border rounded-2xl p-5 md:p-6 transition shadow-md ${
                  isAtRisk
                    ? "border-rose-900/60 bg-gradient-to-r from-slate-900 to-rose-950/20"
                    : "border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* TOP BAR */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-slate-500 w-6">#{index + 1}</span>
                    <span className="text-lg font-black text-white">{item.shipment_code}</span>
                    {getTierBadge(item.priority_category)}
                    {getCategoryPill(item.category)}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-cyan-400 bg-cyan-950/60 px-3 py-1 rounded-lg border border-cyan-800/40">
                      Score: {item.priority_score} pts
                    </span>
                    <button
                      onClick={() => openEditModal(item)}
                      className="px-3 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                    >
                      ✏ Classify & SLA
                    </button>
                  </div>
                </div>

                {/* DETAILS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 text-xs">
                  <div>
                    <div className="text-slate-500 font-bold uppercase text-[10px]">Client & Driver</div>
                    <div className="text-slate-200 font-bold mt-1">{item.customer_name}</div>
                    <div className="text-slate-400 mt-0.5">Driver: {item.driver_name || "Unassigned"}</div>
                    <div className="text-slate-500 text-[11px]">Vehicle: {item.vehicle_number || "Pending"}</div>
                  </div>

                  <div>
                    <div className="text-slate-500 font-bold uppercase text-[10px]">Transit Corridor</div>
                    <div className="text-slate-200 font-bold mt-1">
                      {item.origin} → <span className="text-cyan-400">{item.destination}</span>
                    </div>
                    <div className="text-slate-400 mt-0.5">Location: {item.current_location}</div>
                    <div className="text-slate-500 text-[11px]">
                      {item.remaining_distance_km} km remaining (~{Math.round(item.remaining_duration_mins / 60)}h)
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500 font-bold uppercase text-[10px]">Deadline SLA</div>
                    <div className="text-slate-200 font-bold mt-1">
                      {item.deadline ? new Date(item.deadline).toLocaleString() : "Standard 12h SLA"}
                    </div>
                    <div className="mt-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          item.deadline_feasibility === "FEASIBLE"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                            : item.deadline_feasibility === "AT_RISK"
                            ? "bg-amber-950 text-amber-400 border border-amber-800/50"
                            : "bg-red-950 text-red-400 border border-red-800/50"
                        }`}
                      >
                        {item.deadline_feasibility} ({item.remaining_hours}h left)
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500 font-bold uppercase text-[10px]">Disruption / Recommended Action</div>
                    <div className="text-slate-200 font-bold mt-1">
                      {item.status === "DISRUPTED" ? (
                        <span className="text-red-400 font-black">
                          ⚠ {item.disruption_type || "Active Disruption"} ({item.estimated_delay}m delay)
                        </span>
                      ) : (
                        <span className="text-emerald-400">● Moving on schedule</span>
                      )}
                    </div>
                    <div className="text-slate-400 mt-0.5">{item.recommended_action}</div>
                  </div>
                </div>

                {/* EXPLAINABILITY CARD */}
                <div className="mt-4 pt-4 border-t border-slate-800/60 bg-slate-950/60 rounded-xl p-3 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                  <div className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 font-black">⚖ Engine Rationale:</span>
                    <span>{item.priority_explanation}</span>
                  </div>

                  {isOvertaken && (
                    <div className="px-3 py-1 rounded-lg bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 font-bold text-[11px] shrink-0">
                      ℹ {item.overtaken_note}
                    </div>
                  )}
                </div>

                {item.customer_urgency && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-300 text-xs flex items-center gap-2 font-bold">
                    <span>⚡ Customer Urgency ({item.customer_urgency}):</span>
                    <span>"{item.customer_urgency_message}"</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CLASSIFICATION MODAL */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-lg w-full space-y-5 shadow-2xl">
            <div>
              <div className="text-cyan-400 text-xs font-black tracking-widest">
                VERIFY CLASSIFICATION & DEADLINE SLA
              </div>
              <h2 className="text-2xl font-black text-white mt-1">
                {selectedItem.shipment_code}
              </h2>
              <p className="text-slate-400 text-xs mt-1">
                Corridor: {selectedItem.origin} → {selectedItem.destination} ({selectedItem.customer_name})
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">
                  Shipment Category
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-bold text-sm focus:border-cyan-400 outline-none"
                >
                  <option value="GENERAL">GENERAL — Standard commercial shipment</option>
                  <option value="STANDARD_CARGO">STANDARD_CARGO — Industrial freight</option>
                  <option value="MEDICINE">MEDICINE — Pharmaceutical supplies</option>
                  <option value="URGENT_MEDICAL">URGENT_MEDICAL — Urgent hospital cargo</option>
                  <option value="EMERGENCY_MEDICAL">EMERGENCY_MEDICAL — Life-critical emergency (P0 Priority)</option>
                  <option value="PERISHABLE">PERISHABLE — Cold chain food/vaccines</option>
                  <option value="TIME_CRITICAL">TIME_CRITICAL — Strict SLA window</option>
                </select>
                {editCategory === "EMERGENCY_MEDICAL" && (
                  <p className="text-red-400 text-[11px] mt-1 font-bold">
                    ⚠ Warning: Sets priority to P0 (highest tier). Strictly overrides non-emergency delivery schedules.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">
                  Delivery Deadline (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:border-cyan-400 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveClassification}
                disabled={savingClassification}
                className="px-5 py-2 text-xs font-black bg-cyan-400 text-slate-950 rounded-xl hover:bg-cyan-300 transition"
              >
                {savingClassification ? "Saving..." : "Save & Recalculate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
