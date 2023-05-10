import React from 'react';
import { Outlet } from "react-router-dom";

import './App.css';
import { Settings, SettingsProvider } from './Settings';


export const App = () => {
  return <div className="app">
    <SettingsProvider>
      <Settings />
      <Outlet />
    </SettingsProvider>
  </div>;
}
