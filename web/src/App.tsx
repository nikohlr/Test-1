import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import MessagesPage from "./pages/MessagesPage";
import AssistantPage from "./pages/AssistantPage";
import TemplatesPage from "./pages/TemplatesPage";
import SettingsPage from "./pages/SettingsPage";
import TerminalPage from "./pages/terminal/TerminalPage";

export default function App() {
  return (
    <Routes>
      {/* Agenten-Terminal runs full-screen (second monitor, phone, installable as app). */}
      <Route path="/terminal" element={<TerminalPage />} />
      <Route path="/terminal/:agentId" element={<TerminalPage />} />
      <Route
        path="*"
        element={
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/messages" replace />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/messages/:conversationId" element={<MessagesPage />} />
              <Route path="/assistant" element={<AssistantPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  );
}
