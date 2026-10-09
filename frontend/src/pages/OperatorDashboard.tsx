import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface DashboardMetrics {
  total_shipments: number;
  active_shipments: number;
  disrupted_shipments: number;
  critical_shipments: number;
  pending_recovery_plans: number;
  approved_recovery_plans: number;
  total_disruptions: number;
  critical_disruptions: number;
  active_disruptions: number;
  active_drivers: number;
  completed_deliveries: number;
  total_incidents: number;
  pending_driver_responses: number;
  pending_customer_requests: number;
}

interface OperatorDashboardProps {
  user: {
    full_name: string;
    username: string;
  };
  onNavigate?: (page: string) => void;
}

export default function OperatorDashboard({
  user,
  onNavigate,
}: OperatorDashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const [metricsRes, shipmentsRes] = await Promise.all([
        fetch(`${API}/api/dashboard/metrics`),
        fetch(`${API}/api/shipments`),
      ]);

      if (!metricsRes.ok || !shipmentsRes.ok) {
        throw new Error("Failed to load operations metrics from PostgreSQL");
      }

      const metricsData = await metricsRes.json();
      const shipmentsData = await shipmentsRes.json();

      setMetrics(metricsData);
      setShipments(shipmentsData.slice(0, 5));
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-cyan-400 text-xs font-black tracking-[0.25em]">
            OPERATIONS COMMAND CENTER
          </div>

          <h1 className="text-3xl md:text-4xl font-black mt-2 text-white">
            Welcome, {user.full_name}
          </h1>

          <p className="text-slate-400 mt-2 text-sm">
            Disruption-aware logistics command, recovery planning, and real-time fleet coordination.
          </p>
        </div>

        <button
          onClick={loadDashboard}
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-bold text-xs"
        >
          ↻ Refresh Metrics
        </button>
      </div>

      {loading && !metrics && (
        <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/50 text-cyan-400 text-xs font-bold animate-pulse text-center">
          Loading live operational metrics from PostgreSQL...
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-sm font-bold">
          {error}
        </div>
      )}

      {/* METRICS GRID - 8 KEY POSTGRESQL METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="TOTAL SHIPMENTS"
          value={metrics ? metrics.total_shipments : "..."}
          subtitle="All platform consignments"
          badge="PostgreSQL"
          color="cyan"
        />

        <MetricCard
          title="ACTIVE SHIPMENTS"
          value={metrics ? metrics.active_shipments : "..."}
          subtitle="Currently in transit"
          badge="Live"
          color="blue"
        />

        <MetricCard
          title="DISRUPTED SHIPMENTS"
          value={metrics ? metrics.disrupted_shipments : "..."}
          subtitle="Affected by ground events"
          badge={metrics && metrics.disrupted_shipments > 0 ? "Alert" : "Normal"}
          color={metrics && metrics.disrupted_shipments > 0 ? "red" : "slate"}
        />

        <MetricCard
          title="CRITICAL SHIPMENTS"
          value={metrics ? metrics.critical_shipments : "..."}
          subtitle="High priority urgency"
          badge={metrics && metrics.critical_shipments > 0 ? "Critical" : "Clear"}
          color={metrics && metrics.critical_shipments > 0 ? "red" : "slate"}
        />

        <MetricCard
          title="PENDING RECOVERY PLANS"
          value={metrics ? metrics.pending_recovery_plans : "..."}
          subtitle="Awaiting operator approval"
          badge="Action Req."
          color="amber"
        />

        <MetricCard
          title="ACTIVE DRIVERS"
          value={metrics ? metrics.active_drivers : "..."}
          subtitle="Assigned on duty"
          badge="Fleet"
          color="emerald"
        />

        <MetricCard
          title="COMPLETED DELIVERIES"
          value={metrics ? metrics.completed_deliveries : "..."}
          subtitle="Safely delivered"
          badge="Success"
          color="emerald"
        />

        <MetricCard
          title="INCIDENT ARCHIVE"
          value={metrics ? metrics.total_incidents : "..."}
          subtitle="Stored recovery records"
          badge="History"
          color="purple"
        />
      </div>

      {/* ACTION PANELS */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* RECENT SHIPMENTS TABLE */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-cyan-400 text-xs font-black tracking-widest">
                ACTIVE FLEET DISPATCHES
              </div>
              <h2 className="text-xl font-bold mt-1 text-white">
                Live Shipment Operations
              </h2>
            </div>

            {onNavigate && (
              <button
                onClick={() => onNavigate("shipments")}
                className="text-xs font-bold text-cyan-400 hover:underline"
              >
                View All →
              </button>
            )}
          </div>

          {shipments.length === 0 ? (
            <p className="text-slate-500 text-sm py-4">
              No shipments found in database.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-black uppercase">
                    <th className="pb-3">Shipment</th>
                    <th className="pb-3">Route</th>
                    <th className="pb-3">Driver</th>
                    <th className="pb-3">Priority</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {shipments.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-950/40">
                      <td className="py-3 font-bold text-white">
                        {s.shipment_code}
                      </td>
                      <td className="py-3 text-slate-300">
                        {s.origin} → {s.destination}
                      </td>
                      <td className="py-3 text-slate-400">
                        {s.driver_name || "Assigned Driver"}
                      </td>
                      <td className="py-3">
                        <span
                          className={`font-black ${
                            s.priority === "CRITICAL"
                              ? "text-red-400"
                              : s.priority === "HIGH"
                              ? "text-amber-400"
                              : "text-slate-400"
                          }`}
                        >
                          {s.priority}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            s.status === "DELIVERED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : s.status === "DISRUPTED"
                              ? "bg-red-500/10 text-red-400 border border-red-500/30"
                              : "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                          }`}
                        >
                          {s.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* QUICK OPERATOR ACTIONS */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="text-slate-500 text-xs font-black tracking-widest uppercase">
              Operational Actions
            </div>
            <h3 className="text-lg font-bold text-white mt-1">
              Recovery Workflow Links
            </h3>

            <div className="space-y-3 mt-4">
              <button
                onClick={() => onNavigate && onNavigate("disruptions")}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-cyan-400">
                    🚨 Report / Analyze Disruption
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Trigger explainable decision engine
                  </div>
                </div>
                <span className="text-slate-500 text-sm">→</span>
              </button>

              <button
                onClick={() => onNavigate && onNavigate("recovery")}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-amber-400">
                    ✓ Recovery Plans Control
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Review and approve alternative actions
                  </div>
                </div>
                <span className="text-slate-500 text-sm">→</span>
              </button>

              <button
                onClick={() => onNavigate && onNavigate("driver_responses")}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-emerald-400">
                    🚚 Driver Ground Responses
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Accept or reject route proposals
                  </div>
                </div>
                <span className="text-slate-500 text-sm">→</span>
              </button>

              <button
                onClick={() => onNavigate && onNavigate("incidents")}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-purple-400">
                    📋 Completed Incident History
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Examine final recovered outcomes
                  </div>
                </div>
                <span className="text-slate-500 text-sm">→</span>
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              PostgreSQL Connected
            </span>
            <span>Host: localhost:5432</span>
          </div>
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  badge,
  color,
}: {
  title: string;
  value: any;
  subtitle: string;
  badge: string;
  color: "cyan" | "blue" | "red" | "amber" | "emerald" | "purple" | "slate";
}) {
  const colorMap = {
    cyan: "text-cyan-400",
    blue: "text-blue-400",
    red: "text-red-400",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    purple: "text-purple-400",
    slate: "text-slate-300",
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
            {title}
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
            {badge}
          </span>
        </div>

        <div className={`text-3xl font-black mt-2 ${colorMap[color]}`}>
          {value}
        </div>
      </div>

      <div className="text-[11px] text-slate-500 mt-2">{subtitle}</div>
    </div>
  );
}