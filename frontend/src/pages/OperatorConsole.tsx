import { useState } from "react";

import OperatorSidebar from "../components/OperatorSidebar";

import OperatorDashboard from "./OperatorDashboard";
import OperatorPriorityQueue from "./OperatorPriorityQueue";
import OperatorDisruptions from "./OperatorDisruptions";
import OperatorRecoveryPlans from "./OperatorRecoveryPlans";
import OperatorDriverResponses from "./OperatorDriverResponses";
import OperatorIncidents from "./OperatorIncidents";
import OperatorDrivers from "./OperatorDrivers";
import OperatorCustomers from "./OperatorCustomers";
import OperatorShipments from "./OperatorShipments";
import OperatorUsers from "./OperatorUsers";
import OperatorSettings from "./OperatorSettings";
import OperatorProfile from "./OperatorProfile";

interface OperatorConsoleProps {
  user: {
    user_id: number;
    username: string;
    full_name: string;
    role: string;
  };

  onLogout: () => void;
}

export default function OperatorConsole({
  user,
  onLogout,
}: OperatorConsoleProps) {

  const [activePage, setActivePage] = useState("dashboard");

  function renderPage() {
    switch (activePage) {

      case "dashboard":
        return (
          <OperatorDashboard
            user={{
              full_name: user.full_name,
              username: user.username,
            }}
            onNavigate={setActivePage}
          />
        );

      case "priority_queue":
        return <OperatorPriorityQueue />;

      case "disruptions":
        return <OperatorDisruptions />;

      case "recovery":
        return <OperatorRecoveryPlans />;

      case "driver_responses":
        return <OperatorDriverResponses />;

      case "incidents":
        return <OperatorIncidents />;

      case "drivers":
        return <OperatorDrivers />;

      case "customers":
        return <OperatorCustomers />;

      case "shipments":
        return <OperatorShipments />;

      case "users":
        return <OperatorUsers />;

      case "settings":
        return <OperatorSettings />;

      case "profile":
        return <OperatorProfile user={user} />;

      default:
        return (
          <OperatorDashboard
            user={{
              full_name: user.full_name,
              username: user.username,
            }}
            onNavigate={setActivePage}
          />
        );
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">

      <OperatorSidebar
        activePage={activePage}
        onNavigate={setActivePage}
        onLogout={onLogout}
      />

      <div className="flex-1 min-w-0">

        <header className="h-[73px] border-b border-slate-800 bg-slate-950/95 backdrop-blur flex items-center justify-between px-5 md:px-8 sticky top-0 z-20">

          <div>
            <div className="text-xs text-slate-600 font-black tracking-widest">
              LOGIAID
            </div>

            <div className="font-black">
              Operator Control Center
            </div>
          </div>

          <div className="flex items-center gap-3">

            <div className="hidden sm:block text-right">
              <div className="text-sm font-bold">
                {user.full_name}
              </div>

              <div className="text-[10px] text-cyan-400 font-black">
                OPERATOR
              </div>
            </div>

            <div className="w-10 h-10 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center font-black">
              {user.full_name.charAt(0).toUpperCase()}
            </div>

          </div>

        </header>

        <div className="lg:hidden sticky top-[73px] z-10 bg-slate-950 border-b border-slate-800 p-3 overflow-x-auto">

          <div className="flex gap-2 min-w-max">

            {[
              ["dashboard", "Overview"],
              ["priority_queue", "Priority Queue"],
              ["disruptions", "Disruptions"],
              ["recovery", "Recovery"],
              ["driver_responses", "Driver Responses"],
              ["shipments", "Shipments"],
              ["incidents", "Incident History"],
              ["drivers", "Drivers"],
              ["customers", "Customers"],
              ["users", "Users"],
              ["settings", "Settings"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActivePage(id)}
                className={`px-4 py-2 rounded-lg text-xs font-black ${
                  activePage === id
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-slate-900 text-slate-400"
                }`}
              >
                {label}
              </button>
            ))}

          </div>

        </div>

        {renderPage()}

      </div>

    </div>
  );
}