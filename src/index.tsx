import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  Outlet,
  RouterProvider,
} from 'react-router-dom';

import './index.css';
import { ErrorPage } from './ErrorPage';
import { Videos } from './Videos';
import { About } from './About';
import { LandingPage } from './LandingPage';
import { Settings, SettingsProvider } from './Settings';

const App = () => {
  return <div className="app">
    <SettingsProvider>
      <Settings />
      <Outlet />
    </SettingsProvider>
  </div>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <ErrorPage />,
    children: [{
      index: true,
      element: <LandingPage />,
    },
    {
      path: "about",
      element: <About />,
    },
    {
      path: ":roomName",
      element: <Videos />,
    }],
  },
]);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
