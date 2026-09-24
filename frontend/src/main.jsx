import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from './App';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { ssoConfig } from './authConfig';
import { BrowserRouter } from 'react-router-dom';
import { initializeAppInsights, enableGlobalFetchCorrelation } from './Components/features/appInsights';

const theme = createTheme({
  palette: {
    primary: { main: '#1e3a8a' },
    secondary: { main: '#000000' },
  },
});

const ssoInstance = new PublicClientApplication(ssoConfig);
const root = ReactDOM.createRoot(document.getElementById('root'));

ssoInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS) {
    console.log('Hello Login');
  }
});

async function initializeMsalInstance() {
  await ssoInstance.initialize();
  const appInsights = await initializeAppInsights();
  if (appInsights) {
    enableGlobalFetchCorrelation({
      excludeUrls: ['login.microsoftonline.com', 'graph.microsoft.com'],
      trackAllCalls: true,
    });
    console.log('[AppInsights] Initialized with global fetch correlation enabled');

    root.render(
      <BrowserRouter>
        <ThemeProvider theme={theme}>
          <MsalProvider instance={ssoInstance}>
            <App appInsights={appInsights} msalInstance={ssoInstance} />
          </MsalProvider>
        </ThemeProvider>
      </BrowserRouter>
    );
  } else {
    console.error('Failed to initialize app insights');
  }
}

initializeMsalInstance();
