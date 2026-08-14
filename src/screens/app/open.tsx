import { useEffect } from 'react';
import {
  createDesktopBridgeUrl,
  isValidDesktopLoginPayload,
} from '@/lib/desktop/links';
import { useAppRouter as useRouter } from '@/start/router';

export default function AppUniversalLink() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const token = typeof router.query.token === 'string' ? router.query.token : '';
    const state = typeof router.query.state === 'string' ? router.query.state : '';
    if (isValidDesktopLoginPayload(token, state)) {
      const bridgeUrl = new URL(createDesktopBridgeUrl(token, state, window.location.origin));
      router.replace(`${bridgeUrl.pathname}${bridgeUrl.search}`);
    } else {
      router.replace('/app-open');
    }
  }, [router, router.isReady, router.query.state, router.query.token]);

  return (
    <>
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        Opening Millennium Desktop...
      </div>
    </>
  );
}
