import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { StoreProvider } from '@/store';
import Shell from '@/components/Shell';
import './index.css';

import Dashboard from '@/pages/Dashboard';
import Carriers from '@/pages/Carriers';
import CarrierOverview from '@/pages/CarrierOverview';
import Drivers from '@/pages/Drivers';
import DriverRecord from '@/pages/DriverRecord';
import Hiring from '@/pages/Hiring';
import CandidateRecord from '@/pages/CandidateRecord';
import Trucks from '@/pages/Trucks';
import TruckRecord from '@/pages/TruckRecord';
import People from '@/pages/People';
import Departments from '@/pages/Departments';
import Notifications from '@/pages/Notifications';
import Inbox from '@/pages/Inbox';
import Compliance from '@/pages/Compliance';
import Administration from '@/pages/Administration';
import Research from '@/pages/Research';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import DriverPortal from '@/pages/DriverPortal';

function App({ children }: { children: React.ReactNode }) {
  return <StoreProvider><Shell>{children}</Shell></StoreProvider>;
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/apply/:token', element: <DriverPortal /> },
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/dashboard', element: <App><Dashboard /></App> },
  { path: '/carriers', element: <App><Carriers /></App> },
  { path: '/carriers/:carrierId', element: <App><CarrierOverview /></App> },
  { path: '/carriers/:carrierId/drivers', element: <App><Drivers /></App> },
  { path: '/carriers/:carrierId/drivers/:driverId', element: <App><DriverRecord /></App> },
  { path: '/carriers/:carrierId/hiring', element: <App><Hiring /></App> },
  { path: '/carriers/:carrierId/hiring/:candidateId', element: <App><CandidateRecord /></App> },
  { path: '/carriers/:carrierId/trucks', element: <App><Trucks /></App> },
  { path: '/carriers/:carrierId/trucks/:truckId', element: <App><TruckRecord /></App> },
  { path: '/carriers/:carrierId/compliance', element: <App><Compliance /></App> },
  { path: '/carriers/:carrierId/administration', element: <App><Administration /></App> },
  { path: '/employees', element: <App><People kind="employee" /></App> },

  { path: '/departments', element: <App><Departments /></App> },
  { path: '/notifications', element: <App><Notifications /></App> },
  { path: '/inbox', element: <App><Inbox /></App> },
  { path: '/tasks', element: <App><Departments /></App> },
  { path: '/research', element: <App><Research /></App> },
  { path: '/settings', element: <App><Settings /></App> },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
], { basename: '/app' });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
