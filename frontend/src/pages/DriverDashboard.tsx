import { useEffect, useState } from "react";
import LogisticsMap from "../components/LogisticsMap";
import DriverProfileView from "../components/DriverProfileView";

const API = "http://127.0.0.1:8000";

interface Shipment {
  id: number;
  shipment_code: string;
  origin: string;
  destination: string;
  current_location: string;
  status: string;
  priority: string;
  vehicle_number: string;
  vehicle_type: string;
  updated_at: string;
  estimated_delay?: number;
  category?: string;
  deadline?: string;
  priority_category?: string;
  priority_score?: number;
  priority_explanation?: string;
}

interface Recovery {
  recovery_plan_id: number;
  priority: string;
  impact_summary: string;
  recommended_action: string;
  recommended_route: string;
  alternate_route: string;
  estimated_delay: number;
  estimated_cost: number;
  approval_status: string;
  execution_status: string;
  risk_level: string;
  disruption_type: string;
  severity: string;
  location: string;
  description: string;
  disruption_status: string;
}

interface DriverResponseItem {
  id: number;
  response_type: string;
  issue_type?: string;
  severity?: string;
  description?: string;
  suggested_route?: string;
  reason?: string;
  estimated_improvement?: string;
  status: string;
  operator_notes?: string;
  created_at: string;
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

interface ShipmentEventItem {
  id: number;
  event_type: string;
  description: string;
  created_by: string;
  created_at: string;
}

interface CustomerRequestItem {
  id: number;
  message: string;
  status: string;
  created_at: string;
}

interface DriverDashboardProps {
  user: {
    user_id: number;
    user_code: string;
    username: string;
    full_name: string;
    role: string;
    phone?: string;
    email?: string;
    profile?: {
      license_number?: string;
      vehicle_number?: string;
      vehicle_type?: string;
    };
  };
  onLogout: () => void;
}

export default function DriverDashboard({
  user,
  onLogout,
}: DriverDashboardProps) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [responses, setResponses] = useState<DriverResponseItem[]>([]);
  const [events, setEvents] = useState<ShipmentEventItem[]>([]);
  const [customerRequest, setCustomerRequest] =
    useState<CustomerRequestItem | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Modals
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueType, setIssueType] = useState("ROAD_BLOCKED");
  const [issueSeverity, setIssueSeverity] = useState("HIGH");
  const [issueDescription, setIssueDescription] = useState("");

  const [showRouteModal, setShowRouteModal] = useState(false);
  const [suggestedRoute, setSuggestedRoute] = useState("");
  const [suggestionReason, setSuggestionReason] = useState("");
  const [estimatedImprovement, setEstimatedImprovement] = useState("");
  const [observedRoadCondition, setObservedRoadCondition] = useState("CLEAR");
  const [estimatedDelayMinutes, setEstimatedDelayMinutes] = useState("0");
  const [driverNotes, setDriverNotes] = useState("");

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeNotes, setCompleteNotes] = useState("");

  const [activeTab, setActiveTab] = useState<
    "operations" | "map" | "logs" | "profile"
  >("operations");

  const loadShipment = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API}/api/driver/${user.user_id}/active-shipment`
      );

      if (!response.ok) {
        throw new Error("Failed to load driver shipment details.");
      }

      const data = await response.json();

      if (data.has_shipment) {
        setShipment(data.shipment);
        setRecovery(data.recovery || null);
        setResponses(data.driver_responses || []);
        setEvents(data.events || []);
        setCustomerRequest(data.customer_request || null);
      } else {
        setShipment(null);
        setRecovery(null);
        setResponses([]);
        setEvents([]);
        setCustomerRequest(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Unable to load driver shipment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShipment();
  }, [user.user_id]);

  // ACTION 1: ACCEPT RECOVERY PLAN
  async function handleAcceptPlan() {
    if (!shipment) return;
    try {
      setActionLoading(true);
      setError("");
      setSuccessMsg("");

      const response = await fetch(`${API}/api/driver-responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_code: shipment.shipment_code,
          driver_id: user.user_id,
          response_type: "ACCEPTED",
          recovery_plan_id: recovery?.recovery_plan_id,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to record plan acceptance.");
      }

      setSuccessMsg("✓ Recovery plan accepted! Dispatch recorded in PostgreSQL.");
      await loadShipment();
    } catch (err: any) {
      setError(err.message || "Failed to accept recovery plan.");
    } finally {
      setActionLoading(false);
    }
  }

  // ACTION 2: REPORT GROUND ISSUE
  async function handleReportIssue() {
    if (!shipment || !issueDescription.trim()) {
      setError("Please describe the ground issue.");
      return;
    }

    try {
      setActionLoading(true);
      setError("");
      setSuccessMsg("");

      const response = await fetch(`${API}/api/driver-responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_code: shipment.shipment_code,
          driver_id: user.user_id,
          response_type: "ISSUE_REPORTED",
          recovery_plan_id: recovery?.recovery_plan_id,
          issue_type: issueType,
          severity: issueSeverity,
          description: issueDescription,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to submit ground issue.");
      }

      setShowIssueModal(false);
      setIssueDescription("");
      setSuccessMsg("⚠ Ground issue transmitted to Logistics Operations!");
      await loadShipment();
    } catch (err: any) {
      setError(err.message || "Failed to submit ground issue.");
    } finally {
      setActionLoading(false);
    }
  }

  // ACTION 3: SUGGEST ROUTE
  async function handleSuggestRoute() {
    if (!shipment || !suggestedRoute.trim() || !suggestionReason.trim()) {
      setError("Please provide both suggested route and reason.");
      return;
    }

    try {
      setActionLoading(true);
      setError("");
      setSuccessMsg("");

      const response = await fetch(`${API}/api/driver-responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_code: shipment.shipment_code,
          driver_id: user.user_id,
          response_type: "ROUTE_SUGGESTED",
          recovery_plan_id: recovery?.recovery_plan_id,
          suggested_route: suggestedRoute,
          reason: suggestionReason,
          estimated_improvement: estimatedImprovement || "Estimated time savings",
          observed_road_condition: observedRoadCondition,
          estimated_delay_minutes: Number(estimatedDelayMinutes) || 0,
          driver_notes: driverNotes,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to submit route suggestion.");
      }

      setShowRouteModal(false);
      setSuggestedRoute("");
      setSuggestionReason("");
      setEstimatedImprovement("");
      setObservedRoadCondition("CLEAR");
      setEstimatedDelayMinutes("0");
      setDriverNotes("");

      const valStatus = data.validation_status || "PENDING";
      const valSummary = data.validation?.validation_summary || "";
      setSuccessMsg(
        `🛣 Route proposal submitted! Automated Backend Validation: [${valStatus}] ${valSummary ? `— ${valSummary}` : ""}. Awaiting Operator decision.`
      );
      await loadShipment();
    } catch (err: any) {
      setError(err.message || "Failed to submit route suggestion.");
    } finally {
      setActionLoading(false);
    }
  }

  // ACTION 4: MARK DELIVERY COMPLETED
  async function handleCompleteDelivery() {
    if (!shipment) return;

    try {
      setActionLoading(true);
      setError("");
      setSuccessMsg("");

      const response = await fetch(
        `${API}/api/shipments/${shipment.shipment_code}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipment_code: shipment.shipment_code,
            driver_id: user.user_id,
            notes: completeNotes || "Safely delivered at destination hub.",
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to complete delivery.");
      }

      setShowCompleteModal(false);
      setSuccessMsg(
        "🎉 Delivery completed successfully! Incident recorded in database history."
      );
      await loadShipment();
    } catch (err: any) {
      setError(err.message || "Failed to mark delivery completed.");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-cyan-400 text-lg font-bold">
            LOGIAID Driver Command
          </div>
          <div className="text-slate-500 text-sm mt-1">
            Loading active operational dispatch from PostgreSQL...
          </div>
        </div>
      </div>
    );
  }

  const recoveryApproved = recovery?.approval_status === "APPROVED";
  const hasAccepted = responses.some((r) => r.response_type === "ACCEPTED");
  const isDelivered = shipment?.status === "DELIVERED";
  const isRiskHigh =
    recovery?.risk_level === "HIGH" ||
    recovery?.risk_level === "CRITICAL" ||
    shipment?.priority === "CRITICAL";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-950/95 sticky top-0 z-20 backdrop-blur">
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-black tracking-tight">
              LOGI<span className="text-cyan-400">AID</span>
            </div>
            <span className="hidden sm:inline-block px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest bg-cyan-950/60 border border-cyan-800 text-cyan-400">
              DRIVER PORTAL
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-bold">{user.full_name}</div>
              <div className="text-[11px] text-slate-400">
                Vehicle:{" "}
                <span className="text-cyan-400 font-semibold">
                  {user.profile?.vehicle_number ||
                    shipment?.vehicle_number ||
                    "TN57DZ8091"}
                </span>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-900/50 text-red-400 hover:bg-red-900/40 text-xs font-bold"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* FEEDBACK BANNERS */}
      <div className="max-w-7xl mx-auto px-5 pt-4 w-full">
        {successMsg && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 font-bold flex items-center justify-between">
            <span>{successMsg}</span>
            <button
              onClick={() => setSuccessMsg("")}
              className="text-xs text-emerald-400 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-950/60 border border-red-600/40 text-red-300 font-bold flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              className="text-xs text-red-400 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* CUSTOMER URGENCY ALERT BANNER */}
        {customerRequest && customerRequest.status === "PENDING" && (
          <div className="mb-4 p-4 rounded-xl bg-amber-950/40 border border-amber-500/50 text-amber-200 flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div className="flex-1">
              <div className="text-xs font-black tracking-widest text-amber-400 uppercase">
                Customer Urgency Notice
              </div>
              <div className="text-sm font-semibold mt-0.5">
                "{customerRequest.message}" — High priority delivery requested!
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
              URGENT
            </span>
          </div>
        )}

        {/* HIGH RISK WARNING BANNER */}
        {isRiskHigh && !isDelivered && (
          <div className="mb-4 p-4 rounded-xl bg-rose-950/50 border border-rose-500/60 text-rose-200 flex items-center gap-3">
            <span className="text-2xl animate-pulse">⚠</span>
            <div className="flex-1">
              <div className="text-xs font-black tracking-widest text-rose-400 uppercase">
                High Operational Risk Alert
              </div>
              <div className="text-sm font-semibold mt-0.5">
                Ground conditions require elevated vigilance. Operations has been
                alerted for route re-evaluation.
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
              ELEVATED RISK
            </span>
          </div>
        )}
      </div>

      {/* NAVIGATION TABS */}
      <div className="max-w-7xl mx-auto px-5 w-full flex items-center justify-between border-b border-slate-800 pb-2 mt-2">
        <div className="flex gap-2">
          {[
            { id: "operations", label: "Active Shipment & Actions", icon: "📦" },
            { id: "map", label: "Interactive Route Map", icon: "🗺" },
            { id: "logs", label: `Ground Responses (${responses.length})`, icon: "📝" },
            { id: "profile", label: "My Profile & Duty", icon: "👤" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                activeTab === tab.id
                  ? "bg-cyan-400 text-slate-950"
                  : "bg-slate-900 text-slate-400 hover:text-white"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={loadShipment}
          className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 font-bold"
        >
          ↻ Refresh Data
        </button>
      </div>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-5 py-6 w-full flex-1">
        {activeTab === "profile" ? (
          <DriverProfileView user={user} />
        ) : !shipment ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto mt-12">
            <div className="text-5xl mb-4">🚚</div>
            <h2 className="text-2xl font-bold">No Active Shipment Assigned</h2>
            <p className="text-slate-400 text-sm mt-2">
              You currently have no dispatches pending. Check back once Logistics
              Operations assigns a route.
            </p>
            <button
              onClick={loadShipment}
              className="mt-6 px-5 py-2.5 rounded-xl bg-cyan-400 text-slate-950 font-black hover:bg-cyan-300"
            >
              Check Again
            </button>
          </div>
        ) : (
          <>
            {/* TAB 1: OPERATIONS */}
            {activeTab === "operations" && (
              <div className="space-y-6">
                {/* SHIPMENT SUMMARY CARD */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
                        Active Consignment
                      </div>
                      <div className="text-2xl md:text-3xl font-black text-white mt-1 flex items-center gap-3">
                        {shipment.shipment_code}
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            shipment.status === "DELIVERED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : shipment.status === "DISRUPTED"
                              ? "bg-red-500/10 text-red-400 border border-red-500/30"
                              : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                          }`}
                        >
                          {shipment.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {shipment.priority_category && (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${
                          shipment.priority_category === "P0"
                            ? "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse"
                            : shipment.priority_category === "P1"
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                            : "bg-cyan-500/20 text-cyan-400 border-cyan-500/50"
                        }`}>
                          {shipment.priority_category} TIER
                        </span>
                      )}

                      {shipment.category && shipment.category !== "STANDARD_CARGO" && (
                        <span className="px-2.5 py-1 rounded-lg bg-purple-950/60 border border-purple-800 text-purple-300 text-xs font-black">
                          {shipment.category.replace("_", " ")}
                        </span>
                      )}

                      <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300">
                        Priority:{" "}
                        <span
                          className={
                            shipment.priority === "CRITICAL"
                              ? "text-red-400"
                              : "text-amber-400"
                          }
                        >
                          {shipment.priority}
                        </span>
                      </span>

                      {/* DELIVERY COMPLETION BUTTON */}
                      {shipment.status !== "DELIVERED" && (
                        <button
                          onClick={() => setShowCompleteModal(true)}
                          disabled={actionLoading}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg transition"
                        >
                          ✓ Mark Delivery Completed
                        </button>
                      )}
                    </div>
                  </div>

                  {/* SPECIAL MEDICAL / HIGH-PRIORITY TRANSPORT BANNER */}
                  {(shipment.category === "EMERGENCY_MEDICAL" ||
                    shipment.category === "URGENT_MEDICAL" ||
                    shipment.category === "MEDICINE") && (
                    <div className="mt-4 p-4 rounded-xl bg-red-950/30 border border-red-500/40 text-red-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🚑</span>
                        <span className="text-xs font-black tracking-widest text-red-400 uppercase">
                          {shipment.category === "EMERGENCY_MEDICAL"
                            ? "CRITICAL LIFE-SAVING MEDICAL SHIPMENT (P0)"
                            : "URGENT MEDICAL TRANSPORT (P1)"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                        <strong>Operational Handling Protocol:</strong> High corridor priority. Maintain continuous dispatch. Avoid unscheduled halts. Keep refrigeration/fragile packing stable.
                      </p>
                      {shipment.deadline && (
                        <div className="text-xs text-amber-300 mt-2 font-mono">
                          ⏱ Target SLA Deadline: <strong>{new Date(shipment.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(shipment.deadline).toLocaleDateString()})</strong>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-1 italic">
                        🔒 Privacy Guard: Clinical identifiers and patient health data remain restricted under healthcare privacy regulations.
                      </div>
                    </div>
                  )}

                  {/* ROUTE CORRIDOR */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 items-center">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">
                        Origin Hub
                      </div>
                      <div className="text-lg font-bold text-white mt-1">
                        {shipment.origin}
                      </div>
                      <div className="text-xs text-slate-400">
                        Current: {shipment.current_location}
                      </div>
                    </div>

                    <div className="hidden md:flex flex-col items-center justify-center text-center">
                      <div className="text-xs text-slate-500 font-bold mb-1">
                        CORRIDOR
                      </div>
                      <div className="text-cyan-400 text-2xl font-black">
                        ━━━ 🚚 ━━━▶
                      </div>
                      {recovery?.estimated_delay ? (
                        <div className="text-xs text-amber-400 mt-1 font-bold">
                          +{recovery.estimated_delay} min turnaround delay
                        </div>
                      ) : null}
                    </div>

                    <div className="bg-slate-950 border border-emerald-900/40 rounded-xl p-4">
                      <div className="text-[10px] font-bold text-emerald-500 uppercase">
                        Final Destination (Invariant)
                      </div>
                      <div className="text-lg font-bold text-emerald-400 mt-1">
                        {shipment.destination}
                      </div>
                      <div className="text-xs text-slate-400">
                        Guaranteed Delivery Target
                      </div>
                    </div>
                  </div>
                </section>

                {/* DISRUPTION & RECOVERY INSTRUCTION ALERT */}
                {recovery && (
                  <section
                    className={`rounded-2xl border p-6 shadow-xl ${
                      recoveryApproved
                        ? "bg-emerald-950/20 border-emerald-500/30"
                        : "bg-red-950/20 border-red-500/30"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black ${
                            recoveryApproved
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {recoveryApproved ? "✓" : "🚨"}
                        </div>

                        <div>
                          <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                            Operational Recovery Plan #{recovery.recovery_plan_id}
                          </div>
                          <h2 className="text-xl md:text-2xl font-black mt-1">
                            {recovery.disruption_type.replace("_", " ")}
                          </h2>
                          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                            {recovery.description ||
                              "Primary disruption affecting route."}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            recovery.severity === "CRITICAL"
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          Severity: {recovery.severity}
                        </span>

                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            recoveryApproved
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          Status: {recovery.approval_status}
                        </span>
                      </div>
                    </div>

                    {/* IMPACT SUMMARY */}
                    <div className="mt-5 bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">
                        Impact Summary
                      </div>
                      <p className="text-sm text-slate-300 mt-1">
                        {recovery.impact_summary}
                      </p>
                    </div>

                    {/* RECOMMENDED RECOVERY ACTION & UPDATED ROUTE */}
                    <div className="grid md:grid-cols-2 gap-4 mt-5">
                      <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4">
                        <div className="text-[10px] font-bold text-cyan-400 uppercase">
                          Operator Approved Action
                        </div>
                        <div className="text-base font-bold text-white mt-1">
                          {recovery.recommended_action}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Calculated cost: ₹
                          {recovery.estimated_cost.toLocaleString("en-IN")} |
                          Est. delay: {recovery.estimated_delay} min
                        </div>
                      </div>

                      <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4">
                        <div className="text-[10px] font-bold text-cyan-400 uppercase">
                          Authorized Route Corridor
                        </div>
                        <div className="text-base font-bold text-cyan-300 mt-1">
                          {recovery.recommended_route}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Destination guaranteed: {shipment.destination}
                        </div>
                      </div>
                    </div>

                    {/* THREE REAL ACTIONS FOR DRIVER */}
                    <div className="mt-6 pt-5 border-t border-slate-800">
                      <div className="text-xs font-black text-slate-400 mb-3 tracking-widest uppercase">
                        Driver Operational Response
                      </div>

                      <div className="grid sm:grid-cols-3 gap-3">
                        {/* 1. ACCEPT */}
                        <button
                          onClick={handleAcceptPlan}
                          disabled={actionLoading || hasAccepted}
                          className={`py-3 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition ${
                            hasAccepted
                              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 cursor-not-allowed"
                              : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg"
                          }`}
                        >
                          <span>✓</span>
                          <span>
                            {hasAccepted
                              ? "PLAN ACCEPTED"
                              : "ACCEPT RECOVERY PLAN"}
                          </span>
                        </button>

                        {/* 2. REPORT GROUND ISSUE */}
                        <button
                          onClick={() => setShowIssueModal(true)}
                          disabled={actionLoading}
                          className="py-3 px-4 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center gap-2 transition"
                        >
                          <span>⚠</span>
                          <span>REPORT GROUND ISSUE</span>
                        </button>

                        {/* 3. SUGGEST ROUTE */}
                        <button
                          onClick={() => setShowRouteModal(true)}
                          disabled={actionLoading}
                          className="py-3 px-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-400 font-bold text-xs flex items-center justify-center gap-2 transition"
                        >
                          <span>🛣</span>
                          <span>SUGGEST PRACTICAL ROUTE</span>
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {/* TIMELINE OF RECENT EVENTS */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-lg font-bold mb-4 flex items-center justify-between">
                    <span>Operational Audit Timeline</span>
                    <span className="text-xs text-slate-500">
                      PostgreSQL Event Stream
                    </span>
                  </h3>

                  <div className="space-y-3">
                    {events.map((ev) => (
                      <div
                        key={ev.id}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-start gap-3"
                      >
                        <span className="text-xs font-black text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                          {ev.event_type}
                        </span>
                        <div className="flex-1">
                          <p className="text-xs text-slate-200">{ev.description}</p>
                          <span className="text-[10px] text-slate-500 mt-0.5 inline-block">
                            Source: {ev.created_by} •{" "}
                            {new Date(ev.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* TAB 2: INTERACTIVE ROUTE MAP */}
            {activeTab === "map" && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="mb-4">
                  <h3 className="text-xl font-bold">Driver Live Route Navigation</h3>
                  <p className="text-slate-400 text-xs mt-1">
                    Showing origin hub, active location, disruption zone, and
                    recovery route targeting invariant destination {shipment.destination}.
                  </p>
                </div>

                <div className="rounded-xl overflow-hidden border border-slate-800 h-[600px]">
                  <LogisticsMap
                    origin={shipment.origin}
                    destination={shipment.destination}
                    currentLocation={shipment.current_location}
                    recommendedRoute={recovery?.recommended_route}
                    alternateRoute={recovery?.alternate_route}
                    disruptionType={recovery?.disruption_type}
                    vehicleType={shipment.vehicle_type}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: GROUND RESPONSES */}
            {activeTab === "logs" && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-xl font-bold mb-4">
                  My Ground Transmissions & Route Suggestions
                </h3>

                {responses.length === 0 ? (
                  <p className="text-slate-500 text-sm">
                    No ground issues or suggestions submitted yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {responses.map((r) => (
                      <div
                        key={r.id}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black px-2.5 py-1 rounded-md bg-slate-800 text-cyan-300">
                              {r.response_type}
                            </span>
                            {r.issue_type && (
                              <span className="text-xs font-semibold text-amber-400">
                                {r.issue_type}
                              </span>
                            )}
                          </div>

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${
                              r.status === "ACCEPTED"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : r.status === "REJECTED"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-yellow-500/20 text-yellow-400"
                            }`}
                          >
                            Operator: {r.status}
                          </span>
                        </div>

                        {r.description && (
                          <p className="text-xs text-slate-300 mt-2">
                            {r.description}
                          </p>
                        )}

                        {r.suggested_route && (
                          <div className="mt-2 text-xs">
                            <span className="text-slate-500 font-bold">
                              Route:{" "}
                            </span>
                            <span className="text-cyan-400 font-bold">
                              {r.suggested_route}
                            </span>
                            {r.reason && (
                              <span className="text-slate-400 ml-2">
                                (Reason: {r.reason})
                              </span>
                            )}
                          </div>
                        )}

                        {/* GROUND CONDITIONS & ESTIMATED DELAY */}
                        {(r.observed_road_condition || (r.estimated_delay_minutes !== undefined && r.estimated_delay_minutes > 0)) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            {r.observed_road_condition && (
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                                🛣 Condition: <strong className="text-cyan-400">{r.observed_road_condition}</strong>
                              </span>
                            )}
                            {r.estimated_delay_minutes !== undefined && r.estimated_delay_minutes > 0 && (
                              <span className="px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300">
                                ⏱ Delay: <strong>+{r.estimated_delay_minutes} min</strong>
                              </span>
                            )}
                          </div>
                        )}

                        {/* DRIVER GROUND NOTES */}
                        {r.driver_notes && (
                          <div className="mt-2 text-xs text-slate-300 bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
                            <span className="text-slate-500 font-bold">Driver Ground Note: </span>
                            {r.driver_notes}
                          </div>
                        )}

                        {/* AUTOMATED ROUTE VALIDATION DETAILS */}
                        {r.validation_status && r.validation_status !== "PENDING" && (
                          <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-400">Automated Route Validation:</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                r.validation_status === "VALID"
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                  : r.validation_status === "PARTIAL"
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                  : "bg-red-500/20 text-red-400 border border-red-500/40"
                              }`}>
                                {r.validation_status}
                              </span>
                            </div>

                            {r.validation_details && (
                              <div className="mt-2 space-y-1 text-slate-300">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span>Destination Invariant ({r.validation_details.destination || shipment.destination}):</span>
                                  <span className={r.validation_details.reaches_destination ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                    {r.validation_details.reaches_destination ? "✓ Preserved" : "✗ Fails Destination"}
                                  </span>
                                </div>

                                {r.validation_details.distance_km && (
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span>Corridor Distance / Travel Time:</span>
                                    <span className="text-cyan-300 font-mono">
                                      {r.validation_details.distance_km} km / ~{r.validation_details.duration_mins} mins
                                    </span>
                                  </div>
                                )}

                                {r.validation_details.validation_summary && (
                                  <div className="text-[11px] text-slate-400 mt-1 italic">
                                    "{r.validation_details.validation_summary}"
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {r.operator_notes && (
                          <div className="mt-2 text-xs bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-400">
                            <strong className="text-slate-300">
                              Operator Notes:{" "}
                            </strong>
                            {r.operator_notes}
                          </div>
                        )}

                        <div className="text-[10px] text-slate-500 mt-2">
                          Logged: {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* =========================================================
          MODAL 1: REPORT ISSUE
      ========================================================= */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="text-xl font-bold text-amber-400 flex items-center gap-2">
              <span>⚠</span> Report Ground Issue
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Submit obstacles or problems to Logistics Operations.
            </p>

            <div className="space-y-4 mt-5">
              <div>
                <label className="text-xs text-slate-400 font-bold">
                  Issue Type
                </label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-400"
                >
                  <option value="ROAD_BLOCKED">Road Blocked / Closed</option>
                  <option value="VEHICLE_ISSUE">Vehicle Mechanical Fault</option>
                  <option value="HEAVY_TRAFFIC">Heavy Gridlock Delay</option>
                  <option value="FUEL_SHORTAGE">Fuel Station Unavailable</option>
                  <option value="WEATHER_HAZARD">Severe Weather Condition</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold">
                  Severity Level
                </label>
                <select
                  value={issueSeverity}
                  onChange={(e) => setIssueSeverity(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-400"
                >
                  <option value="LOW">LOW — Minor delay</option>
                  <option value="MEDIUM">MEDIUM — Noticeable detour required</option>
                  <option value="HIGH">HIGH — Route impassable, escalation required</option>
                  <option value="CRITICAL">CRITICAL — Vehicle immobilized</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold">
                  Description & Ground Details
                </label>
                <textarea
                  rows={3}
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="Detail current location, highway mile marker, or physical issue..."
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowIssueModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleReportIssue}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs"
              >
                {actionLoading ? "Transmitting..." : "Submit to Logistics"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: SUGGEST ROUTE
      ========================================================= */}
      {showRouteModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
              <span>🛣</span> Propose Practical Route Alternative
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Suggest an optimal road or bypass based on local knowledge.
            </p>

            <div className="mt-3 p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-xs text-cyan-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-cyan-400">🎯 Destination Invariant:</span>{" "}
                <span className="font-black text-white">{shipment?.destination}</span>
              </div>
              <span className="text-[10px] text-cyan-400/80 font-mono">OSRM Validated</span>
            </div>

            <div className="space-y-4 mt-4">
              <div>
                <label className="text-xs text-slate-400 font-bold">
                  Proposed Route Corridor / Key Waypoints
                </label>
                <input
                  value={suggestedRoute}
                  onChange={(e) => setSuggestedRoute(e.target.value)}
                  placeholder="e.g. Salem - Dharmapuri - Krishnagiri - Chennai Bypass"
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-400 font-medium"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold">
                  Observed Road Condition on Ground
                </label>
                <select
                  value={observedRoadCondition}
                  onChange={(e) => setObservedRoadCondition(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-400 font-medium"
                >
                  <option value="CLEAR">Clear Highway Corridor (Good Speed)</option>
                  <option value="MODERATE_TRAFFIC">Moderate Slowdown / Minor Congestion</option>
                  <option value="HEAVY_CONGESTION">Heavy Gridlock on Primary Highway</option>
                  <option value="ROADWORK_DIVERT">Road Construction / Police Diversion Active</option>
                  <option value="WEATHER_IMPACT">Monsoon Waterlogging / Rain Hazard</option>
                  <option value="OBSTACLE">Accident / Broken Vehicle Blockade</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-bold">
                    Est. Delay / Extra Time (mins)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={estimatedDelayMinutes}
                    onChange={(e) => setEstimatedDelayMinutes(e.target.value)}
                    placeholder="0"
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-400 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-bold">
                    Estimated Advantage / Savings
                  </label>
                  <input
                    value={estimatedImprovement}
                    onChange={(e) => setEstimatedImprovement(e.target.value)}
                    placeholder="e.g. Bypasses 40m jam"
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-400 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold">
                  Operational Rationale
                </label>
                <input
                  value={suggestionReason}
                  onChange={(e) => setSuggestionReason(e.target.value)}
                  placeholder="e.g. Avoids flyover repair bottleneck and toll stoppage"
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-400 font-medium"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold">
                  Driver Ground Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={driverNotes}
                  onChange={(e) => setDriverNotes(e.target.value)}
                  placeholder="Local ground situation, bridge load limits, toll status..."
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowRouteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSuggestRoute}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs"
              >
                {actionLoading ? "Submitting..." : "Send Proposal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: MARK DELIVERY COMPLETED
      ========================================================= */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
              <span>✓</span> Confirm Delivery Completion
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Verify that consignment {shipment?.shipment_code} has arrived at{" "}
              <strong className="text-emerald-300">{shipment?.destination}</strong>.
            </p>

            <div className="mt-5">
              <label className="text-xs text-slate-400 font-bold">
                Driver Completion Notes (Optional)
              </label>
              <textarea
                rows={3}
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="Consignment safely unloaded and verified with destination logistics manager..."
                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-emerald-400"
              />
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteDelivery}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
              >
                {actionLoading ? "Recording..." : "Confirm & Complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}