import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.tsx'

// A tab left open across a deployment can reference a chunk that no longer exists.
window.addEventListener('vite:preloadError', (event) => {
  if (!navigator.onLine) return;
  try {
    const key = 'geodata:preload-reload';
    if (sessionStorage.getItem(key) === import.meta.url) return;
    sessionStorage.setItem(key, import.meta.url);
  } catch { return; }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
