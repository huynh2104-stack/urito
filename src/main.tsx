import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useApp } from './store/app';
import { requestPersistentStorage } from './services/backup';
import { installKeyboardTracking } from './lib/keyboard';
import { installGlobalErrorLogging } from './lib/errorLog';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/vietnamese-800.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import '@fontsource/be-vietnam-pro/latin-800.css';
import './styles/index.css';
import './styles/app.css';
import './styles/theme.css';
import './styles/receipt.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* Ask the browser to keep our IndexedDB even when the disk fills up.
 * On a shop machine this is the difference between "the data is there"
 * and "the browser silently evicted a week of invoices". */
void requestPersistentStorage();
installKeyboardTracking();
installGlobalErrorLogging();

/* Offline support. The worker caches the built assets on first visit, so the
 * shop keeps selling when the internet drops - which it will. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              useApp.getState().setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        /* offline support is a bonus, never a hard failure */
      });
  });
}
