import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from './App';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { ssoConfig } from './authConfig';
import { BrowserRouter } from 'react-router-dom';
import { initializeAppInsights, enableGlobalFetchCorrelation } from './Components/features/appInsights';
import { logBackendEnvironment } from './environment';

const theme = createTheme({
  palette: {
    primary: { main: '#1e3a8a' },
    secondary: { main: '#000000' },
  },
});

const ssoInstance = new PublicClientApplication(ssoConfig);
const root = ReactDOM.createRoot(document.getElementById('root'));

// Root renders immediately after MSAL is ready. App Insights initializes in the
// background so telemetry setup never blocks the first paint.
function Root() {
  const [appInsights, setAppInsights] = useState(null);

  useEffect(() => {
    let mounted = true;
    initializeAppInsights().then((instance) => {
      if (!mounted) {
        return;
      }
      if (instance) {
        enableGlobalFetchCorrelation({
          excludeUrls: ['login.microsoftonline.com', 'graph.microsoft.com'],
          trackAllCalls: true,
        });
        setAppInsights(instance);
      } else {
        console.error('Failed to initialize app insights');
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <MsalProvider instance={ssoInstance}>
          <App appInsights={appInsights} msalInstance={ssoInstance} />
        </MsalProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

async function initializeMsalInstance() {
  await ssoInstance.initialize();
  root.render(<Root />);
  logBackendEnvironment();
}

initializeMsalInstance();
