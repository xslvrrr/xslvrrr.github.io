import { createFileRoute } from '@tanstack/react-router';
import UpdatesPage from '../screens/updates';

export const Route = createFileRoute('/updates')({
    component: UpdatesPage,
    head: () => ({
        meta: [
            { title: "What's New? | Millennium" },
            { name: 'description', content: 'Latest Millennium update notes.' },
        ],
    }),
});
