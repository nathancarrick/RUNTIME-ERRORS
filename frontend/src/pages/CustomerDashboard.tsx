import { useEffect, useState } from "react";
import CustomerProfileView from "../components/CustomerProfileView";

const API = "http://127.0.0.1:8000";

interface CustomerShipment {
  id: number;
  shipment_code: string;
  origin: string;
  destination: string;
  current_location: string;
  status: string;
  priority: string;
  vehicle_number: string;
  vehicle_type: string;
  estimated_eta: string | null;
  estimated_delay: number;
  updated_eta: string | null;
  created_at: string;
  updated_at: string;
  category?: string;
  deadline?: string;
  priority_category?: string;
  customer_message: string;
  disruption_active: boolean;
  events: Array<{
    id: number;
    event_type: string;
    description: string;
    created_at: string;
  }>;
}

interface CustomerNotification {
  id: number;
  shipment_code: string;
  title: string;
  message: string;
  notification_type: string;
  updated_eta?: string | null;
  action_required: boolean;
  is_read: boolean;
  created_at: string;
}

interface CustomerDashboardProps {
  user: {
    user_id: number;
    user_code: string;
    username: string;
    full_name: string;
    role: string;
    email?: string;
    phone?: string;
    profile?: {
      address?: string;
      city?: string;
      pincode?: string;
    };
  };
  onLogout: () => void;
}

