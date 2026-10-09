import { useState } from "react";

const API = "http://127.0.0.1:8000";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (username: string) => void;
}

export default function ForgotPasswordModal({
  isOpen,
  onClose,
  onSuccess,
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [identifier, setIdentifier] = useState("");
  const [channel, setChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [deliveryTarget, setDeliveryTarget] = useState("");
  const [devOtpPreview, setDevOtpPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  // Password rules validation
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
  const isPasswordValid =
    hasMinLength && hasUppercase && hasLowercase && hasDigit && hasSpecial && passwordsMatch;

  async function handleRequestOtp() {
    setError("");
    setSuccessMsg("");
    if (!identifier.trim()) {
      setError("Please enter your registered username or email.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API}/api/auth/forgot-password/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          delivery_channel: channel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to dispatch verification code.");
      }

      setDeliveryTarget(data.delivery_target || identifier);
      setDevOtpPreview(data.dev_otp_preview || null);
      setSuccessMsg(data.message || "Verification code dispatched.");
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Error requesting verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setError("");
    setSuccessMsg("");
    if (!otp.trim()) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API}/api/auth/forgot-password/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          otp: otp.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Invalid verification code.");
      }

      setResetToken(data.reset_token);
      setSuccessMsg("Verification code confirmed.");
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Failed to verify code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setError("");
    setSuccessMsg("");

    if (!isPasswordValid) {
      setError("Please ensure your new password satisfies all security criteria.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API}/api/auth/forgot-password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reset_token: resetToken,
          identifier: identifier.trim(),
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to reset password.");
      }

      setStep(4);
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  function handleResetComplete() {
    onSuccess(identifier.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">
        {/* Step indicator header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-black flex items-center justify-center text-sm">
              🛡
            </span>
            <div>
              <h3 className="text-base font-bold text-white">Password Recovery</h3>
              <p className="text-[11px] text-slate-400">Step {step} of 3 • Secure Verification Flow</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-rose-950/50 border border-rose-800/80 text-rose-300 rounded-xl p-3 mb-4 text-xs flex items-start gap-2">
            <span className="text-sm">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {successMsg && step !== 4 && (
          <div className="bg-cyan-950/40 border border-cyan-800/60 text-cyan-300 rounded-xl p-3 mb-4 text-xs flex items-start gap-2">
            <span className="text-sm">✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* STEP 1: Request Code */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Enter your LOGIAID username or registered email. We will dispatch a secure 6-digit one-time code to verify your identity.
            </p>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Account Identifier
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Username (e.g. carrick) or Email"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400 transition"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Delivery Channel
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setChannel("EMAIL")}
                  className={`py-2 rounded-xl text-xs font-bold border transition ${
                    channel === "EMAIL"
                      ? "bg-cyan-400/10 border-cyan-400 text-cyan-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  ✉ Email Verification
                </button>
                <button
                  type="button"
                  onClick={() => setChannel("SMS")}
                  className={`py-2 rounded-xl text-xs font-bold border transition ${
                    channel === "SMS"
                      ? "bg-cyan-400/10 border-cyan-400 text-cyan-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  📱 SMS Code
                </button>
              </div>
            </div>

            <button
              onClick={handleRequestOtp}
              disabled={loading}
              className="w-full bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 font-black py-3 rounded-xl text-sm transition mt-2"
            >
              {loading ? "DISPATCHING CODE..." : "SEND VERIFICATION CODE"}
            </button>
          </div>
        )}

        {/* STEP 2: Verify Code */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-400">Code dispatched to: </span>
              <strong className="text-white font-mono">{deliveryTarget}</strong>
            </div>

            {devOtpPreview && (
              <div className="p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Dev Mode Sandbox OTP</div>
                  <div className="font-mono text-base font-black text-cyan-300 tracking-widest">{devOtpPreview}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setOtp(devOtpPreview)}
                  className="px-2.5 py-1 text-[11px] font-bold bg-cyan-400 text-slate-950 rounded-lg hover:bg-cyan-300 transition"
                >
                  Autofill
                </button>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Enter 6-Digit Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full text-center tracking-[0.5em] font-mono text-xl font-bold bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none focus:border-cyan-400 transition"
                autoFocus
              />
              <p className="text-[11px] text-slate-500 mt-1">Codes expire in 10 minutes. Maximum 5 attempts allowed.</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3 border border-slate-700 hover:border-slate-600 text-slate-300 font-bold py-3 rounded-xl text-xs transition"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={loading || otp.length < 6}
                className="w-2/3 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 font-black py-3 rounded-xl text-sm transition"
              >
                {loading ? "VERIFYING..." : "VERIFY CODE"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Enter New Password */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Identity verified. Choose a strong, unique password to secure your account.
            </p>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400 transition pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-white"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Confirm New Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400 transition"
              />
            </div>

            {/* Checklist */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-[11px]">
              <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-1">
                Password Security Policy:
              </div>
              <div className={hasMinLength ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                {hasMinLength ? "✓" : "○"} At least 8 characters
              </div>
              <div className={hasUppercase ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                {hasUppercase ? "✓" : "○"} At least one uppercase letter (A-Z)
              </div>
              <div className={hasLowercase ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                {hasLowercase ? "✓" : "○"} At least one lowercase letter (a-z)
              </div>
              <div className={hasDigit ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                {hasDigit ? "✓" : "○"} At least one number (0-9)
              </div>
              <div className={hasSpecial ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                {hasSpecial ? "✓" : "○"} At least one special symbol (!@#$%^&*)
              </div>
              <div className={passwordsMatch ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                {passwordsMatch ? "✓" : "○"} Passwords match
              </div>
            </div>

            <button
              onClick={handleResetPassword}
              disabled={loading || !isPasswordValid}
              className="w-full bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 font-black py-3 rounded-xl text-sm transition"
            >
              {loading ? "UPDATING PASSWORD..." : "SAVE & RESET PASSWORD"}
            </button>
          </div>
        )}

        {/* STEP 4: Success confirmation */}
        {step === 4 && (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-3xl mx-auto">
              ✓
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">Password Updated!</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Your credentials have been securely refreshed in PostgreSQL. You can now log in immediately.
              </p>
            </div>
            <button
              onClick={handleResetComplete}
              className="w-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black py-3 rounded-xl text-sm transition"
            >
              RETURN TO SIGN IN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
