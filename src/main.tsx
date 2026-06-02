import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './components/ThemeProvider.tsx';
import { initFirebase } from './firebase';

const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);

// Bootstrap process: Fetch live environment configurations, then mount the React application.
async function bootstrap() {
  try {
    await initFirebase();
  } catch (error) {
    console.error("Critical error during Firebase initialization:", error);
  }

  root.render(
    <StrictMode>
      <ThemeProvider defaultTheme="system" storageKey="app-theme">
        <App />
      </ThemeProvider>
    </StrictMode>,
  );
}

bootstrap();
