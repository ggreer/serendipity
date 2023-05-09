import React from 'react';

import './App.css';

import { Videos } from './Videos';
import { Settings, SettingsProvider } from './Settings';


export const App = () => {
  return <div className="app">
    <SettingsProvider>
      <Settings />
      <Videos />
    </SettingsProvider>
  </div>;
}
