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

// Prevent mobile pull-to-refresh browser page reload gesture
let lastTouchY = 0;
document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    lastTouchY = e.touches[0].clientY;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  const touchY = e.touches[0].clientY;
  const touchDiff = touchY - lastTouchY;
  if (window.scrollY === 0 && touchDiff > 0) {
    if (e.cancelable) {
      e.preventDefault();
    }
  }
}, { passive: false });

createRoot(document.getElementById('root')!).render(<App />);
