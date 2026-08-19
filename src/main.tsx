import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './theme/ThemeProvider';
import { registerServiceWorker } from './utils/pushNotifications';
import './index.css';

// Registered unconditionally on every load, not just after login —
// PushNotificationManager (mounted only inside AppShell, i.e. only once
// authenticated) already calls this too, but a service worker registration
// is one of the browser's install-prompt eligibility checks, so it needs to
// happen on the Login page as well for the install prompt to be offered
// before a first login. register() is idempotent, so calling it again
// after login is harmless.
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);