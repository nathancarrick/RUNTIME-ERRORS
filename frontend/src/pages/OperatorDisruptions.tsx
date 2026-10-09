import { useState } from "react";
import LogisticsMap from "../components/LogisticsMap";

const API = "http://localhost:8000";

type RouteSelection =
  | "RECOMMENDED"
  | "ALTERNATIVE_1"
  | "ALTERNATIVE_2";

interface AlternativeAction {
  action: string;
  estimated_delay: number;
  estimated_cost: number;
  risk: number;
  decision_score: number;
}

interface AnalysisResult {
  success: boolean;
  disruption_id: number;
  recovery_plan_id: number;
  shipment_id: string;
  shipment_status: string;
  origin: string;
  destination: string;
  current_location: string;
  driver_id: number | null;
  vehicle_number: string;
  vehicle_type: string;
  disruption_type: string;
  severity: string;
  location: string;
  priority: string;
  severity_score: number;
  impact_summary: string;
  estimated_delay: number;
  estimated_cost: number;
  capacity_impact: number;
  alternative_actions: AlternativeAction[];
  recommended_action: string;
  recommendation_reason: string;
  recommended_route: string;
  alternate_route: string;
  approval_status: string;
  execution_status: string;
}

export default function OperatorDisruptions() {
  const [shipmentId, setShipmentId] =
    useState("SHP-LOGI-001");

  const [disruptionType, setDisruptionType] =
    useState("VEHICLE_BREAKDOWN");

  const [severity, setSeverity] =
    useState("CRITICAL");

  const [location, setLocation] =
    useState("Coimbatore Logistics Hub");

  const [description, setDescription] = useState(
    "Primary delivery vehicle broke down during active shipment."
  );

  const [result, setResult] =
    useState<AnalysisResult | null>(null);

  const [selectedRoute, setSelectedRoute] =
    useState<RouteSelection>("RECOMMENDED");

  const [loading, setLoading] =
    useState(false);

  const [approving, setApproving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  async function analyzeDisruption() {
    try {
      setLoading(true);
      setError("");
      setSuccessMessage("");
      setResult(null);

      const response = await fetch(
        `${API}/api/disruptions/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shipment_id: shipmentId,
            disruption_type: disruptionType,
            severity,
            location,
            description,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to analyze disruption"
        );
      }

      setResult(data);

      setSelectedRoute("RECOMMENDED");
    } catch (err: any) {
      setError(
        err.message ||
          "Unable to analyze disruption"
      );
    } finally {
      setLoading(false);
    }
  }

  async function approveRecovery() {
    if (!result) {
      return;
    }

    try {
      setApproving(true);
      setError("");
      setSuccessMessage("");

      const response = await fetch(
        `${API}/api/recovery-plans/${result.recovery_plan_id}/approve?selected_route=${selectedRoute}`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to approve recovery plan"
        );
      }

      setResult((previous) =>
        previous
          ? {
              ...previous,
              approval_status: "APPROVED",
              execution_status:
                data.execution_status ||
                "EXECUTED",
            }
          : previous
      );

      setSuccessMessage(
        `✓ Recovery plan approved! ${
          selectedRoute === "RECOMMENDED"
            ? "Decision engine recommended route"
            : "Alternative route"
        } dispatched to assigned driver.`
      );
    } catch (err: any) {
      setError(
        err.message ||
          "Unable to approve recovery plan"
      );
    } finally {
      setApproving(false);
    }
  }

  async function reevaluateRecovery() {
    if (!result) {
      return;
    }

    try {
      setApproving(true);
      setError("");
      setSuccessMessage("");

      const response = await fetch(
        `${API}/api/recovery-plans/${result.recovery_plan_id}/reevaluate`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to re-evaluate recovery plan"
        );
      }

      setResult((previous) =>
        previous
          ? {
              ...previous,
              recovery_plan_id: data.recovery_plan_id,
              priority: data.priority,
              recommended_action: data.recommended_action,
              recommendation_reason: data.recommendation_reason,
              impact_summary: data.impact_summary,
              estimated_delay: data.estimated_delay,
              estimated_cost: data.estimated_cost,
              recommended_route: data.recommended_route,
              alternate_route: data.alternate_route,
              alternative_actions: data.alternative_actions,
              approval_status: "PENDING",
              execution_status: "PENDING",
            }
          : previous
      );

      setSuccessMessage(
        "⚡ Plan re-evaluated by Explainable Decision Engine! Priority upgraded and emergency recovery plan generated."
      );
    } catch (err: any) {
      setError(
        err.message ||
          "Unable to re-evaluate recovery plan"
      );
    } finally {
      setApproving(false);
    }
  }

  function priorityClass(
    priority: string
  ) {
    switch (priority.toUpperCase()) {
      case "CRITICAL":
        return "border-red-500/30 bg-red-500/10 text-red-400";

      case "HIGH":
        return "border-orange-500/30 bg-orange-500/10 text-orange-400";

      case "MEDIUM":
        return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";

      default:
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    }
  }

  function severityClass(
    value: string
  ) {
    switch (value.toUpperCase()) {
      case "CRITICAL":
        return "text-red-400";

      case "HIGH":
        return "text-orange-400";

      case "MEDIUM":
        return "text-yellow-400";

      default:
        return "text-emerald-400";
    }
  }

  return (
    <div className="space-y-6">

      {/* ============================================================
          HEADER
      ============================================================ */}

      <div>
        <h1 className="text-3xl font-bold text-white">
          Disruption Control
        </h1>

        <p className="mt-1 text-slate-400">
          Detect disruptions, analyze impact and
          select the best recovery route.
        </p>
      </div>

      {/* ============================================================
          ERROR
      ============================================================ */}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="font-medium text-red-400">
            {error}
          </p>
        </div>
      )}

      {/* ============================================================
          SUCCESS
      ============================================================ */}

      {successMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="font-medium text-emerald-400">
            {successMessage}
          </p>
        </div>
      )}

      {/* ============================================================
          DISRUPTION INPUT
      ============================================================ */}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">

        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white">
            Report Disruption
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Enter the disruption affecting an
            active shipment.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">

          {/* SHIPMENT */}

          <div>
            <label className="label">
              Shipment ID
            </label>

            <input
              className="input"
              value={shipmentId}
              onChange={(e) =>
                setShipmentId(e.target.value)
              }
              placeholder="SHP-LOGI-001"
            />
          </div>

          {/* DISRUPTION */}

          <div>
            <label className="label">
              Disruption Type
            </label>

            <select
              className="input"
              value={disruptionType}
              onChange={(e) =>
                setDisruptionType(e.target.value)
              }
            >
              <option value="ROAD_BLOCK">
                Road Block
              </option>

              <option value="VEHICLE_BREAKDOWN">
                Vehicle Breakdown
              </option>

              <option value="WEATHER">
                Severe Weather
              </option>

              <option value="PORT_DELAY">
                Port Delay
              </option>

              <option value="FUEL_SHORTAGE">
                Fuel Shortage
              </option>
            </select>
          </div>

          {/* SEVERITY */}

          <div>
            <label className="label">
              Severity
            </label>

            <select
              className="input"
              value={severity}
              onChange={(e) =>
                setSeverity(e.target.value)
              }
            >
              <option value="LOW">
                Low
              </option>

              <option value="MEDIUM">
                Medium
              </option>

              <option value="HIGH">
                High
              </option>

              <option value="CRITICAL">
                Critical
              </option>
            </select>
          </div>

          {/* LOCATION */}

          <div>
            <label className="label">
              Disruption Location
            </label>

            <input
              className="input"
              value={location}
              onChange={(e) =>
                setLocation(e.target.value)
              }
              placeholder="Coimbatore Logistics Hub"
            />
          </div>

          {/* DESCRIPTION */}

          <div className="md:col-span-2">
            <label className="label">
              Description
            </label>

            <textarea
              className="input min-h-[120px] resize-none"
              value={description}
              onChange={(e) =>
                setDescription(e.target.value)
              }
              placeholder="Describe what happened..."
            />
          </div>

        </div>

        <button
          onClick={analyzeDisruption}
          disabled={loading}
          className="mt-6 rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Analyzing Disruption..."
            : "Analyze Disruption"}
        </button>

      </div>

      {/* ============================================================
          RESULTS
      ============================================================ */}

      {result && (
        <div className="space-y-6">

          {/* ========================================================
              KPI CARDS
          ======================================================== */}

          <div className="grid gap-4 md:grid-cols-4">

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">

              <p className="text-sm text-slate-400">
                Priority
              </p>

              <div
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${priorityClass(
                  result.priority
                )}`}
              >
                {result.priority}
              </div>

            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">

              <p className="text-sm text-slate-400">
                Severity Score
              </p>

              <p className="mt-2 text-3xl font-bold text-red-400">
                {result.severity_score}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                / 100
              </p>

            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">

              <p className="text-sm text-slate-400">
                Estimated Delay
              </p>

              <p className="mt-2 text-3xl font-bold text-orange-400">
                {result.estimated_delay}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                minutes
              </p>

            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">

              <p className="text-sm text-slate-400">
                Estimated Cost
              </p>

              <p className="mt-2 text-3xl font-bold text-yellow-400">
                ₹
                {result.estimated_cost.toLocaleString()}
              </p>

            </div>

          </div>

          {/* ========================================================
              SHIPMENT IMPACT
          ======================================================== */}

          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">

              <div>

                <p className="text-sm font-medium uppercase tracking-wider text-red-400">
                  Shipment Disrupted
                </p>

                <h2 className="mt-2 text-2xl font-bold text-white">
                  {result.shipment_id}
                </h2>

                <p className="mt-2 text-slate-400">
                  {result.impact_summary}
                </p>

              </div>

              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-5 py-4 text-center">

                <p className="text-xs text-slate-400">
                  Capacity Impact
                </p>

                <p className="mt-1 text-2xl font-bold text-red-400">
                  {result.capacity_impact}%
                </p>

              </div>

            </div>

          </div>

          {/* ========================================================
              SHIPMENT DETAILS
          ======================================================== */}

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">

            <h2 className="text-lg font-semibold text-white">
              Shipment Details
            </h2>

            <div className="mt-5 grid gap-5 md:grid-cols-3">

              <div>

                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Route
                </p>

                <p className="mt-1 font-medium text-white">
                  {result.origin}
                </p>

                <p className="my-1 text-cyan-400">
                  ↓
                </p>

                <p className="font-medium text-white">
                  {result.destination}
                </p>

              </div>

              <div>

                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Current Location
                </p>

                <p className="mt-2 text-white">
                  {result.current_location}
                </p>

              </div>

              <div>

                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Vehicle
                </p>

                <p className="mt-2 font-medium text-white">
                  {result.vehicle_number}
                </p>

                <p className="text-sm text-slate-400">
                  {result.vehicle_type}
                </p>

              </div>

            </div>

            <div className="mt-6 grid gap-5 border-t border-slate-800 pt-5 md:grid-cols-3">

              <div>

                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Driver
                </p>

                <p className="mt-2 text-white">
                  {result.driver_id
                    ? `DRV-${String(
                        result.driver_id
                      ).padStart(4, "0")}`
                    : "Unassigned"}
                </p>

              </div>

              <div>

                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Disruption
                </p>

                <p className="mt-2 text-white">
                  {result.disruption_type.replace(
                    /_/g,
                    " "
                  )}
                </p>

              </div>

              <div>

                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Severity
                </p>

                <p
                  className={`mt-2 font-semibold ${severityClass(
                    result.severity
                  )}`}
                >
                  {result.severity}
                </p>

              </div>

            </div>

          </div>

          {/* ========================================================
              MAP
          ======================================================== */}

          <LogisticsMap
            origin={result.origin}
            destination={result.destination}
            currentLocation={
              result.current_location
            }
            recommendedRoute={"RECOMMENDED"}
            alternateRoute={"ALTERNATIVE_1"}
          />

          {/* ========================================================
              ROUTE SELECTION
          ======================================================== */}

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">

              <div>

                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Recovery Route Selection
                </p>

                <h2 className="mt-2 text-xl font-bold text-white">
                  Choose the route to execute
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Operator has final approval before
                  shipment recovery.
                </p>

              </div>

              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-5 py-3">

                <p className="text-xs text-slate-500">
                  Selected Route
                </p>

                <p className="mt-1 font-bold text-cyan-400">
                  {selectedRoute ===
                  "RECOMMENDED"
                    ? "AI RECOMMENDED"
                    : "ALTERNATIVE 1"}
                </p>

              </div>

            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">

              {/* RECOMMENDED */}

              <button
                type="button"
                onClick={() =>
                  setSelectedRoute(
                    "RECOMMENDED"
                  )
                }
                className={`rounded-xl border p-5 text-left transition ${
                  selectedRoute ===
                  "RECOMMENDED"
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-950 hover:border-emerald-500/50"
                }`}
              >

                <div className="flex items-center justify-between">

                  <p className="font-semibold text-emerald-400">
                    🟢 AI Recommended Route
                  </p>

                  {selectedRoute ===
                    "RECOMMENDED" && (
                    <span className="rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-bold text-slate-950">
                      SELECTED
                    </span>
                  )}

                </div>

                <p className="mt-3 text-sm leading-6 text-white">
                  {result.recommended_route}
                </p>

                <p className="mt-3 text-xs text-slate-500">
                  Best balance of delay, cost and
                  operational risk.
                </p>

              </button>

              {/* ALTERNATIVE */}

              <button
                type="button"
                onClick={() =>
                  setSelectedRoute(
                    "ALTERNATIVE_1"
                  )
                }
                className={`rounded-xl border p-5 text-left transition ${
                  selectedRoute ===
                  "ALTERNATIVE_1"
                    ? "border-yellow-400 bg-yellow-500/10"
                    : "border-slate-700 bg-slate-950 hover:border-yellow-500/50"
                }`}
              >

                <div className="flex items-center justify-between">

                  <p className="font-semibold text-yellow-400">
                    🟡 Alternative Route
                  </p>

                  {selectedRoute ===
                    "ALTERNATIVE_1" && (
                    <span className="rounded-full bg-yellow-400 px-2 py-1 text-[10px] font-bold text-slate-950">
                      SELECTED
                    </span>
                  )}

                </div>

                <p className="mt-3 text-sm leading-6 text-white">
                  {result.alternate_route}
                </p>

                <p className="mt-3 text-xs text-slate-500">
                  Backup route if the recommended
                  recovery cannot be executed.
                </p>

              </button>

            </div>

          </div>

          {/* ========================================================
              ALTERNATIVE ACTIONS
          ======================================================== */}

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">

            <h2 className="text-lg font-semibold text-white">
              Alternative Recovery Actions
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Ranked by operational decision score.
            </p>

            <div className="mt-5 space-y-3">

              {result.alternative_actions.map(
                (action, index) => (
                  <div
                    key={action.action}
                    className={`rounded-lg border p-4 ${
                      index === 0
                        ? "border-cyan-500/30 bg-cyan-500/5"
                        : "border-slate-800 bg-slate-950"
                    }`}
                  >

                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">

                      <div className="flex items-start gap-4">

                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-cyan-400">
                          {index + 1}
                        </div>

                        <div>

                          <p className="font-semibold text-white">
                            {action.action}
                          </p>

                          {index === 0 && (
                            <span className="mt-1 inline-block text-xs font-semibold text-cyan-400">
                              RECOMMENDED
                            </span>
                          )}

                        </div>

                      </div>

                      <div className="grid grid-cols-3 gap-6 text-sm">

                        <div>
                          <p className="text-xs text-slate-500">
                            Delay
                          </p>

                          <p className="mt-1 text-white">
                            {action.estimated_delay} min
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">
                            Cost
                          </p>

                          <p className="mt-1 text-white">
                            ₹
                            {action.estimated_cost.toLocaleString()}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">
                            Risk
                          </p>

                          <p className="mt-1 text-white">
                            {action.risk}%
                          </p>
                        </div>

                      </div>

                    </div>

                  </div>
                )
              )}

            </div>

          </div>

          {/* ========================================================
              APPROVAL
          ======================================================== */}

          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-6">

            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">

              <div>

                <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                  Operator Decision Required
                </p>

                <h2 className="mt-2 text-xl font-bold text-white">
                  Approve Shipment Recovery
                </h2>

                <p className="mt-2 text-sm text-slate-400">
                  Selected route:
                </p>

                <p className="mt-1 font-semibold text-cyan-400">
                  {selectedRoute ===
                  "RECOMMENDED"
                    ? result.recommended_route
                    : result.alternate_route}
                </p>

                <div className="mt-4 flex flex-wrap gap-3">

                  <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-400">
                    Approval:{" "}
                    {result.approval_status}
                  </span>

                  <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
                    Execution:{" "}
                    {result.execution_status}
                  </span>

                </div>

              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={reevaluateRecovery}
                  disabled={approving}
                  className="rounded-lg bg-rose-500/10 border border-rose-500/40 px-5 py-3 font-bold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  <span>🔄</span>
                  <span>{approving ? "Evaluating..." : "Re-Evaluate Plan"}</span>
                </button>

                <button
                  onClick={approveRecovery}
                  disabled={
                    approving ||
                    result.approval_status === "APPROVED"
                  }
                  className="rounded-lg bg-emerald-500 px-7 py-3 font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 text-sm"
                >
                  {approving
                    ? "Approving..."
                    : result.approval_status === "APPROVED"
                    ? "✓ Recovery Approved"
                    : "Approve & Dispatch"}
                </button>
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}