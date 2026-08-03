import Head from 'next/head';

import ChangelogScreen from '../src/screens/changelog';

/**
 * Next entry point for the public changelog. The screen itself is router-agnostic and is also
 * mounted by the TanStack file route in `src/routes/changelog.tsx` for the platform rewrite.
 */
export default function Changelog() {
    return (
        <>
            <Head>
                <title>Changelog | Millennium</title>
                <meta
                    name="description"
                    content="Big things are coming to Millennium. Countdown and preview of the next release."
                />
            </Head>
            <ChangelogScreen />
        </>
    );
}
