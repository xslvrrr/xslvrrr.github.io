import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import '../styles/globals.css';
import { Toaster } from '../components/ui/sonner';

import { useAnimationSettings } from '../hooks/useAnimationSettings';

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
    // Apply animation settings globally
    useAnimationSettings();

    return (
        <SessionProvider session={session}>
            <Component {...pageProps} />
            <Toaster position="top-right" richColors closeButton />
        </SessionProvider>
    );
}
