interface OperatorSidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

const menu = [
  {
    section: "OPERATIONS",
    items: [
      { id: "dashboard", label: "Overview", icon: "▦" },
      { id: "priority_queue", label: "Priority Queue", icon: "⚖" },
      { id: "disruptions", label: "Disruptions", icon: "⚠" },
      { id: "recovery", label: "Recovery Plans", icon: "✓" },
      { id: "driver_responses", label: "Driver Responses", icon: "⚡" },
      { id: "shipments", label: "Shipments", icon: "📦" },
      { id: "incidents", label: "Incident History", icon: "📋" },
      { id: "drivers", label: "Drivers", icon: "🚚" },
    ],
  },
  {
    section: "USERS",
    items: [
      { id: "customers", label: "Customers", icon: "👤" },
      { id: "users", label: "All Users", icon: "👥" },
    ],
  },
  {
    section: "SYSTEM",
    items: [
      { id: "profile", label: "My Profile", icon: "🛡" },
      { id: "settings", label: "Settings", icon: "⚙" },
    ],
  },
];

export default function OperatorSidebar({
  activePage,
  onNavigate,
  onLogout,
}: OperatorSidebarProps) {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 min-h-screen border-r border-slate-800 bg-slate-950 flex-col">

      <div className="p-6 border-b border-slate-800">
        <div className="text-2xl font-black tracking-tight text-white">
          LOGI<span className="text-cyan-400">AID</span>
        </div>

        <div className="text-[10px] text-cyan-400 font-black tracking-[0.25em] mt-1">
          OPERATOR CONSOLE
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">

        {menu.map((group) => (
          <div key={group.section} className="mb-6">

            <div className="text-[10px] font-black tracking-[0.2em] text-slate-600 px-3 mb-2">
              {group.section}
            </div>

            <div className="space-y-1">
              {group.items.map((item) => {
                const active = activePage === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition ${
                      active
                        ? "bg-cyan-400 text-slate-950"
                        : "text-slate-400 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    <span className="w-6 text-center text-base">
                      {item.icon}
                    </span>

                    <span className="font-bold text-sm">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

      </div>

      <div className="p-4 border-t border-slate-800">

        <div className="flex items-center gap-2 px-3 py-3 mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />

          <div>
            <div className="text-sm font-bold text-white">
              System Online
            </div>

            <div className="text-[10px] text-slate-500">
              Full operator access
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full px-4 py-3 rounded-xl bg-red-950/40 border border-red-900/50 text-red-400 hover:bg-red-900/40 font-bold text-sm"
        >
          🚪 Logout
        </button>

      </div>
    </aside>
  );
}