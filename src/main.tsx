import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Filter out expected dev environment Firebase auth token service / offline warnings
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a)) : String(a))).join(' ');
  if (
    msg.includes('securetoken.googleapis.com') || 
    msg.includes('token-service-api') || 
    msg.includes('Could not reach Cloud Firestore backend') ||
    msg.includes('Fetching auth token failed')
  ) {
    console.warn('[Firebase Offline/Token Fallback]:', ...args);
    return;
  }
  originalConsoleError.apply(console, args);
};

window.addEventListener('unhandledrejection', (event) => {
  const reasonMsg = event.reason ? (event.reason.message || String(event.reason)) : '';
  if (
    reasonMsg.includes('token-service-api') || 
    reasonMsg.includes('securetoken') || 
    reasonMsg.includes('Could not reach Cloud Firestore backend') ||
    reasonMsg.includes('Fetching auth token failed')
  ) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
