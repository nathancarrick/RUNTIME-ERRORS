import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface IncidentRecord {
  id: number;
  shipment_code: string;
  disruption_id: number | null;
  recovery_plan_id: number | null;
  disruption_type: string | null;
  severity: string | null;
  original_route: string | null;
  recovery_route: string | null;
  operator_decision: string | null;
  driver_response: string | null;
  customer_request: string | null;
  final_status: string;
  final_eta: string | null;
  total_delay: number;
  recovery_cost: number;
  incident_outcome: string | null;
  completed_at: string;
}

export default function OperatorIncidents() {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadIncidents() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API}/api/incidents`);
      if (!response.ok) {
        throw new Error("Unable to load incident history.");
      }

      const data = await response.json();
      setIncidents(data);
    } catch (err: any) {
      setError(err.message || "Failed to load incident history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIncidents();
  }, []);

  const filteredIncidents = incidents.filter((inc) => {
    const q = search.toLowerCase();
    return (
      inc.shipment_code.toLowerCase().includes(q) ||
      (inc.disruption_type || "").toLowerCase().includes(q) ||
      (inc.incident_outcome || "").toLowerCase().includes(q)
    );
  });

  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-cyan-400 text-xs font-black tracking-[0.25em]">
            AUDIT & ANALYTICS
          </div>
          <h1 className="text-3xl md:text-4xl font-black mt-2 text-white">
            Incident History & Recovery Archive
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Complete lifecycle records of resolved disruptions, approved recovery interventions, driver responses, and final delivery results.
          </p>
        </div>

        <button
          onClick={loadIncidents}
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-bold text-xs"
        >
          ↻ Refresh Archive
        </button>
      </div>

      {/* SEARCH BAR */}
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search incident by shipment code or disruption type..."
          className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-cyan-400"
        />
        <span className="text-xs text-slate-500">
          Showing {filteredIncidents.length} of {incidents.length} recorded incidents
        </span>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-sm font-bold">
          {error}
        </div>
      )}

      {/* CONTENT */}
      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-slate-400 text-sm">Querying incident archive from PostgreSQL...</div>
        </div>
      ) : filteredIncidents.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="text-lg font-bold text-slate-300">No Resolved Incidents Yet</h3>
          <p className="text-xs text-slate-500 mt-1">
            When an active shipment completes delivery after disruption recovery, its full incident outcome record will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredIncidents.map((inc) => (
            <div
              key={inc.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5"
            >
              {/* TOP HEADER */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black px-2.5 py-1 rounded bg-cyan-950 border border-cyan-800 text-cyan-400">
                      INCIDENT #{inc.id}
                    </span>
                    <span className="text-xl font-black text-white">
                      {inc.shipment_code}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">
                      ({inc.disruption_type?.replace(/_/g, " ") || "Operational Disruption"})
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 mt-1">
                    Completed at: {new Date(inc.completed_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      inc.severity === "CRITICAL"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    Severity: {inc.severity || "HIGH"}
                  </span>

                  <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    STATUS: {inc.final_status}
                  </span>
                </div>
              </div>

              {/* TWO COLUMN SUMMARY */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* ROUTE CORRIDOR INFO */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold uppercase">Original Planned Route:</span>
                    <div className="text-slate-200 font-semibold mt-0.5">{inc.original_route}</div>
                  </div>
                  <div>
                    <span className="text-cyan-400 font-bold uppercase">Executed Recovery Route:</span>
                    <div className="text-cyan-300 font-semibold mt-0.5">{inc.recovery_route}</div>
                  </div>
                </div>

                {/* DECISION & RESPONSES */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold uppercase">Operator Decision:</span>
                    <span className="text-emerald-400 font-bold">{inc.operator_decision}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold uppercase">Driver Ground Response:</span>
                    <span className="text-cyan-400 font-bold">{inc.driver_response}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold uppercase">Customer Urgency:</span>
                    <span className="text-slate-300 font-semibold">{inc.customer_request}</span>
                  </div>
                </div>
              </div>

              {/* OUTCOME & METRICS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Total Disruption Delay</div>
                  <div className="text-base font-black text-amber-400 mt-1">
                    {inc.total_delay} min
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Recovery Cost</div>
                  <div className="text-base font-black text-cyan-400 mt-1">
                    ₹{inc.recovery_cost.toLocaleString("en-IN")}
                  </div>
                </div>

                <div className="col-span-2 bg-slate-950 border border-emerald-900/40 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-emerald-400 uppercase font-bold">Final Incident Result</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5">
                      {inc.incident_outcome}
                    </div>
                  </div>
                  <span className="text-2xl">✓</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
