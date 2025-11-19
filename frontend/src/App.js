import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "sonner";
import "@/App.css";
import "@/index.css";

// Pages
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import OmnichannelPage from "./pages/OmnichannelPageV2";
import CalendarPage from "./pages/CalendarPage";
import LeadsPage from "./pages/LeadsPage";
import FollowUpPage from "./pages/FollowUpPage";
import ProfessionalsPage from "./pages/ProfessionalsPage";
import ServicesPage from "./pages/ServicesPage";
import RoomsPage from "./pages/RoomsPage";
import PatientsPage from "./pages/PatientsPage";
import MedicalRecordsPage from "./pages/MedicalRecordsPage";
import ReportsPage from "./pages/ReportsPage";
import RevenuePage from "./pages/RevenuePage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPageV2";
import WebhookTestPage from "./pages/WebhookTestPage";
import NgrokWebhookPage from "./pages/NgrokWebhookPage";

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/omnichannel" element={<PrivateRoute><OmnichannelPage /></PrivateRoute>} />
          <Route path="/calendar" element={<PrivateRoute><CalendarPage /></PrivateRoute>} />
          <Route path="/leads" element={<PrivateRoute><LeadsPage /></PrivateRoute>} />
          <Route path="/followup" element={<PrivateRoute><FollowUpPage /></PrivateRoute>} />
          <Route path="/professionals" element={<PrivateRoute><ProfessionalsPage /></PrivateRoute>} />
          <Route path="/services" element={<PrivateRoute><ServicesPage /></PrivateRoute>} />
          <Route path="/rooms" element={<PrivateRoute><RoomsPage /></PrivateRoute>} />
          <Route path="/patients" element={<PrivateRoute><PatientsPage /></PrivateRoute>} />
          <Route path="/medical-records" element={<PrivateRoute><MedicalRecordsPage /></PrivateRoute>} />
          <Route path="/reports" element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
          <Route path="/revenue" element={<PrivateRoute><RevenuePage /></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute><UsersPage /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
          <Route path="/webhook-test" element={<PrivateRoute><WebhookTestPage /></PrivateRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
