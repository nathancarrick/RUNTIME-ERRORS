import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface RecoveryPlan {
  id: number;
  disruption_id: number;
  shipment_code: string;
  priority: string;
  impact_summary: string;
  recommended_action: string;
  alternative_actions: string;
  estimated_delay: number;
  estimated_cost: number;
  approval_status: string;
  execution_status: string;
  recommended_route: string;
  alternate_route: string;
  assigned_driver_id: number | null;
  risk_level: string;
  created_at: string;
  disruption_type?: string;
  severity?: string;
  location?: string;
  description?: string;
  disruption_status?: string;
  driver_name?: string;
}

export default function OperatorRecoveryPlans() {
  const [plans, setPlans] = useState<RecoveryPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "HIGH_RISK">("ALL");

  const [selectedPlan, setSelectedPlan] = useState<RecoveryPlan | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function loadRecoveryPlans() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API}/api/recovery-plans`);
      if (!response.ok) {
        throw new Error("Unable to fetch recovery plans.");
      }

      const data = await response.json();
      setPlans(data);
    } catch (err: any) {
      setError(err.message || "Failed to load recovery plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecoveryPlans();
  }, []);

  async function handleApprove(planId: number, routeType: string = "RECOMMENDED") {
    try {
      setActionLoading(true);
      setError("");
      setSuccessMsg("");

      const response = await fetch(
        `${API}/api/recovery-plans/${planId}/approve?selected_route=${routeType}`,
        { method: "POST" }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Approval failed");
      }

      setSuccessMsg(`✓ Recovery Plan #${planId} approved! Dispatched to driver in PostgreSQL.`);
      await loadRecoveryPlans();
      if (selectedPlan && selectedPlan.id === planId) {
        setSelectedPlan(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to approve plan.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReevaluate(planId: number) {
    try {
      setActionLoading(true);
      setError("");
      setSuccessMsg("");

      const response = await fetch(`${API}/api/recovery-plans/${planId}/reevaluate`, {
        method: "POST",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Re-evaluation failed");
      }

      setSuccessMsg(
        `⚡ Recovery plan re-evaluated! New action: "${data.recommended_action}" generated.`
      );
      await loadRecoveryPlans();
      if (selectedPlan && selectedPlan.id === planId) {
        setSelectedPlan(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to re-evaluate plan.");
    } finally {
      setActionLoading(false);
    }
  }

  const filteredPlans = plans.filter((p) => {
    if (filter === "PENDING") return p.approval_status === "PENDING";
    if (filter === "APPROVED") return p.approval_status === "APPROVED";
    if (filter === "HIGH_RISK")
      return p.risk_level === "HIGH" || p.risk_level === "CRITICAL" || p.priority === "CRITICAL";
    return true;
  });

  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-cyan-400 text-xs font-black tracking-[0.25em]">
            OPERATIONAL RECOVERY
          </div>
          <h1 className="text-3xl md:text-4xl font-black mt-2 text-white">
            Recovery Plans Control
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Review explainable decision engine recommendations, approve recovery routes, or re-evaluate high-risk disruptions.
          </p>
        </div>

        <button
          onClick={loadRecoveryPlans}
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-bold text-xs"
        >
          ↻ Refresh Plans
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

      {/* FILTERS */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { id: "ALL", label: `All Plans (${plans.length})` },
          { id: "PENDING", label: `Pending Approval (${plans.filter((p) => p.approval_status === "PENDING").length})` },
          { id: "APPROVED", label: `Approved (${plans.filter((p) => p.approval_status === "APPROVED").length})` },
          { id: "HIGH_RISK", label: `High Risk / Escalated (${plans.filter((p) => p.risk_level === "HIGH" || p.priority === "CRITICAL").length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              filter === tab.id
                ? "bg-cyan-400 text-slate-950 font-black"
                : "bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* PLANS LIST */}
      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-slate-400 text-sm">Loading recovery plans from PostgreSQL...</div>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
          No recovery plans found matching filter.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredPlans.map((plan) => {
            const isPending = plan.approval_status === "PENDING";
            const isHighRisk = plan.risk_level === "HIGH" || plan.priority === "CRITICAL";

            return (
              <div
                key={plan.id}
                className={`bg-slate-900 border rounded-2xl p-6 shadow-xl transition hover:border-slate-700 ${
                  isHighRisk
                    ? "border-rose-900/60 bg-gradient-to-r from-slate-900 to-rose-950/20"
                    : isPending
                    ? "border-amber-900/40"
                    : "border-slate-800"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
                        PLAN #{plan.id}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs font-black text-cyan-400">
                        {plan.shipment_code}
                      </span>
                      {plan.disruption_type && (
                        <span className="text-xs font-semibold text-slate-300">
                          ({plan.disruption_type.replace(/_/g, " ")})
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl font-black text-white mt-1">
                      {plan.recommended_action}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        plan.priority === "CRITICAL"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : plan.priority === "HIGH"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      Priority: {plan.priority}
                    </span>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        plan.approval_status === "APPROVED"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                      }`}
                    >
                      {plan.approval_status}
                    </span>

                    {isHighRisk && (
                      <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                        ⚠ HIGH RISK
                      </span>
                    )}
                  </div>
                </div>

                {/* SUMMARY & ROUTE */}
                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Impact Summary
                    </div>
                    <p className="text-xs text-slate-300 mt-1 line-clamp-2">
                      {plan.impact_summary}
                    </p>
                    <div className="text-xs text-slate-400 mt-2 font-bold">
                      Est. Delay: <span className="text-amber-400">{plan.estimated_delay} min</span> • Cost: <span className="text-cyan-400">₹{plan.estimated_cost.toLocaleString("en-IN")}</span>
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Recommended Route Corridor
                    </div>
                    <p className="text-xs text-cyan-300 font-bold mt-1">
                      {plan.recommended_route || "Default Recovery Corridor"}
                    </p>
                    <div className="text-xs text-slate-400 mt-2">
                      Driver: {plan.driver_name || "Assigned Driver"}
                    </div>
                  </div>
                </div>

                {/* ACTION CONTROLS */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setSelectedPlan(plan)}
                    className="text-xs font-bold text-slate-400 hover:text-cyan-400 underline"
                  >
                    View Decision Breakdown & Alternatives →
                  </button>

                  <div className="flex gap-2">
                    {/* RE-EVALUATE BUTTON */}
                    <button
                      onClick={() => handleReevaluate(plan.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 hover:bg-rose-500/20 text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <span>🔄</span>
                      <span>Re-Evaluate Plan</span>
                    </button>

                    {/* APPROVE BUTTON */}
                    {isPending && (
                      <button
                        onClick={() => handleApprove(plan.id)}
                        disabled={actionLoading}
                        className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center gap-1.5"
                      >
                        <span>✓</span>
                        <span>Approve Plan</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedPlan && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
                  PLAN #{selectedPlan.id} • {selectedPlan.shipment_code}
                </span>
                <h3 className="text-2xl font-black text-white mt-1">
                  {selectedPlan.recommended_action}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPlan(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mt-6">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase">
                  Disruption Details
                </div>
                <div className="text-sm font-semibold text-slate-200 mt-1">
                  {selectedPlan.disruption_type?.replace(/_/g, " ")} • Severity: {selectedPlan.severity}
                </div>
                <p className="text-xs text-slate-400 mt-1">{selectedPlan.description}</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase">
                  Impact & Operational Analysis
                </div>
                <p className="text-sm text-slate-300 mt-1">{selectedPlan.impact_summary}</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase">
                  Route Corridors
                </div>
                <div className="mt-2 text-xs">
                  <div className="text-slate-400">
                    <strong className="text-cyan-400">Primary Recovery:</strong>{" "}
                    {selectedPlan.recommended_route}
                  </div>
                  {selectedPlan.alternate_route && (
                    <div className="text-slate-400 mt-1">
                      <strong className="text-amber-400">Secondary Alternate:</strong>{" "}
                      {selectedPlan.alternate_route}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setSelectedPlan(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Close
              </button>

              <button
                onClick={() => handleReevaluate(selectedPlan.id)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 hover:bg-rose-500/20 text-xs font-bold"
              >
                Re-Evaluate
              </button>

              {selectedPlan.approval_status === "PENDING" && (
                <button
                  onClick={() => handleApprove(selectedPlan.id)}
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
                >
                  Approve Recovery Plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}