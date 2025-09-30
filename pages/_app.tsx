import type { AppProps } from 'next/app';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ProgressBar from '../components/ProgressBar';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <ProgressBar />
      <Component {...pageProps} />
    </ErrorBoundary>
  );
}

// Report web vitals for performance monitoring
export function reportWebVitals(metric: any) {
  if (process.env.NODE_ENV === 'development') {
    // Log performance metrics in development
    const { id, name, label, value } = metric;
    console.log(`[${label}] ${name}:`, value);
  }
  // In production, send to analytics service (e.g., Google Analytics, Vercel Analytics)
}
