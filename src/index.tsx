import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';

import './index.css';
import { App } from './App';
import { ErrorPage } from './ErrorPage';
import { Videos } from './Videos';
import { About } from './About';
import { LandingPage } from './LandingPage';


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
