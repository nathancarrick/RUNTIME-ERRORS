import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface Customer {
  id: number;
  username: string;
  full_name: string;
  email?: string;
  phone?: string;
  active?: boolean;
}

export default function OperatorCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadCustomers() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API}/api/customers`);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load customers");
      }

      setCustomers(data);
    } catch (err: any) {
      setError(err.message || "Unable to load customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">
          Customer Management
        </h1>

        <p className="mt-1 text-slate-400">
          Monitor registered customers and their account information.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Total Customers
          </p>

          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {customers.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Active Accounts
          </p>

          <p className="mt-2 text-3xl font-bold text-cyan-400">
            {customers.filter(
              (customer) => customer.active !== false
            ).length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Registered Customers
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Customer accounts stored in LOGIAID
            </p>
          </div>

          <button
            onClick={loadCustomers}
            className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-300 hover:border-cyan-400 hover:text-cyan-400"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400">
            Loading customers...
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <p className="text-red-400">{error}</p>

            <button
              onClick={loadCustomers}
              className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950"
            >
              Try Again
            </button>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            No customers found.
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
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-t border-slate-800 hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-4 text-slate-500">
                      #{customer.id}
                    </td>

                    <td className="px-5 py-4 font-medium text-cyan-400">
                      {customer.username}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {customer.full_name}
                    </td>

                    <td className="px-5 py-4 text-slate-400">
                      {customer.email || "-"}
                    </td>

                    <td className="px-5 py-4 text-slate-400">
                      {customer.phone || "-"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          customer.active !== false
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {customer.active !== false
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
    </div>
  );
}