export default function CustomerDashboard({
  user,
  onLogout,
}: CustomerDashboardProps) {
  const [shipments, setShipments] = useState<CustomerShipment[]>([]);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Urgency Modal
  const [showUrgencyModal, setShowUrgencyModal] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<CustomerShipment | null>(
    null
  );
  const [urgencyMessage, setUrgencyMessage] = useState("I need this urgently.");
  const [urgencyLevel, setUrgencyLevel] = useState("HIGH");
  const [submittingUrgency, setSubmittingUrgency] = useState(false);

  const [activeTab, setActiveTab] = useState<"shipments" | "notifications" | "profile">(
    "shipments"
  );

  async function loadCustomerData() {
    try {
      setLoading(true);
      setError("");

      const [shipmentsRes, notifsRes] = await Promise.all([
        fetch(
          `${API}/api/customer/${user.user_id}/shipments?auth_user_id=${user.user_id}&auth_user_role=CUSTOMER`
        ),
        fetch(
          `${API}/api/customer/${user.user_id}/notifications?auth_user_id=${user.user_id}&auth_user_role=CUSTOMER`
        ),
      ]);

      if (!shipmentsRes.ok) {
        throw new Error("Unable to load customer shipments.");
      }

      const shipmentsData = await shipmentsRes.json();
      setShipments(shipmentsData);

      if (notifsRes.ok) {
        const notifsData = await notifsRes.json();
        setNotifications(notifsData.notifications || []);
        setUnreadCount(notifsData.unread_count || 0);
      }
    } catch (err: any) {
      setError(err.message || "Unable to load shipments from PostgreSQL.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomerData();
  }, [user.user_id]);

  async function handleMarkRead(notifId: number) {
    try {
      const res = await fetch(`${API}/api/customer/notifications/${notifId}/mark-read`, {
        method: "POST",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleMarkAllRead() {
    try {
      const res = await fetch(
        `${API}/api/customer/notifications/mark-all-read?customer_id=${user.user_id}`,
        { method: "POST" }
      );
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRequestUrgency() {
    if (!selectedShipment || !urgencyMessage.trim()) return;

    try {
      setSubmittingUrgency(true);
      setError("");
      setSuccessMsg("");

      const response = await fetch(`${API}/api/customer-urgency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_code: selectedShipment.shipment_code,
          customer_id: user.user_id,
          message: urgencyMessage.trim(),
          urgency_level: urgencyLevel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to submit urgency request.");
      }

      setShowUrgencyModal(false);
      setSuccessMsg(
        `⚡ Urgency request (${urgencyLevel}) registered! Evaluated by Fair Priority Engine in PostgreSQL.`
      );
      await loadCustomerData();
    } catch (err: any) {
      setError(err.message || "Failed to submit urgency request.");
    } finally {
      setSubmittingUrgency(false);
    }
  }

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
              CUSTOMER TRACKING
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-bold">{user.full_name}</div>
              <div className="text-[11px] text-slate-400">
                Customer ID:{" "}
                <span className="text-cyan-400 font-semibold">
                  {user.user_code}
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
      </div>

      {/* TABS */}
      <div className="max-w-7xl mx-auto px-5 w-full flex items-center justify-between border-b border-slate-800 pb-2 mt-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("shipments")}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === "shipments"
                ? "bg-cyan-400 text-slate-950 font-black"
                : "bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            <span>📦</span>
            <span>My Shipments ({shipments.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("notifications")}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === "notifications"
                ? "bg-cyan-400 text-slate-950 font-black"
                : "bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            <span>🔔</span>
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === "profile"
                ? "bg-cyan-400 text-slate-950 font-black"
                : "bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            <span>👤</span>
            <span>My Profile</span>
          </button>
        </div>

        <button
          onClick={loadCustomerData}
          className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 font-bold"
        >
          ↻ Refresh Status
        </button>
      </div>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-5 py-6 w-full flex-1">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-cyan-400 font-bold">
              Fetching tracking status from PostgreSQL...
            </div>
          </div>
        ) : activeTab === "shipments" ? (
          shipments.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto mt-12">
              <div className="text-5xl mb-4">📦</div>
              <h2 className="text-2xl font-bold">No Consignments Found</h2>
              <p className="text-slate-400 text-sm mt-2">
                There are currently no active deliveries linked to your customer ID.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {shipments.map((shp) => (
                <div
                  key={shp.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6"
                >
                  {/* TOP HEADER */}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
                        Consignment Code
                      </div>
                      <div className="text-3xl font-black text-white mt-1 flex items-center gap-3">
                        {shp.shipment_code}
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            shp.status === "DELIVERED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : shp.status === "DISRUPTED"
                              ? "bg-red-500/10 text-red-400 border border-red-500/30"
                              : "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                          }`}
                        >
                          {shp.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {shp.priority_category && (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${
                          shp.priority_category === "P0"
                            ? "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse"
                            : shp.priority_category === "P1"
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                            : "bg-cyan-500/20 text-cyan-400 border-cyan-500/50"
                        }`}>
                          {shp.priority_category} TIER
                        </span>
                      )}

                      {shp.category && shp.category !== "STANDARD_CARGO" && (
                        <span className="px-2.5 py-1 rounded-lg bg-purple-950/60 border border-purple-800 text-purple-300 text-xs font-black">
                          {shp.category.replace("_", " ")}
                        </span>
                      )}

                      <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300">
                        Priority:{" "}
                        <span
                          className={
                            shp.priority === "CRITICAL"
                              ? "text-red-400 font-black"
                              : "text-amber-400"
                          }
                        >
                          {shp.priority}
                        </span>
                      </span>

                      {/* URGENCY BUTTON */}
                      {shp.status !== "DELIVERED" && (
                        <button
                          onClick={() => {
                            setSelectedShipment(shp);
                            setShowUrgencyModal(true);
                          }}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center gap-1.5"
                        >
                          <span>⚡</span>
                          <span>Request Urgent Delivery</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ROUTE PROGRESS */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">
                        Dispatch Origin
                      </div>
                      <div className="text-lg font-bold text-white mt-1">
                        {shp.origin}
                      </div>
                      <div className="text-xs text-slate-400">
                        Current: {shp.current_location}
                      </div>
                    </div>

                    <div className="hidden md:flex flex-col items-center justify-center text-center">
                      <div className="text-xs text-slate-500 font-bold mb-1">
                        IN TRANSIT
                      </div>
                      <div className="text-cyan-400 text-2xl font-black">
                        ━━━━ 🚚 ━━━━▶
                      </div>
                      {shp.estimated_delay > 0 ? (
                        <div className="text-xs text-amber-400 mt-1 font-bold">
                          +{shp.estimated_delay} min delay
                        </div>
                      ) : (
                        <div className="text-xs text-emerald-400 mt-1 font-bold">
                          On Schedule
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-950 border border-emerald-900/40 rounded-xl p-4">
                      <div className="text-[10px] font-bold text-emerald-500 uppercase">
                        Delivery Destination
                      </div>
                      <div className="text-lg font-bold text-emerald-400 mt-1">
                        {shp.destination}
                      </div>
                      <div className="text-xs text-slate-400">
                        Final Delivery Hub
                      </div>
                    </div>
                  </div>

                  {/* CUSTOMER NOTICE CARD */}
                  <div
                    className={`rounded-xl border p-5 ${
                      shp.status === "DELIVERED"
                        ? "bg-emerald-950/20 border-emerald-500/30"
                        : shp.disruption_active
                        ? "bg-amber-950/30 border-amber-500/40"
                        : "bg-slate-950 border-slate-800"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">
                        {shp.status === "DELIVERED"
                          ? "🎉"
                          : shp.disruption_active
                          ? "ℹ️"
                          : "🚚"}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Delivery Status Update
                        </div>
                        <p className="text-sm font-semibold text-slate-200 mt-1">
                          {shp.customer_message}
                        </p>
                        <div className="text-xs text-slate-400 mt-2">
                          Last Updated:{" "}
                          {new Date(shp.updated_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TRACKING TIMELINE */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Milestone Tracking History
                    </h4>
                    <div className="space-y-2">
                      {shp.events.map((ev) => (
                        <div
                          key={ev.id}
                          className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-start gap-3 text-xs"
                        >
                          <span className="font-bold text-cyan-400 min-w-max">
                            {ev.event_type.replace(/_/g, " ")}:
                          </span>
                          <span className="text-slate-300 flex-1">
                            {ev.description}
                          </span>
                          <span className="text-slate-500 text-[10px] min-w-max">
                            {new Date(ev.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === "notifications" ? (
          /* TAB 2: NOTIFICATIONS */
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-white">In-App Tracking Notifications</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Live PostgreSQL notifications for route deviations, weather disruptions, and ETA changes.
                </p>
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 hover:text-cyan-300 text-xs font-bold"
                >
                  ✓ Mark All as Read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                <div className="text-4xl mb-3">🔔</div>
                <h3 className="text-lg font-bold text-slate-400">No Notifications Yet</h3>
                <p className="text-xs text-slate-500 mt-1">
                  You will receive real-time updates as your active consignments progress along the corridor.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`rounded-2xl border p-5 transition ${
                      notif.is_read
                        ? "bg-slate-900/50 border-slate-800/80 text-slate-300"
                        : "bg-slate-900 border-cyan-500/50 shadow-lg text-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          {!notif.is_read && (
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                          )}
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded bg-slate-950 text-cyan-400 border border-slate-800 tracking-wider">
                            {notif.notification_type}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-400">
                            {notif.shipment_code}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-white">{notif.title}</h3>
                        <p className="text-xs text-slate-300 leading-relaxed">{notif.message}</p>

                        {notif.updated_eta && (
                          <div className="text-xs text-amber-300 font-mono mt-1">
                            ⏱ Updated ETA: {new Date(notif.updated_eta).toLocaleString()}
                          </div>
                        )}

                        <div className="text-[10px] text-slate-500 pt-1">
                          Received: {new Date(notif.created_at).toLocaleString()}
                        </div>
                      </div>

                      {!notif.is_read && (
                        <button
                          onClick={() => handleMarkRead(notif.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-cyan-400 hover:text-white text-xs font-bold shrink-0 transition"
                        >
                          Mark Read
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* TAB 3: PROFILE */
          <CustomerProfileView user={user} />
        )}
      </main>

      {/* =========================================================
          MODAL: REQUEST URGENT DELIVERY
      ========================================================= */}
      {showUrgencyModal && selectedShipment && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="text-xl font-bold text-amber-400 flex items-center gap-2">
              <span>⚡</span> Request Urgent Delivery
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Mark consignment{" "}
              <strong className="text-white">
                {selectedShipment.shipment_code}
              </strong>{" "}
              for priority escalation in the LOGIAID Decision Engine.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-bold">
                  Urgency Classification Level
                </label>
                <select
                  value={urgencyLevel}
                  onChange={(e) => setUrgencyLevel(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-400 font-semibold"
                >
                  <option value="STANDARD">STANDARD — Expedited delivery requested</option>
                  <option value="HIGH">HIGH — Critical business deadline / strict SLA</option>
                  <option value="CRITICAL">CRITICAL — Urgent medical supplies / life-critical need</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold">
                  Urgency Request Reason / Context
                </label>
                <textarea
                  rows={3}
                  value={urgencyMessage}
                  onChange={(e) => setUrgencyMessage(e.target.value)}
                  placeholder="I need this urgently for medical / critical business supplies..."
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  "I need this urgently.",
                  "Urgent medical / hospital supplies.",
                  "Critical deadline: immediate delivery required.",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setUrgencyMessage(preset)}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-300 hover:border-amber-500/40"
                  >
                    "{preset}"
                  </button>
                ))}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                ⚖ <strong>Fair Logistics Policy:</strong> The Decision Engine evaluates all requests objectively. Verified medical emergencies receive top corridor precedence; requests with equal urgency are fairly tie-broken using original order submission time.
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowUrgencyModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestUrgency}
                disabled={submittingUrgency}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs"
              >
                {submittingUrgency ? "Escalating..." : "Submit Urgency Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
