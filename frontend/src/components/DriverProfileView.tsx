import { useState, useEffect, useRef } from "react";

const API = "http://127.0.0.1:8000";

interface DriverProfileViewProps {
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
      availability_status?: string;
    };
  };
}

interface SecurityEvent {
  id: number;
  event_type: string;
  description: string;
  ip_address: string;
  created_at: string;
}

export default function DriverProfileView({ user }: DriverProfileViewProps) {
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Editable fields
  const [fullName, setFullName] = useState(user.full_name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [state, setState] = useState("Tamil Nadu");
  const [prefNotif, setPrefNotif] = useState("IN_APP");
  const [availabilityStatus, setAvailabilityStatus] = useState("AVAILABLE");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security events
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    loadProfile();
    loadSecurityEvents();
  }, [user.user_id]);

  async function loadProfile() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API}/api/profile/me?user_id=${user.user_id}`);
      if (!res.ok) throw new Error("Failed to load driver profile.");
      const data = await res.json();
      const u = data.user;
      setProfileData(u);
      setFullName(u.full_name || "");
      setPhone(u.phone || "");
      setState(u.state || "Tamil Nadu");
      setPrefNotif(u.preferred_notification_method || "IN_APP");
      if (u.profile?.availability_status) {
        setAvailabilityStatus(u.profile.availability_status);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSecurityEvents() {
    try {
      const res = await fetch(`${API}/api/profile/security-events?user_id=${user.user_id}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.security_events || []);
      }
    } catch (err) {
      console.error("Failed to load security events:", err);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    try {
      setSavingProfile(true);
      const res = await fetch(`${API}/api/profile/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.user_id,
          full_name: fullName.trim(),
          phone: phone.trim(),
          state: state.trim(),
          preferred_notification_method: prefNotif,
          availability_status: availabilityStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update driver profile.");
      setSuccessMsg("Driver details and availability updated.");
      loadProfile();
      loadSecurityEvents();
    } catch (err: any) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      setError("Image size exceeds 3MB limit.");
      return;
    }

    try {
      setUploadingPhoto(true);
      setError("");
      setSuccessMsg("");

      const formData = new FormData();
      formData.append("user_id", String(user.user_id));
      formData.append("file", file);

      const res = await fetch(`${API}/api/profile/me/photo`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Photo upload failed.");

      setSuccessMsg("Driver profile photo updated.");
      loadProfile();
      loadSecurityEvents();
    } catch (err: any) {
      setError(err.message || "Failed to upload photo.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeletePhoto() {
    if (!window.confirm("Remove profile photo?")) return;
    try {
      setUploadingPhoto(true);
      setError("");
      setSuccessMsg("");
      const res = await fetch(`${API}/api/profile/me/photo?user_id=${user.user_id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to delete photo.");
      setSuccessMsg("Profile photo removed.");
      loadProfile();
      loadSecurityEvents();
    } catch (err: any) {
      setError(err.message || "Failed to delete photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError("All password fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwError("New password and confirmation do not match.");
      return;
    }

    try {
      setSavingPw(true);
      const res = await fetch(`${API}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.user_id,
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to change password.");

      setPwSuccess("Password successfully changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      loadSecurityEvents();
    } catch (err: any) {
      setPwError(err.message || "Failed to change password.");
    } finally {
      setSavingPw(false);
    }
  }

  const avatarUrl = profileData?.profile_photo_path
    ? `${API}${profileData.profile_photo_path}`
    : null;

  if (loading && !profileData) {
    return (
      <div className="p-12 text-center text-cyan-400 font-bold text-sm tracking-wider animate-pulse">
        LOADING DRIVER PROFILE...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {error && (
        <div className="bg-rose-950/60 border border-rose-800 text-rose-300 rounded-xl p-4 text-xs flex items-center gap-2">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-cyan-950/50 border border-cyan-800 text-cyan-300 rounded-xl p-4 text-xs flex items-center gap-2">
          <span>✓</span>
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Avatar & Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="text-center">
            <div className="relative inline-block">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={user.full_name}
                  className="w-28 h-28 rounded-2xl object-cover border-2 border-cyan-400/40 shadow-xl mx-auto"
                />
              ) : (
                <div className="w-28 h-28 rounded-2xl bg-cyan-950/50 border-2 border-cyan-500/30 text-cyan-400 font-black text-3xl flex items-center justify-center mx-auto shadow-xl">
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoSelected}
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
              />
            </div>

            <h2 className="text-lg font-bold text-white mt-4">{profileData?.full_name || user.full_name}</h2>
            <div className="text-xs font-mono text-cyan-400 mt-0.5">{profileData?.user_code || user.user_code}</div>

            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-400/10 border border-cyan-400/30 text-cyan-300">
                DISPATCH DRIVER
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                  availabilityStatus === "AVAILABLE"
                    ? "bg-emerald-400/10 border border-emerald-400/30 text-emerald-300"
                    : availabilityStatus === "ON_DUTY"
                    ? "bg-cyan-400/10 border border-cyan-400/30 text-cyan-300"
                    : "bg-amber-400/10 border border-amber-400/30 text-amber-300"
                }`}
              >
                {availabilityStatus}
              </span>
            </div>

            <div className="flex justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                {uploadingPhoto ? "Uploading..." : "Upload Photo"}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleDeletePhoto}
                  disabled={uploadingPhoto}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 transition"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">PNG, JPEG, WebP • Max 3MB</p>
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Driver Call ID</span>
              <span className="font-mono text-slate-200">{profileData?.username || user.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Assigned State</span>
              <span className="text-slate-200">{profileData?.state || state}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Dispatch Notification</span>
              <span className="text-cyan-300 font-semibold">{prefNotif}</span>
            </div>
          </div>
        </div>

        {/* Right 2 cols: Profile Form & Locked Vehicle Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Driver Contact & Availability Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <span>🚚</span> Driver Information & Duty Status
            </h3>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Driver Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Mobile Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Operating State
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Current Duty Status
                  </label>
                  <select
                    value={availabilityStatus}
                    onChange={(e) => setAvailabilityStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 transition"
                  >
                    <option value="AVAILABLE">AVAILABLE — Ready for dispatch</option>
                    <option value="ON_DUTY">ON_DUTY — Active in transit</option>
                    <option value="RESTING">RESTING — Mandatory driver rest</option>
                    <option value="OFF_DUTY">OFF_DUTY — Off-shift</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Preferred Alert Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "IN_APP", label: "In-App Console" },
                    { id: "EMAIL", label: "Email Dispatch" },
                    { id: "SMS", label: "SMS Alerts" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPrefNotif(m.id)}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        prefNotif === m.id
                          ? "bg-cyan-400/10 border-cyan-400 text-cyan-300"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 font-black text-xs transition"
                >
                  {savingProfile ? "SAVING..." : "SAVE PROFILE CHANGES"}
                </button>
              </div>
            </form>
          </div>

          {/* Locked Vehicle & License Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔒</span> Vehicle & License Assignment
              </h3>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-400/10 border border-amber-400/30 text-amber-300">
                OPERATOR-MANAGED
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Driver vehicles and commercial license numbers are certified and locked by LOGIAID fleet dispatchers. Drivers cannot self-modify these records.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="text-[10px] uppercase font-bold text-slate-500">Vehicle Number</div>
                <div className="font-mono text-base font-black text-cyan-400 mt-1">
                  {profileData?.profile?.vehicle_number || user.profile?.vehicle_number || "TN38AB1234"}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="text-[10px] uppercase font-bold text-slate-500">Vehicle Category</div>
                <div className="text-sm font-bold text-white mt-1">
                  {profileData?.profile?.vehicle_type || user.profile?.vehicle_type || "Heavy Commercial"}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="text-[10px] uppercase font-bold text-slate-500">License Number</div>
                <div className="font-mono text-sm font-bold text-slate-300 mt-1">
                  {profileData?.profile?.license_number || user.profile?.license_number || "DL-TN-03-2019-0045123"}
                </div>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <span>🔑</span> Change Password
            </h3>

            {pwError && (
              <div className="bg-rose-950/60 border border-rose-800 text-rose-300 rounded-xl p-3 mb-4 text-xs">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="bg-cyan-950/50 border border-cyan-800 text-cyan-300 rounded-xl p-3 mb-4 text-xs">
                {pwSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 chars, uppercase, symbol"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Confirm New
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingPw}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition"
                >
                  {savingPw ? "UPDATING..." : "UPDATE PASSWORD"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Security Activity Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋</span> Driver Security & Access Events
            </h3>
            <p className="text-xs text-slate-400">
              Recent login and session audit events recorded in PostgreSQL.
            </p>
          </div>
          <button
            onClick={loadSecurityEvents}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-bold"
          >
            Refresh Log
          </button>
        </div>

        {events.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
            No driver access events recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-medium">
                {events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                          ev.event_type.includes("FAILED")
                            ? "bg-rose-950 text-rose-300 border border-rose-800"
                            : ev.event_type.includes("SUCCESS")
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : "bg-cyan-950 text-cyan-300 border border-cyan-800"
                        }`}
                      >
                        {ev.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200">{ev.description}</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{ev.ip_address}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {ev.created_at ? new Date(ev.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
