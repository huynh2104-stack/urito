import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installKeyboardTracking } from './lib/keyboard';
import { installGlobalErrorLogging } from './lib/errorLog';
import { registerServiceWorker } from './lib/sw';
import './styles/index.css';
import './styles/app.css';
import './styles/theme.css';
import './styles/receipt.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* ディスク逼迫時にブラウザが IndexedDB を消去しないよう永続化ストレージを要求する。 */
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage
    .persisted?.()
    .then((persisted) => (persisted ? true : navigator.storage.persist()))
    .catch(() => {});
}
installKeyboardTracking();
installGlobalErrorLogging();
registerServiceWorker();
if (typeof location !== 'undefined' && location.search.includes('bench=1')) {
  void import('./lib/bench');
}
