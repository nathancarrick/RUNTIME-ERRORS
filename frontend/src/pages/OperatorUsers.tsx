import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface User {
  id: number;
  username: string;
  full_name: string;
  role: string;
  email?: string;
  phone?: string;
  active?: boolean;
}

export default function OperatorUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API}/api/users`);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load users");
      }

      setUsers(data);
    } catch (err: any) {
      setError(err.message || "Unable to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const roleClass = (role: string) => {
    if (role === "OPERATOR") {
      return "bg-purple-500/10 text-purple-400";
    }

    if (role === "DRIVER") {
      return "bg-blue-500/10 text-blue-400";
    }

    return "bg-emerald-500/10 text-emerald-400";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">
          User Management
        </h1>

        <p className="mt-1 text-slate-400">
          Manage LOGIAID customers, drivers and operators.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Total Users</p>

          <p className="mt-2 text-3xl font-bold text-white">
            {users.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Drivers</p>

          <p className="mt-2 text-3xl font-bold text-blue-400">
            {users.filter((user) => user.role === "DRIVER").length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Customers</p>

          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {users.filter((user) => user.role === "CUSTOMER").length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">
              All Users
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Registered LOGIAID users
            </p>
          </div>

          <button
            onClick={loadUsers}
            className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-300 hover:border-cyan-400 hover:text-cyan-400"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400">
            Loading users...
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <p className="text-red-400">{error}</p>

            <button
              onClick={loadUsers}
              className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950"
            >
              Try Again
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            No users found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-950">
                <tr>
                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    ID
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Username
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Full Name
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Role
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Email
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Phone
                  </th>

                  <th className="px-5 py-4 text-sm font-semibold text-slate-400">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-slate-800 hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-4 text-slate-500">
                      #{user.id}
                    </td>

                    <td className="px-5 py-4 font-medium text-cyan-400">
                      {user.username}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {user.full_name}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${roleClass(
                          user.role
                        )}`}
                      >
                        {user.role}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-slate-400">
                      {user.email || "-"}
                    </td>

                    <td className="px-5 py-4 text-slate-400">
                      {user.phone || "-"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          user.active !== false
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {user.active !== false ? "ACTIVE" : "INACTIVE"}
                      </span>
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