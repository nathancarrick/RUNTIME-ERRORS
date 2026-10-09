import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface DriverResponseItem {
  id: number;
  shipment_code: string;
  recovery_plan_id: number | null;
  driver_id: number;
  response_type: string;
  issue_type: string | null;
  severity: string | null;
  description: string | null;
  suggested_route: string | null;
  reason: string | null;
  estimated_improvement: string | null;
  status: string;
  operator_notes: string | null;
  created_at: string;
  updated_at: string;
  driver_name: string | null;
  driver_username: string | null;
  observed_road_condition?: string;
  estimated_delay_minutes?: number;
  driver_notes?: string;
  validation_status?: string;
  validation_details?: {
    valid?: boolean;
    reaches_destination?: boolean;
    destination?: string;
    distance_km?: number;
    duration_mins?: number;
    avoids_disruption?: boolean;
    operational_risk?: string;
    validation_status?: string;
    validation_summary?: string;
    partial_reason?: string;
    route_details?: string;
  };
}

interface CustomerRequestItem {
  id: number;
  shipment_code: string;
  customer_id: number;
  request_type: string;
  message: string;
  status: string;
  created_at: string;
  customer_name: string | null;
  customer_username: string | null;
}

export default function OperatorDriverResponses() {
  const [driverResponses, setDriverResponses] = useState<DriverResponseItem[]>([]);
  const [customerRequests, setCustomerRequests] = useState<CustomerRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [activeTab, setActiveTab] = useState<"driver" | "customer">("driver");

  // Decision state
  const [decisionNotes, setDecisionNotes] = useState("");
  const [selectedRespId, setSelectedRespId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [respRes, reqRes] = await Promise.all([
        fetch(`${API}/api/driver-responses`),
        fetch(`${API}/api/customer-requests`),
      ]);

      if (!respRes.ok || !reqRes.ok) {
        throw new Error("Unable to fetch transmissions from PostgreSQL.");
      }

      const respData = await respRes.json();
      const reqData = await reqRes.json();

      setDriverResponses(respData);
      setCustomerRequests(reqData);
    } catch (err: any) {
      setError(err.message || "Failed to load responses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleDecide(responseId: number, decision: "ACCEPT" | "REJECT") {
    try {
      setActionLoading(true);
      setError("");
      setSuccessMsg("");

      const response = await fetch(`${API}/api/driver-responses/${responseId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          operator_notes: decisionNotes || (decision === "ACCEPT" ? "Approved by Logistics" : "Standard recovery plan maintained"),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to record decision.");
      }

      setSuccessMsg(`✓ Driver response marked ${decision}ED. Shipment & plan updated!`);
      setSelectedRespId(null);
      setDecisionNotes("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Decision error.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-cyan-400 text-xs font-black tracking-[0.25em]">
            FIELD COORDINATION
          </div>
          <h1 className="text-3xl md:text-4xl font-black mt-2 text-white">
            Driver & Customer Transmissions
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Review ground problem reports, validate driver route suggestions, and address customer urgency alerts.
          </p>
        </div>

        <button
          onClick={loadData}
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-bold text-xs"
        >
          ↻ Refresh List
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

      {/* TABS */}
      <div className="flex gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("driver")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === "driver"
              ? "bg-cyan-400 text-slate-950 font-black"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          <span>🚚</span>
          <span>Driver Ground Responses ({driverResponses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("customer")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === "customer"
              ? "bg-cyan-400 text-slate-950 font-black"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          <span>⚡</span>
          <span>Customer Urgency Alerts ({customerRequests.length})</span>
        </button>
      </div>

      {/* TAB CONTENT */}
      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-slate-400 text-sm">Fetching transmissions from PostgreSQL...</div>
        </div>
      ) : activeTab === "driver" ? (
        driverResponses.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
            No driver transmissions recorded yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {driverResponses.map((dr) => {
              const isPending = dr.status === "PENDING";
              const isRouteSuggestion = dr.response_type === "ROUTE_SUGGESTED";
              const isIssue = dr.response_type === "ISSUE_REPORTED";

              return (
                <div
                  key={dr.id}
                  className={`bg-slate-900 border rounded-2xl p-6 shadow-xl transition hover:border-slate-700 ${
                    isIssue && (dr.severity === "HIGH" || dr.severity === "CRITICAL")
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
                          DISPATCH #{dr.id}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-xs font-black text-cyan-400">
                          {dr.shipment_code}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-xs font-bold text-slate-300">
                          Driver: {dr.driver_name || dr.driver_username || `ID #${dr.driver_id}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2.5 py-0.5 rounded text-xs font-black bg-slate-950 text-cyan-300 border border-slate-800">
                          {dr.response_type.replace(/_/g, " ")}
                        </span>
                        {dr.issue_type && (
                          <span className="text-xs font-semibold text-amber-400">
                            {dr.issue_type}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {dr.severity && (
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            dr.severity === "CRITICAL" || dr.severity === "HIGH"
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          Severity: {dr.severity}
                        </span>
                      )}

                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          dr.status === "ACCEPTED"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : dr.status === "REJECTED"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                        }`}
                      >
                        Status: {dr.status}
                      </span>
                    </div>
                  </div>

                  {/* DETAILS */}
                  {isIssue && dr.description && (
                    <div className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-4">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">
                        Ground Obstacle / Issue Report
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{dr.description}</p>
                    </div>
                  )}

                  {isRouteSuggestion && (
                    <div className="mt-4 space-y-3">
                      {/* DRIVER PROPOSAL */}
                      <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-black text-cyan-400 uppercase tracking-wider">
                            Driver Proposed Route Corridor
                          </div>
                          {dr.validation_status && (
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${
                              dr.validation_status === "VALID"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                : dr.validation_status === "PARTIAL"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                : "bg-red-500/20 text-red-400 border border-red-500/40"
                            }`}>
                              Engine: {dr.validation_status}
                            </span>
                          )}
                        </div>

                        <div className="text-base font-black text-white">
                          {dr.suggested_route}
                        </div>

                        <div className="text-xs text-slate-300">
                          <strong className="text-slate-400">Driver Rationale:</strong> {dr.reason}
                        </div>

                        {/* GROUND CONDITIONS & METRICS */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          {dr.observed_road_condition && (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                              Observed Ground: <strong className="text-cyan-400">{dr.observed_road_condition}</strong>
                            </span>
                          )}
                          {dr.estimated_delay_minutes !== undefined && dr.estimated_delay_minutes > 0 && (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-300">
                              Ground Delay: <strong>+{dr.estimated_delay_minutes} min</strong>
                            </span>
                          )}
                          {dr.estimated_improvement && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 font-bold">
                              Claimed Benefit: {dr.estimated_improvement}
                            </span>
                          )}
                        </div>

                        {dr.driver_notes && (
                          <div className="text-xs text-slate-300 bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 mt-2">
                            <span className="text-slate-500 font-bold">Driver Field Notes: </span>
                            {dr.driver_notes}
                          </div>
                        )}
                      </div>

                      {/* SYSTEM VALIDATION COMPARISON CARD */}
                      {dr.validation_details && (
                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
                          <div className="flex items-center justify-between text-slate-400 font-bold">
                            <span className="uppercase text-[10px] tracking-wider text-slate-400">
                              Automated Decision Engine Assessment (OSRM + Rules)
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              Invariant Check: {dr.validation_details.destination || "Chennai"}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1">
                            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                              <div className="text-[10px] text-slate-500 uppercase font-bold">Destination Invariant</div>
                              <div className={`font-bold mt-0.5 ${dr.validation_details.reaches_destination ? "text-emerald-400" : "text-red-400"}`}>
                                {dr.validation_details.reaches_destination ? "✓ Reaches Invariant Destination" : "✗ Fails Destination"}
                              </div>
                            </div>

                            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                              <div className="text-[10px] text-slate-500 uppercase font-bold">OSRM Road Distance & Time</div>
                              <div className="text-white font-mono mt-0.5">
                                {dr.validation_details.distance_km ? `${dr.validation_details.distance_km} km` : "Corridor est."} / ~{dr.validation_details.duration_mins ? `${dr.validation_details.duration_mins}m` : "—"}
                              </div>
                            </div>

                            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                              <div className="text-[10px] text-slate-500 uppercase font-bold">Hazard Avoidance</div>
                              <div className={`font-bold mt-0.5 ${dr.validation_details.avoids_disruption ? "text-emerald-400" : "text-amber-400"}`}>
                                {dr.validation_details.avoids_disruption ? "✓ Clears Disruption" : "⚠ Near Disrupted Segment"}
                              </div>
                            </div>
                          </div>

                          {dr.validation_details.validation_summary && (
                            <div className="text-slate-300 italic bg-slate-900/40 p-2 rounded-lg border border-slate-800/60">
                              "{dr.validation_details.validation_summary}"
                            </div>
                          )}

                          {dr.validation_status === "INVALID" && (
                            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 font-bold text-xs flex items-center gap-2">
                              <span>⚠</span>
                              <span>Warning: This route fails destination preservation or road feasibility. Recommended action: REJECT.</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {dr.operator_notes && (
                    <div className="mt-3 text-xs bg-slate-950/60 border border-slate-800 rounded-lg p-2 text-slate-400">
                      <strong className="text-slate-300">Operator Review Notes:</strong> {dr.operator_notes}
                    </div>
                  )}

                  {/* OPERATOR ACTION BUTTONS */}
                  {isPending && (
                    <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex-1 max-w-md">
                        <input
                          value={selectedRespId === dr.id ? decisionNotes : ""}
                          onChange={(e) => {
                            setSelectedRespId(dr.id);
                            setDecisionNotes(e.target.value);
                          }}
                          placeholder="Optional feedback notes for driver..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDecide(dr.id, "REJECT")}
                          disabled={actionLoading}
                          className="px-4 py-2 rounded-xl bg-red-950/40 border border-red-900/50 text-red-400 hover:bg-red-900/40 text-xs font-bold transition"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleDecide(dr.id, "ACCEPT")}
                          disabled={actionLoading}
                          className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg transition"
                        >
                          {isRouteSuggestion ? "Accept & Update Route" : "Acknowledge Ground Report"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* CUSTOMER URGENCY TAB */
        customerRequests.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
            No customer urgency requests recorded yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {customerRequests.map((cr) => (
              <div
                key={cr.id}
                className="bg-slate-900 border border-amber-900/40 rounded-2xl p-6 shadow-xl space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black tracking-widest text-amber-500 uppercase">
                        CUSTOMER URGENCY NOTICE #{cr.id}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs font-black text-white">
                        {cr.shipment_code}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Customer: <strong className="text-slate-200">{cr.customer_name || `ID #${cr.customer_id}`}</strong>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    URGENT PRIORITY
                  </span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">
                    Customer Message
                  </div>
                  <p className="text-sm font-semibold text-slate-200 mt-1">
                    "{cr.message}"
                  </p>
                  <div className="text-[10px] text-slate-500 mt-2">
                    Received: {new Date(cr.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="text-xs text-emerald-400 font-bold flex items-center gap-2">
                  <span>✓</span>
                  <span>Shipment priority upgraded to CRITICAL in PostgreSQL database.</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </main>
  );
}
