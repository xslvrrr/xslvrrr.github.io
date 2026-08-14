export type LoginStep = 'checking' | 'login' | 'install' | 'sync' | 'ready' | 'syncing';

type PortalData = {
  timetable?: unknown[] | { weekA?: unknown[]; weekB?: unknown[] };
  user?: unknown;
  userId?: string;
};

type ReadyPortalData = PortalData & {
  user: { name: string; school: string; uid?: string };
};

function hasSyncedTimetable(data: PortalData | null | undefined): boolean {
  const timetable = data?.timetable;
  if (Array.isArray(timetable)) return timetable.length > 0;
  return Boolean(timetable?.weekA?.length || timetable?.weekB?.length);
}

export function hasReadyPortalData(data: PortalData | null | undefined): data is ReadyPortalData {
  const user = data?.user as { name?: unknown; school?: unknown } | undefined;
  return Boolean(typeof user?.name === 'string' && typeof user.school === 'string' && hasSyncedTimetable(data));
}

export function getTokenLoginFallbackData(result: PortalData | null | undefined | void): ReadyPortalData | null {
  return result && hasReadyPortalData(result) ? result : null;
}

export function stepAfterExtensionPresence(step: LoginStep): LoginStep {
  return step === 'install' ? 'sync' : step;
}

export function getTransitionTarget(
  currentStep: LoginStep,
  pendingStep: LoginStep | null,
  nextStep: LoginStep,
): LoginStep | null {
  return nextStep === currentStep || nextStep === pendingStep ? null : nextStep;
}
