import React from 'react';
import logo from './logo.svg';
import './App.css';

import { Videos } from './Videos';
import { Settings } from './Settings';


export const App = () => {
  return <div className="App">
    <Settings />
    <Videos />
  </div>;
}
