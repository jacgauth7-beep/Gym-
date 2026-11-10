import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme, getTheme } from './hooks';
import { initPWA } from './lib/pwa';
import './index.css';

applyTheme(getTheme());
initPWA();

// Demande au navigateur de ne pas effacer les données locales sous pression de stockage.
navigator.storage?.persist?.().catch(() => {});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
