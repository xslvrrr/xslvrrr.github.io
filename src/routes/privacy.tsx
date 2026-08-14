import { createFileRoute } from '@tanstack/react-router';
import PrivacyPage from '../screens/privacy';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: 'Privacy Policy | Millennium' },
      { name: 'description', content: 'How Millennium protects student portal login details and synced school data.' },
    ],
  }),
});
