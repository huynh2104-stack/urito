import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { requestPersistentStorage } from './services/backup';
import { installKeyboardTracking } from './lib/keyboard';
import { installGlobalErrorLogging } from './lib/errorLog';
import { registerServiceWorker } from './lib/sw';
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

/* ディスク逼迫時にブラウザが IndexedDB を消去しないよう永続化ストレージを要求する。 */
void requestPersistentStorage();
installKeyboardTracking();
installGlobalErrorLogging();
registerServiceWorker();
