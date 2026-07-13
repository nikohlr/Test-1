import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api/client";
import { getCurrentUserId, setCurrentUserId } from "../api/client";
import type { User } from "../api/types";

interface DemoStatus {
  demoMode: { whatsapp: boolean; openai: boolean };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [demo, setDemo] = useState<DemoStatus["demoMode"] | null>(null);
  const [currentUser, setCurrentUser] = useState<string>(getCurrentUserId() ?? "");

  useEffect(() => {
    api.get<User[]>("/settings/users").then((list) => {
      setUsers(list);
      if (!getCurrentUserId() && list[0]) {
        setCurrentUserId(list[0].id);
        setCurrentUser(list[0].id);
      }
    });
    api.get<any>("/settings").then((s) => setDemo(s.demoMode));
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Broszeit Kommunikationszentrale</div>
        <nav className="main-nav">
          <NavLink to="/messages" className={({ isActive }) => (isActive ? "active" : "")}>
            Nachrichten
          </NavLink>
          <NavLink to="/assistant" className={({ isActive }) => (isActive ? "active" : "")}>
            Broszeit-Assistent
          </NavLink>
          <NavLink to="/templates" className={({ isActive }) => (isActive ? "active" : "")}>
            Vorlagen
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
            Einstellungen
          </NavLink>
        </nav>
        <div className="user-switcher">
          <select
            value={currentUser}
            onChange={(e) => {
              setCurrentUserId(e.target.value);
              setCurrentUser(e.target.value);
              window.location.reload();
            }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
      </header>
      {demo && (demo.whatsapp || demo.openai) && (
        <div className="demo-banner">
          Demo-Modus aktiv:
          {demo.whatsapp && " WhatsApp (keine echten Nachrichten werden versendet)"}
          {demo.whatsapp && demo.openai && " · "}
          {demo.openai && " KI-Funktionen (nur Beispielantworten)"}
          {" — echte Zugangsdaten in server/.env hinterlegen, um den Live-Betrieb zu aktivieren."}
        </div>
      )}
      <main className="app-content">{children}</main>
    </div>
  );
}
