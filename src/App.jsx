import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FleetPage from './pages/FleetPage';
import ProjectsPage from './pages/ProjectsPage';
import CashFlowPage from './pages/CashFlowPage';
import SimulationPage from './pages/SimulationPage';
import SettingsPage from './pages/SettingsPage';

const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

function AppContent() {
  const { currentUser } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {currentUser && <Navbar />}

      <main className="flex-1">
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Dashboard Principale */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />

          {/* Flotta Disponibile */}
          <Route
            path="/fleet"
            element={
              <PrivateRoute>
                <FleetPage />
              </PrivateRoute>
            }
          />
          <Route path="/vehicles" element={<Navigate to="/fleet" replace />} />

          {/* Commesse & Budget Progetti */}
          <Route
            path="/projects"
            element={
              <PrivateRoute>
                <ProjectsPage />
              </PrivateRoute>
            }
          />

          {/* Forecast, Budget & Cash Flow */}
          <Route
            path="/cashflow"
            element={
              <PrivateRoute>
                <CashFlowPage />
              </PrivateRoute>
            }
          />

          {/* Simulatore Costi Tratta / Preventivatore */}
          <Route
            path="/simulation"
            element={
              <PrivateRoute>
                <SimulationPage />
              </PrivateRoute>
            }
          />

          {/* Impostazioni Globali & Tariffe */}
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <SettingsPage />
              </PrivateRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
