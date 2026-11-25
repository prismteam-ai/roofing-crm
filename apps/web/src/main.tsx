import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { apiUrl, makeApiClient } from './lib/api.js';
import { Providers } from './Providers.js';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

const url = apiUrl();

createRoot(container).render(
  <StrictMode>
    {url ? (
      <Providers client={makeApiClient(url)}>
        <App />
      </Providers>
    ) : (
      <main className="config-error" role="alert">
        <h1>Roofing Lead CRM</h1>
        <p>
          This build has no API address. Set the <code>VITE_API_URL</code> environment variable for
          the deployment and rebuild.
        </p>
      </main>
    )}
  </StrictMode>,
);
