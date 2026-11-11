import { Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout.jsx';
import Overview from './pages/Overview.jsx';
import RoutesPage from './pages/RoutesPage.jsx';
import RouteDetails from './pages/RouteDetails.jsx';
import BackendsPage from './pages/BackendsPage.jsx';
import LoadBalancingPage from './pages/LoadBalancingPage.jsx';
import HealthPage from './pages/HealthPage.jsx';
import ActivityLogsPage from './pages/ActivityLogsPage.jsx';
import GatewaySettingsPage from './pages/GatewaySettingsPage.jsx';
import RateLimitingPage from './pages/RateLimitingPage.jsx';
import JwtPlaygroundPage from './pages/JwtPlaygroundPage.jsx';
import NotFound from './pages/NotFound.jsx';
import { DashboardProvider, ToastProvider } from './contexts/DashboardContext.jsx';

function App() {
  return (
    <ToastProvider>
      <DashboardProvider>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<Overview />} />
            <Route path="routes" element={<RoutesPage />} />
            <Route path="routes/:id" element={<RouteDetails />} />
            <Route path="backends" element={<BackendsPage />} />
            <Route path="load-balancing" element={<LoadBalancingPage />} />
            <Route path="rate-limiting" element={<RateLimitingPage />} />
            <Route path="jwt-playground" element={<JwtPlaygroundPage />} />
            <Route path="health" element={<HealthPage />} />
            <Route path="activity-logs" element={<ActivityLogsPage />} />
            <Route path="settings" element={<GatewaySettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </DashboardProvider>
    </ToastProvider>
  );
}

export default App;
