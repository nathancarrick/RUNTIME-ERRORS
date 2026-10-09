export default function OperatorSettings() {
  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto">

      <div className="mb-8">

        <div className="text-cyan-400 text-xs font-black tracking-[0.25em]">
          SYSTEM CONFIGURATION
        </div>

        <h1 className="text-3xl md:text-4xl font-black mt-2">
          Settings
        </h1>

        <p className="text-slate-400 mt-2">
          LOGIAID operator and system configuration.
        </p>

      </div>

      <div className="grid lg:grid-cols-2 gap-5">

        <Setting
          title="Backend API"
          value="http://localhost:8000"
          status="CONNECTED"
        />

        <Setting
          title="PostgreSQL"
          value="logiaid"
          status="CONNECTED"
        />

        <Setting
          title="Decision Engine"
          value="Deterministic Logic Engine"
          status="ONLINE"
        />

        <Setting
          title="Operator Approval"
          value="Required"
          status="ENABLED"
        />

      </div>

      <div className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl p-6">

        <h2 className="text-xl font-black">
          Hackathon Configuration
        </h2>

        <div className="space-y-4 mt-5">

          <Toggle
            label="Disruption Analysis"
            enabled
          />

          <Toggle
            label="Priority Calculation"
            enabled
          />

          <Toggle
            label="Alternative Action Generation"
            enabled
          />

          <Toggle
            label="Operator Approval"
            enabled
          />

        </div>

      </div>

    </main>
  );
}

function Setting({
  title,
  value,
  status,
}: {
  title: string;
  value: string;
  status: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <div className="text-xs text-slate-500 font-black tracking-widest">
        {title}
      </div>

      <div className="text-lg font-black mt-2">
        {value}
      </div>

      <div className="inline-flex items-center gap-2 mt-4 px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 text-xs font-black">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        {status}
      </div>

    </div>
  );
}

function Toggle({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl p-4">

      <span className="font-bold">
        {label}
      </span>

      <span
        className={`px-3 py-1 rounded-full text-xs font-black ${
          enabled
            ? "bg-emerald-950 text-emerald-400"
            : "bg-red-950 text-red-400"
        }`}
      >
        {enabled ? "ENABLED" : "DISABLED"}
      </span>

    </div>
  );
}