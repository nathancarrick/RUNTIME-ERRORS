import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface Shipment {
  id: number;
  shipment_code: string;
  customer_id?: number | null;
  driver_id?: number | null;
  origin: string;
  destination: string;
  current_location?: string;
  status: string;
  priority: string;
  vehicle_number?: string;
  vehicle_type?: string;
  estimated_eta?: string | null;
  created_at?: string;
  updated_at?: string;
  driver_name?: string | null;
}

export default function OperatorShipments() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [selectedShipmentCode, setSelectedShipmentCode] = useState<string | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  async function viewTimeline(code: string) {
    setSelectedShipmentCode(code);
    setLoadingTimeline(true);
    try {
      const res = await fetch(`${API}/api/shipments/${code}/events`);
      const data = await res.json();
      setTimelineEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTimeline(false);
    }
  }

  async function loadShipments() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API}/api/shipments`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to load shipments"
        );
      }

      setShipments(data);
    } catch (err: any) {
      setError(
        err.message || "Unable to load shipments"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadShipments();
  }, []);

  const filteredShipments = shipments.filter((shipment) => {
    const query = search.toLowerCase();

    return (
      shipment.shipment_code
        .toLowerCase()
        .includes(query) ||
      shipment.origin
        .toLowerCase()
        .includes(query) ||
      shipment.destination
        .toLowerCase()
        .includes(query) ||
      (shipment.driver_name || "")
        .toLowerCase()
        .includes(query)
    );
  });

  function statusClass(status: string) {
    switch (status.toUpperCase()) {
      case "IN_TRANSIT":
        return "bg-blue-500/10 text-blue-400";

      case "DELIVERED":
        return "bg-emerald-500/10 text-emerald-400";

      case "DISRUPTED":
        return "bg-red-500/10 text-red-400";

      case "PENDING":
        return "bg-yellow-500/10 text-yellow-400";

      default:
        return "bg-slate-500/10 text-slate-400";
    }
  }

  function priorityClass(priority: string) {
    switch (priority.toUpperCase()) {
      case "CRITICAL":
        return "text-red-400";

      case "HIGH":
        return "text-orange-400";

      case "MEDIUM":
        return "text-yellow-400";

      case "LOW":
        return "text-emerald-400";

      default:
        return "text-slate-400";
    }
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Shipment Management
          </h1>

          <p className="mt-1 text-slate-400">
            Monitor active shipments and operational status.
          </p>
        </div>

        <button
          onClick={loadShipments}
          className="rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 font-medium text-slate-300 hover:border-cyan-400 hover:text-cyan-400"
        >
          ↻ Refresh
        </button>
      </div>

      {/* ERROR */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-red-400">
            {error}
          </p>
        </div>
      )}

      {/* STATS */}
      <div className="grid gap-4 md:grid-cols-4">

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Total Shipments
          </p>

          <p className="mt-2 text-3xl font-bold text-cyan-400">
            {shipments.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            In Transit
          </p>

          <p className="mt-2 text-3xl font-bold text-blue-400">
            {
              shipments.filter(
                (shipment) =>
                  shipment.status === "IN_TRANSIT"
              ).length
            }
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Disrupted
          </p>

          <p className="mt-2 text-3xl font-bold text-red-400">
            {
              shipments.filter(
                (shipment) =>
                  shipment.status === "DISRUPTED"
              ).length
            }
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Delivered
          </p>

          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {
              shipments.filter(
                (shipment) =>
                  shipment.status === "DELIVERED"
              ).length
            }
          </p>
        </div>

      </div>

      {/* SEARCH */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <label className="label">
          Search Shipments
        </label>

        <input
          className="input"
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          placeholder="Search shipment ID, origin, destination or driver..."
        />
      </div>

      {/* SHIPMENTS */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">

        <div className="border-b border-slate-800 p-5">
          <h2 className="text-lg font-semibold text-white">
            Live Shipment Operations
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Shipment data is loaded directly from LOGIAID PostgreSQL.
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400">
            Loading shipments...
          </div>
        ) : filteredShipments.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-slate-400">
              No shipments found.
            </p>

            {search && (
              <p className="mt-2 text-sm text-slate-600">
                Try another search.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full text-left">

              <thead className="bg-slate-950">
                <tr>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Shipment
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Route
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Driver
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Vehicle
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Priority
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Status
                  </th>

                </tr>
              </thead>

              <tbody>

                {filteredShipments.map((shipment) => (
                  <tr
                    key={shipment.id}
                    className="border-t border-slate-800 hover:bg-slate-800/40"
                  >

                    {/* SHIPMENT */}
                    <td className="px-5 py-5">

                      <p className="font-mono font-semibold text-cyan-400">
                        {shipment.shipment_code}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        ID: {shipment.id}
                      </p>

                    </td>

                    {/* ROUTE */}
                    <td className="px-5 py-5">

                      <p className="font-medium text-white">
                        {shipment.origin}
                      </p>

                      <p className="my-1 text-xs text-cyan-400">
                        ↓
                      </p>

                      <p className="font-medium text-white">
                        {shipment.destination}
                      </p>

                      {shipment.current_location && (
                        <p className="mt-2 text-xs text-slate-500">
                          Current:{" "}
                          {shipment.current_location}
                        </p>
                      )}

                    </td>

                    {/* DRIVER */}
                    <td className="px-5 py-5">

                      <p className="font-medium text-white">
                        {shipment.driver_name || "Unassigned"}
                      </p>

                      {shipment.driver_id && (
                        <p className="text-xs text-slate-500">
                          Driver ID: {shipment.driver_id}
                        </p>
                      )}

                    </td>

                    {/* VEHICLE */}
                    <td className="px-5 py-5">

                      <p className="font-medium text-white">
                        {shipment.vehicle_number || "-"}
                      </p>

                      <p className="text-xs text-slate-500">
                        {shipment.vehicle_type || "-"}
                      </p>

                    </td>

                    {/* PRIORITY */}
                    <td className="px-5 py-5">

                      <span
                        className={`font-semibold ${priorityClass(
                          shipment.priority
                        )}`}
                      >
                        {shipment.priority}
                      </span>

                    </td>

                    {/* STATUS */}
                    <td className="px-5 py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                          shipment.status
                        )}`}
                      >
                        {shipment.status.replace("_", " ")}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td className="px-5 py-5">
                      <button
                        onClick={() => viewTimeline(shipment.shipment_code)}
                        className="px-3 py-1.5 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400 hover:bg-cyan-900 text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <span>📋</span>
                        <span>Audit History</span>
                      </button>
                    </td>

                  </tr>
                ))}

              </tbody>

            </table>

          </div>
        )}

      </div>

      {/* TIMELINE MODAL */}
      {selectedShipmentCode && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black tracking-widest text-cyan-400 uppercase">
                  OPERATIONAL AUDIT TRAIL
                </span>
                <h3 className="text-xl font-black text-white mt-1">
                  Shipment {selectedShipmentCode} History
                </h3>
              </div>
              <button
                onClick={() => setSelectedShipmentCode(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {loadingTimeline ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Loading events from PostgreSQL...
                </div>
              ) : timelineEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No lifecycle events recorded for this shipment.
                </div>
              ) : (
                timelineEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-start gap-3"
                  >
                    <span className="text-[10px] font-black text-cyan-300 bg-cyan-950/80 border border-cyan-800/80 px-2 py-0.5 rounded min-w-max">
                      {ev.event_type}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs text-slate-200">{ev.description}</p>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        Logged by: {ev.created_by} • {new Date(ev.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedShipmentCode(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}