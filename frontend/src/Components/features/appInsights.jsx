import React, { Component } from 'react';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';
import { getUrl } from '../../environment';

const reactPlugin = new ReactPlugin();
const baseUrl = getUrl();
const originalFetch = window.fetch;

let appInsights = null;
let appInsightsInitialized = false;
let telemetryQueue = [];
let globalFetchOverrideEnabled = false;

let pageVisibilityData = { entryTime: null, visibleTime: 0, lastVisibleStart: null };

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateSpanId() {
  return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

function safeTrack(fn) {
  appInsightsInitialized ? fn() : telemetryQueue.push(fn);
}

function getCorrelationContext() {
  return {
    sessionId: sessionStorage.getItem('sessionId') || '',
    userId:    sessionStorage.getItem('userId') || '',
    userName:  sessionStorage.getItem('userName') || localStorage.getItem('userName') || '',
    traceId:   appInsights?.context?.telemetryTrace?.traceID || '',
    spanId:    generateSpanId(),
  };
}

// ─── Global Fetch Correlation ───────────────────────────────────────────────

export function enableGlobalFetchCorrelation({ excludeUrls = [] } = {}) {
  if (globalFetchOverrideEnabled) return;

  window.fetch = function (url, opts = {}) {
    if (excludeUrls.some(p => url.toString().includes(p))) return originalFetch(url, opts);

    const headers = new Headers(opts.headers || {});
    const ctx = getCorrelationContext();
    headers.set('x-session-id', ctx.sessionId);
    headers.set('x-user-id', ctx.userId);
    headers.set('x-user-name', ctx.userName);
    if (ctx.traceId) headers.set('traceparent', `00-${ctx.traceId}-${ctx.spanId}-01`);

    return originalFetch(url, { ...opts, headers });
  };

  globalFetchOverrideEnabled = true;
}

export function disableGlobalFetchCorrelation() {
  if (!globalFetchOverrideEnabled) return;
  window.fetch = originalFetch;
  globalFetchOverrideEnabled = false;
}

// ─── Initialize ─────────────────────────────────────────────────────────────

function initializeAppInsights() {
  return fetch(baseUrl + 'getSecrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secretName: 'instrumentationKey-itelemetry' }),
  })
    .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error); }))
    .then(data => data.Data)
    .catch(err => { console.error('[AppInsights] Key fetch failed:', err); return null; })
    .then(key => {
      if (!key) return null;

      appInsights = new ApplicationInsights({
        config: {
          instrumentationKey: key,
          endpointUrl: baseUrl + 'telemetryAppInsights',
          enableAutoRouteTracking: true,
          disableTelemetry: false,
          samplingPercentage: 100,
          maxBatchInterval: 15000,
          maxBatchSizeInBytes: 102400,
          enableCorsCorrelation: false,
          disableAjaxTracking: true,
          disableFetchTracking: true,
          distributedTracingMode: 2,
          extensions: [reactPlugin],
          extensionConfig: { [reactPlugin.identifier]: { history: null } },
        },
      });

      appInsights.loadAppInsights();
      appInsightsInitialized = true;
      telemetryQueue.forEach(fn => fn());
      telemetryQueue = [];
      window.addEventListener('beforeunload', () => appInsights.flush());
      return appInsights;
    });
}

// ─── Tracking ───────────────────────────────────────────────────────────────

const trackException = (error, props = {}) => {
  safeTrack(() => appInsights.trackException({
    exception: error,
    properties: {
      name: error?.name || 'UnknownError',
      message: error?.message || '',
      stack: error?.stack || '',
      ...props,
    },
  }));
};

const trackUserLogin = (user, sessionId, href) => {
  safeTrack(() => {
    if (!user || sessionStorage.getItem('eventTracked')) return;
    localStorage.setItem('userName', user.displayName);
    appInsights.trackEvent({
      name: 'UserLogin',
      properties: {
        userName: user.displayName,
        loginTime: new Date().toISOString(),
        email: user.userPrincipalName || '',
        Id: user.id,
        location: user.officeLocation,
        page: href,
        jobTitle: user.jobTitle,
        sessionId,
      },
    });
    sessionStorage.setItem('eventTracked', 'true');
  });
};

// ─── Page Visibility Tracking ───────────────────────────────────────────────

export const startPageTracking = (href) => {
  const now = Date.now();
  sessionStorage.setItem('prevPageUrl', href);
  pageVisibilityData = { entryTime: now, visibleTime: 0, lastVisibleStart: now };

  const onVisChange = () => {
    if (document.hidden) {
      if (pageVisibilityData.lastVisibleStart) {
        pageVisibilityData.visibleTime += Date.now() - pageVisibilityData.lastVisibleStart;
        pageVisibilityData.lastVisibleStart = null;
      }
    } else {
      pageVisibilityData.lastVisibleStart = Date.now();
    }
  };

  document.addEventListener('visibilitychange', onVisChange);
  window.addEventListener('beforeunload', () => document.removeEventListener('visibilitychange', onVisChange));
};

export const logPageVisit = () => {
  if (pageVisibilityData.lastVisibleStart) {
    pageVisibilityData.visibleTime += Date.now() - pageVisibilityData.lastVisibleStart;
    pageVisibilityData.lastVisibleStart = null;
  }

  const page = sessionStorage.getItem('prevPageUrl') || 'unknown';
  const seconds = pageVisibilityData.visibleTime / 1000;

  safeTrack(() => {
    appInsights.trackMetric({ name: 'TimeSpentInApp', average: seconds });
    appInsights.trackEvent({
      name: 'PageVisited',
      properties: {
        page, timeSpent: seconds,
        sessionId: sessionStorage.getItem('sessionId') || 'unknown',
        userId: sessionStorage.getItem('userId') || 'unknown',
        userName: sessionStorage.getItem('userName') || 'unknown',
      },
    });
  });

  pageVisibilityData = { entryTime: null, visibleTime: 0, lastVisibleStart: null };
};

// ─── Error Boundary ─────────────────────────────────────────────────────────

export class ErrorBoundary extends Component {
  state = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error, errorInfo) {
    safeTrack(() => appInsights.trackException({
      exception: error,
      properties: { componentStack: errorInfo.componentStack, pageUrl: window.location.href,
                    componentName: this.props.componentName || 'Unknown Component' },
    }));
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ border: '2px solid red', padding: '20px', textAlign: 'center', borderRadius: '10px' }}>
          <h2>Something went wrong in {this.props.componentName || 'this section'}.</h2>
          <p>{this.state.errorMessage}</p>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
                  style={{ padding: '10px 20px', marginTop: '10px', cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { initializeAppInsights, reactPlugin, trackException, trackUserLogin, appInsights, appInsightsInitialized };

