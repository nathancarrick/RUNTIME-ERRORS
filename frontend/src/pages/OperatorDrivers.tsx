import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface Driver {
  id: number;
  username: string;
  full_name: string;
  email?: string;
  phone?: string;
  active?: boolean;
  license_number?: string;
  vehicle_number?: string;
  vehicle_type?: string;
}

export default function OperatorDrivers() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    username: "",
    password: "",
    email: "",
    phone: "",
    license_number: "",
    vehicle_number: "",
    vehicle_type: "Delivery Truck",
  });

  async function loadDrivers() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API}/api/drivers`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load drivers");
      }

      setDrivers(data);
    } catch (err: any) {
      setError(err.message || "Unable to load drivers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDrivers();
  }, []);

  function updateForm(field: string, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function createDriver() {
    setSuccessMessage("");
    setError("");

    if (
      !form.full_name ||
      !form.username ||
      !form.password ||
      !form.phone ||
      !form.license_number ||
      !form.vehicle_number
    ) {
      setError("Please fill all required driver details.");
      return;
    }

    if (form.password.length < 8) {
      setError("Driver password must contain at least 8 characters.");
      return;
    }

    try {
      setCreating(true);

      const response = await fetch(`${API}/api/drivers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          operator_username: "operator",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to create driver");
      }

      setSuccessMessage(
        `Driver created successfully. Login username: ${form.username}`
      );

      setForm({
        full_name: "",
        username: "",
        password: "",
        email: "",
        phone: "",
        license_number: "",
        vehicle_number: "",
        vehicle_type: "Delivery Truck",
      });

      setShowAddForm(false);

      await loadDrivers();
    } catch (err: any) {
      setError(err.message || "Unable to create driver");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Driver Management
          </h1>

          <p className="mt-1 text-slate-400">
            Operator-controlled driver onboarding and fleet management.
          </p>
        </div>

        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError("");
            setSuccessMessage("");
          }}
          className="rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
        >
          {showAddForm ? "Close Form" : "+ Add Driver"}
        </button>
      </div>

      {successMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="font-medium text-emerald-400">
            ✓ {successMessage}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {showAddForm && (
        <div className="rounded-xl border border-cyan-500/20 bg-slate-900 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">
              Add New Driver
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Operator creates the driver's account and login credentials.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="label">
                Driver ID
              </label>

              <div className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono font-semibold text-cyan-400">
                AUTO GENERATED
              </div>

              <p className="mt-1 text-xs text-slate-500">
                Driver ID will be assigned automatically after creation.
              </p>
            </div>

            <div>
              <label className="label">
                Full Name *
              </label>

              <input
                className="input"
                value={form.full_name}
                onChange={(e) =>
                  updateForm("full_name", e.target.value)
                }
                placeholder="Enter driver name"
              />
            </div>

            <div>
              <label className="label">
                Login Username *
              </label>

              <input
                className="input"
                value={form.username}
                onChange={(e) =>
                  updateForm("username", e.target.value)
                }
                placeholder="driver02"
              />
            </div>

            <div>
              <label className="label">
                Login Password *
              </label>

              <input
                type="password"
                className="input"
                value={form.password}
                onChange={(e) =>
                  updateForm("password", e.target.value)
                }
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <label className="label">
                Email
              </label>

              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) =>
                  updateForm("email", e.target.value)
                }
                placeholder="driver@example.com"
              />
            </div>

            <div>
              <label className="label">
                Phone *
              </label>

              <input
                className="input"
                value={form.phone}
                onChange={(e) =>
                  updateForm("phone", e.target.value)
                }
                placeholder="9876543210"
              />
            </div>

            <div>
              <label className="label">
                License Number *
              </label>

              <input
                className="input"
                value={form.license_number}
                onChange={(e) =>
                  updateForm(
                    "license_number",
                    e.target.value
                  )
                }
                placeholder="TN38-20260012346"
              />
            </div>

            <div>
              <label className="label">
                Vehicle Number *
              </label>

              <input
                className="input"
                value={form.vehicle_number}
                onChange={(e) =>
                  updateForm(
                    "vehicle_number",
                    e.target.value
                  )
                }
                placeholder="TN38AB5678"
              />
            </div>

            <div>
              <label className="label">
                Vehicle Type
              </label>

              <select
                className="input"
                value={form.vehicle_type}
                onChange={(e) =>
                  updateForm(
                    "vehicle_type",
                    e.target.value
                  )
                }
              >
                <option value="Delivery Truck">
                  Delivery Truck
                </option>

                <option value="Mini Truck">
                  Mini Truck
                </option>

                <option value="Van">
                  Van
                </option>

                <option value="Container Truck">
                  Container Truck
                </option>

                <option value="Two Wheeler">
                  Two Wheeler
                </option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-800 pt-6 sm:flex-row">
            <button
              onClick={createDriver}
              disabled={creating}
              className="rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating Driver..." : "Create Driver Account"}
            </button>

            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-slate-700 px-6 py-3 font-medium text-slate-300 hover:border-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Total Drivers
          </p>

          <p className="mt-2 text-3xl font-bold text-blue-400">
            {drivers.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Active Drivers
          </p>

          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {
              drivers.filter(
                (driver) => driver.active !== false
              ).length
            }
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Vehicles
          </p>

          <p className="mt-2 text-3xl font-bold text-cyan-400">
            {
              drivers.filter(
                (driver) => driver.vehicle_number
              ).length
            }
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">
          Loading drivers...
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-800 p-5">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Fleet Drivers
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Driver accounts created by operators
              </p>
            </div>

            <button
              onClick={loadDrivers}
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-300 hover:border-cyan-400 hover:text-cyan-400"
            >
              Refresh
            </button>
          </div>

          {drivers.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              No drivers registered.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-950">
                  <tr>
                    <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                      Driver ID
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                      Driver
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                      Login
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                      Vehicle
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                      Type
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {drivers.map((driver) => (
                    <tr
                      key={driver.id}
                      className="border-t border-slate-800 hover:bg-slate-800/40"
                    >
                      <td className="px-5 py-4 font-mono font-semibold text-cyan-400">
                        DRV-
                        {String(driver.id).padStart(4, "0")}
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-white">
                          {driver.full_name}
                        </p>

                        <p className="text-sm text-slate-500">
                          {driver.phone || "-"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-cyan-400">
                          {driver.username}
                        </p>

                        <p className="text-xs text-slate-500">
                          Password set by operator
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-white">
                          {driver.vehicle_number || "-"}
                        </p>

                        <p className="text-xs text-slate-500">
                          {driver.license_number || "-"}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        {driver.vehicle_type || "-"}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            driver.active !== false
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {driver.active !== false
                            ? "ACTIVE"
                            : "INACTIVE"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}