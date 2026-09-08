import { IconArrowRight, IconBook, IconDoor, IconUserCheck, IconUsers } from '@tabler/icons-react';
import { AlertDialogAction, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import type { PortalClassChange } from '@/lib/portal-class-changes';
import styles from '@/styles/Dashboard.module.css';

const presentations = {
  substitute: {
    title: 'Substitute Teacher',
    icon: IconUserCheck,
    description: 'Someone else is taking this lesson today. Your timetable still has your usual teacher for the next two weeks, so this looks like a one-off cover.',
  },
  'teacher-change': {
    title: 'Teacher Change',
    icon: IconUsers,
    description: 'Your new teacher is also timetabled for this class over the next two weeks, so this looks like a permanent change rather than a cover.',
  },
  'room-change': {
    title: 'Room Change',
    icon: IconDoor,
    description: 'This lesson is in a different room today.',
  },
  'class-change': {
    title: 'Class Change',
    icon: IconBook,
    description: 'A different class is timetabled for this period today. It changes today’s lesson only; you are still enrolled in both classes.',
  },
} as const;

export function PortalClassChangeContent({ change, onAcknowledge }: { change: PortalClassChange; onAcknowledge: () => void }) {
  const presentation = presentations[change.type];
  const Icon = presentation.icon;
  return <>
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2"><Icon size={22} />{presentation.title}</AlertDialogTitle>
      <AlertDialogDescription>{presentation.description}</AlertDialogDescription>
    </AlertDialogHeader>
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{change.classCode}</Badge>
      <Badge variant="outline">P{change.period}</Badge>
      <span className="text-sm text-muted-foreground">{new Date(`${change.date}T12:00:00Z`)
        .toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
    </div>
    <div className={styles.syncReviewChange}>
      <span>{change.from}</span><IconArrowRight size={16} aria-hidden="true" /><strong>{change.to}</strong>
    </div>
    <AlertDialogFooter><AlertDialogAction onClick={onAcknowledge}>Got it</AlertDialogAction></AlertDialogFooter>
  </>;
}
