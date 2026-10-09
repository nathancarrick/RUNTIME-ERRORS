import { useState } from "react";

import OperatorConsole from "./pages/OperatorConsole";
import DriverDashboard from "./pages/DriverDashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import ForgotPasswordModal from "./components/ForgotPasswordModal";

const API = "http://127.0.0.1:8000";

type Role = "CUSTOMER" | "DRIVER" | "OPERATOR";

interface UserData {
  user_id: number;
  user_code: string;
  username: string;
  role: Role;
  full_name: string;
  email?: string;
  phone?: string;
  profile_photo_path?: string | null;
  state?: string;
  preferred_notification_method?: string;
  profile?: {
    address?: string;
    city?: string;
    pincode?: string;
    state?: string;
    license_number?: string;
    vehicle_number?: string;
    vehicle_type?: string;
    availability_status?: string;
  };
}

function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  if (!user) {
    return (
      <LoginPage
        showRegister={showRegister}
        setShowRegister={setShowRegister}
        onLogin={setUser}
      />
    );
  }

  if (user.role === "CUSTOMER") {
    return (
      <CustomerDashboard
        user={user}
        onLogout={() => setUser(null)}
      />
    );
  }

  if (user.role === "DRIVER") {
    return (
      <DriverDashboard
        user={user}
        onLogout={() => setUser(null)}
      />
    );
  }

  return (
    <OperatorConsole
      user={user}
      onLogout={() => setUser(null)}
    />
  );
}

/* =========================================================
   LOGIN PAGE
========================================================= */

