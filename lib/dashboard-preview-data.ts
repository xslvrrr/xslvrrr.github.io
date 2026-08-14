import type { PortalData, UserSession } from '@/types/portal';
import type { CalendarEvent, CalendarSource } from '@/types/calendar';

export const previewSession: UserSession = {
  loggedIn: true,
  username: 'Your Name',
  school: 'Example High School',
  timestamp: '2026-02-14T15:12:00.000Z',
  profileImage: null,
};

export const previewPortalData: PortalData = {
  user: {
    name: 'Your Name',
    school: 'Example High School',
  },
  account: {
    username: 'your.name1',
    firstName: 'Your',
    lastName: 'Name',
    email: 'your.name1@education.nsw.gov.au',
    nesaStudentNumber: '123456789',
    usi: 'ABC1234567',
    mobile: '0400000000',
    currentYear: '2026',
  },
  timetable: {
    weekA: [
      { day: 'Monday', period: '1', course: 'Physics', classCode: 'PHY11', teacher: 'N. OLeary', room: 'B204' },
      { day: 'Monday', period: '2', course: 'Mathematics Extension', classCode: 'MATX1', teacher: 'A. Sharma', room: 'C112' },
      { day: 'Tuesday', period: '3', course: 'Chemistry', classCode: 'CHEM11', teacher: 'S. Harrison', room: 'Lab 3' },
      { day: 'Wednesday', period: '4', course: 'Studies of Religion', classCode: 'SOR11', teacher: 'B. Mannes', room: 'E08' },
      { day: 'Thursday', period: '2', course: 'English Advanced', classCode: 'ENGA11', teacher: 'M. Nguyen', room: 'D17' },
      { day: 'Friday', period: '5', course: 'Physics', classCode: 'PHY11', teacher: 'N. OLeary', room: 'B204' },
    ],
    weekB: [
      { day: 'Monday', period: '1', course: 'Chemistry', classCode: 'CHEM11', teacher: 'S. Harrison', room: 'Lab 3' },
      { day: 'Tuesday', period: '2', course: 'English Advanced', classCode: 'ENGA11', teacher: 'M. Nguyen', room: 'D17' },
      { day: 'Wednesday', period: '3', course: 'Mathematics Extension', classCode: 'MATX1', teacher: 'A. Sharma', room: 'C112' },
      { day: 'Thursday', period: '4', course: 'Physics', classCode: 'PHY11', teacher: 'N. OLeary', room: 'B204' },
      { day: 'Friday', period: '2', course: 'Studies of Religion', classCode: 'SOR11', teacher: 'B. Mannes', room: 'E08' },
    ],
  },
  notices: [
    {
      title: 'Assessment schedule published',
      preview: 'Physics practical due Friday, Chemistry depth study next week.',
      content: 'Your assessment schedule has been updated. Review the Physics and Chemistry tasks before Friday.',
      date: '2026-07-05',
    },
    {
      title: 'Library study rooms open',
      preview: 'Senior study rooms are available from 7:45am this week.',
      content: 'Book a senior study room through the library desk before roll call.',
      date: '2026-07-06',
    },
    {
      title: 'Urgent timetable room update',
      preview: 'Mathematics Extension moves to C112 for Week A.',
      content: 'Your Week A Mathematics Extension class has moved to C112.',
      date: '2026-07-05',
    },
  ],
  diary: [
    { date: '2026-07-05', title: 'Physics practical revision', description: 'Prepare data table and method notes.' },
    { date: '2026-07-07', title: 'Chemistry depth study draft', description: 'Bring printed hypothesis to class.' },
  ],
  grades: [
    { subject: 'Physics', task: 'Practical Skills', result: '18/20', date: '2026-06-28' },
    { subject: 'Chemistry', task: 'Module 2 Quiz', result: '21/25', date: '2026-06-19' },
    { subject: 'English Advanced', task: 'Essay Draft', result: 'A', date: '2026-06-12' },
  ],
  attendance: {
    yearly: [
      { year: '2026', schoolDays: 94, wholeDayAbsences: 2, wholeDayPercentage: 97.9, partialAbsences: 1, totalPercentage: 96.8 },
    ],
    subjects: [
      { classCode: 'PHY11', rollsMarked: 38, absent: 1, percentage: 97 },
      { classCode: 'CHEM11', rollsMarked: 41, absent: 2, percentage: 95 },
      { classCode: 'MATX1', rollsMarked: 35, absent: 0, percentage: 100 },
    ],
  },
  calendar: [],
  reports: [
    { title: 'Year 11 Semester 1 Report', url: '#', yearLevel: 'Year 11', semester: 1, calendarYear: 2026 },
    { title: 'Year 10 Semester 2 Report', url: '#', yearLevel: 'Year 10', semester: 2, calendarYear: 2025 },
  ],
  classes: [
    { course: 'Physics', classCode: 'PHY11', teacher: 'N. OLeary', lessons: 38, quickMerits: 4, rollsMarked: 38, absences: 1 },
    { course: 'Chemistry', classCode: 'CHEM11', teacher: 'S. Harrison', lessons: 41, quickMerits: 3, rollsMarked: 41, absences: 2 },
    { course: 'Mathematics Extension', classCode: 'MATX1', teacher: 'A. Sharma', lessons: 35, quickMerits: 5, rollsMarked: 35, absences: 0 },
    { course: 'English Advanced', classCode: 'ENGA11', teacher: 'M. Nguyen', lessons: 36, quickMerits: 2, rollsMarked: 36, absences: 1 },
  ],
  lastUpdated: '2026-02-14T15:08:00.000Z',
};

export const previewCalendars: CalendarSource[] = [
  {
    id: 'local',
    name: 'My Events',
    color: '#10b981',
    icon: 'IconCalendarEvent',
    visible: true,
    isLocal: true,
  },
  {
    id: 'classes',
    name: 'Classes',
    color: '#8b5cf6',
    icon: 'IconBook',
    visible: true,
    isLocal: true,
  },
];

export const previewCalendarEvents: CalendarEvent[] = [
  {
    id: 'preview-physics-practical',
    title: 'Physics practical revision',
    description: 'Prepare data table and method notes.',
    start: new Date('2026-07-07T09:15:00'),
    end: new Date('2026-07-07T10:00:00'),
    calendarId: 'local',
    calendarName: 'My Events',
    color: '#10b981',
    isLocal: true,
  },
  {
    id: 'preview-chemistry-draft',
    title: 'Chemistry draft review',
    description: 'Check hypothesis and source notes.',
    start: new Date('2026-07-07T13:20:00'),
    end: new Date('2026-07-07T14:05:00'),
    calendarId: 'local',
    calendarName: 'My Events',
    color: '#10b981',
    isLocal: true,
  },
];
