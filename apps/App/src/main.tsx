import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { ToastViewport } from './components/ui/ToastViewport';
import { queryClient } from './lib/query-client';
import { useThemeStore } from './store/theme-store';
import './styles.css';

// Apply the persisted theme class before first render to avoid flash
const storedTheme = (() => {
  try {
    const raw = localStorage.getItem('tradepilot-theme');
    const parsed = raw ? (JSON.parse(raw) as { state?: { theme?: string } }) : null;
    return parsed?.state?.theme ?? 'light';
  } catch {
    return 'light';
  }
})();

document.documentElement.classList.add(storedTheme);

// Keep <html> class in sync with the Zustand store
useThemeStore.subscribe((state) => {
  const html = document.documentElement;
  html.classList.remove('dark', 'light');
  html.classList.add(state.theme);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ToastViewport />
    </QueryClientProvider>
  </React.StrictMode>,
);
