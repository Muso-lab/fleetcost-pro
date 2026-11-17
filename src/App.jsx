import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import SimulationPage from './pages/SimulationPage';
import VehiclesPage from './pages/VehiclesPage';
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
    <div className="min-h-screen bg-gray-50">
      {currentUser && <Navbar />}

      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <SimulationPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/vehicles"
          element={
            <PrivateRoute>
              <VehiclesPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <SettingsPage />
            </PrivateRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default App;