function LoginPage({
  showRegister,
  setShowRegister,
  onLogin,
}: {
  showRegister: boolean;
  setShowRegister: (value: boolean) => void;
  onLogin: (user: UserData) => void;
}) {
  const [role, setRole] = useState<Role>("CUSTOMER");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  async function login() {
    setError("");

    if (!username || !password) {
      setError("Please enter username and password.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Login failed");
      }

      onLogin(data);
    } catch (error: any) {
      setError(error.message || "Unable to login.");
    } finally {
      setLoading(false);
    }
  }

  if (showRegister) {
    return (
      <CustomerRegister
        onBack={() => setShowRegister(false)}
        onLogin={onLogin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="text-cyan-400 text-sm font-bold tracking-[0.3em]">
            LOGIAID
          </div>

          <h1 className="text-4xl font-black mt-3">
            Logistics Intelligence
          </h1>

          <p className="text-slate-400 mt-2">
            Disruption-Aware Logistics Planning
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">

          <h2 className="text-2xl font-bold mb-6">
            Sign in
          </h2>

          <label className="text-sm text-slate-400">
            Login as
          </label>

          <div className="grid grid-cols-3 gap-2 mt-2 mb-6">
            {(["CUSTOMER", "DRIVER", "OPERATOR"] as Role[]).map(
              (item) => (
                <button
                  key={item}
                  onClick={() => {
                    setRole(item);
                    setError("");
                  }}
                  className={`py-3 rounded-lg text-xs font-bold transition ${
                    role === item
                      ? "bg-cyan-400 text-slate-950"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </div>

          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 mb-3 outline-none focus:border-cyan-400"
          />

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                login();
              }
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 mb-2 outline-none focus:border-cyan-400"
          />

          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition"
            >
              Forgot Password?
            </button>
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 rounded-lg p-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={login}
            disabled={loading}
            className="w-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black py-3 rounded-lg"
          >
            {loading ? "SIGNING IN..." : "SIGN IN"}
          </button>

          <ForgotPasswordModal
            isOpen={showForgotPassword}
            onClose={() => setShowForgotPassword(false)}
            onSuccess={(newUsername) => {
              if (newUsername) setUsername(newUsername);
              setError("");
            }}
          />

          {role === "CUSTOMER" && (
            <button
              onClick={() => setShowRegister(true)}
              className="w-full mt-4 border border-slate-700 hover:border-cyan-400 text-slate-300 py-3 rounded-lg font-bold"
            >
              CREATE NEW CUSTOMER ACCOUNT
            </button>
          )}

          {role === "DRIVER" && (
            <div className="text-center text-xs text-slate-500 mt-5">
              Driver accounts are created by LOGIAID operators only.
            </div>
          )}

          {role === "OPERATOR" && (
            <div className="text-center text-xs text-slate-500 mt-5">
              Authorized LOGIAID operations personnel only.
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* =========================================================
   CUSTOMER REGISTRATION
========================================================= */

function CustomerRegister({
  onBack,
  onLogin,
}: {
  onBack: () => void;
  onLogin: (user: UserData) => void;
}) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirm_password: "",
    full_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    pincode: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(
    field: keyof typeof form,
    value: string
  ) {
    setForm({
      ...form,
      [field]: value,
    });
  }

  async function register() {
    setError("");
    setMessage("");

    if (
      !form.username ||
      !form.password ||
      !form.confirm_password ||
      !form.full_name ||
      !form.email ||
      !form.phone
    ) {
      setError("Please fill all required fields.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (!/[A-Z]/.test(form.password)) {
      setError(
        "Password must contain at least one uppercase letter."
      );
      return;
    }

    if (!/[a-z]/.test(form.password)) {
      setError(
        "Password must contain at least one lowercase letter."
      );
      return;
    }

    if (!/[0-9]/.test(form.password)) {
      setError(
        "Password must contain at least one number."
      );
      return;
    }

    if (!/[^A-Za-z0-9]/.test(form.password)) {
      setError(
        "Password must contain at least one special character."
      );
      return;
    }

    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API}/api/auth/customer/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Registration failed"
        );
      }

      setMessage(
        `Account created successfully! Your Customer ID is ${data.customer_id}`
      );

      setTimeout(async () => {
        try {
          const loginResponse = await fetch(
            `${API}/api/auth/login`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                username: form.username,
                password: form.password,
                role: "CUSTOMER",
              }),
            }
          );

          const loginData = await loginResponse.json();

          if (loginResponse.ok) {
            onLogin(loginData);
          }
        } catch {
          // Account already created.
        }
      }, 1200);

    } catch (error: any) {
      setError(
        error.message || "Registration failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">

          <button
            onClick={onBack}
            className="text-cyan-400 text-sm mb-5"
          >
            ← Back to login
          </button>

          <h1 className="text-3xl font-black">
            Create Customer Account
          </h1>

          <p className="text-slate-400 mt-2 mb-7">
            Create your LOGIAID customer profile.
          </p>

          <div className="grid md:grid-cols-2 gap-4">

            <input
              placeholder="Full Name *"
              value={form.full_name}
              onChange={(e) =>
                update("full_name", e.target.value)
              }
              className="input"
            />

            <input
              placeholder="Username *"
              value={form.username}
              onChange={(e) =>
                update("username", e.target.value)
              }
              className="input"
            />

            <div>
              <input
                type="password"
                placeholder="Password *"
                value={form.password}
                onChange={(e) =>
                  update("password", e.target.value)
                }
                className="input"
              />

              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-4">

                <p className="text-xs font-bold text-slate-400 mb-3">
                  PASSWORD REQUIREMENTS
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">

                  <PasswordRule
                    valid={form.password.length >= 8}
                    text="At least 8 characters"
                  />

                  <PasswordRule
                    valid={/[A-Z]/.test(form.password)}
                    text="One uppercase letter"
                  />

                  <PasswordRule
                    valid={/[a-z]/.test(form.password)}
                    text="One lowercase letter"
                  />

                  <PasswordRule
                    valid={/[0-9]/.test(form.password)}
                    text="One number"
                  />

                  <PasswordRule
                    valid={/[^A-Za-z0-9]/.test(form.password)}
                    text="One special character"
                  />

                </div>
              </div>
            </div>

            <div>
              <input
                type="password"
                placeholder="Confirm Password *"
                value={form.confirm_password}
                onChange={(e) =>
                  update(
                    "confirm_password",
                    e.target.value
                  )
                }
                className={`input ${
                  form.confirm_password &&
                  form.password !== form.confirm_password
                    ? "border-red-500"
                    : form.confirm_password &&
                      form.password === form.confirm_password
                    ? "border-emerald-500"
                    : ""
                }`}
              />

              {form.confirm_password && (
                <p
                  className={`text-xs mt-2 ${
                    form.password === form.confirm_password
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {form.password === form.confirm_password
                    ? "✓ Passwords match"
                    : "✕ Passwords do not match"}
                </p>
              )}
            </div>

            <input
              placeholder="Email *"
              value={form.email}
              onChange={(e) =>
                update("email", e.target.value)
              }
              className="input"
            />

            <input
              placeholder="Phone *"
              value={form.phone}
              onChange={(e) =>
                update("phone", e.target.value)
              }
              className="input"
            />

            <input
              placeholder="City"
              value={form.city}
              onChange={(e) =>
                update("city", e.target.value)
              }
              className="input"
            />

            <input
              placeholder="Pincode"
              value={form.pincode}
              onChange={(e) =>
                update("pincode", e.target.value)
              }
              className="input"
            />

            <input
              placeholder="Address"
              value={form.address}
              onChange={(e) =>
                update("address", e.target.value)
              }
              className="input"
            />

          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 rounded-lg p-3 mt-5 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 rounded-lg p-3 mt-5 text-sm">
              {message}
            </div>
          )}

          <button
            onClick={register}
            disabled={loading}
            className="w-full mt-6 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black py-3 rounded-lg"
          >
            {loading
              ? "CREATING ACCOUNT..."
              : "CREATE ACCOUNT"}
          </button>

        </div>
      </div>
    </div>
  );
}

/* =========================================================
   COMMON COMPONENTS
========================================================= */

function PasswordRule({
  valid,
  text,
}: {
  valid: boolean;
  text: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${
        valid
          ? "text-emerald-400"
          : "text-slate-500"
      }`}
    >
      <span className="font-black">
        {valid ? "✓" : "○"}
      </span>

      <span>{text}</span>
    </div>
  );
}

export default App;