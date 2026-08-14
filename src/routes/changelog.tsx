import { createFileRoute } from '@tanstack/react-router';
import ChangelogPage from '../screens/changelog';

export const Route = createFileRoute('/changelog')({
    component: ChangelogPage,
    head: () => ({
        meta: [
            { title: 'Changelog | Millennium' },
            {
                name: 'description',
                content: 'Big things are coming to Millennium. Countdown and preview of the next release.',
            },
        ],
    }),
});
