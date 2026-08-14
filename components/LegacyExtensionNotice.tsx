import { useEffect, useState } from 'react';
import { IconInfoCircle, IconX } from '@tabler/icons-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

const WEB_APP_SOURCE = 'millennium-web-app';
const EXTENSION_SOURCE = 'millennium-sync-extension';
const CHECK_EXTENSION = 'CHECK_EXTENSION';
const EXTENSION_PRESENT = 'EXTENSION_PRESENT';
const DETECTION_TIMEOUT_MS = 1500;
const MAX_VERSION_LENGTH = 64;
const NOTICE_REVISION = 'legacy-extension-v1';
const DISMISSAL_KEY_PREFIX = 'millennium:notice-dismissed';

interface ExtensionPresentMessage {
  source: typeof EXTENSION_SOURCE;
  type: typeof EXTENSION_PRESENT;
  requestId: string;
  version?: string;
}

function isExtensionPresentMessage(
  value: unknown,
  requestId: string,
): value is ExtensionPresentMessage {
  if (!value || typeof value !== 'object') return false;

  const message = value as Record<string, unknown>;
  const version = message.version;

  return message.source === EXTENSION_SOURCE
    && message.type === EXTENSION_PRESENT
    && message.requestId === requestId
    && (version === undefined
      || (typeof version === 'string'
        && version.length > 0
        && version.length <= MAX_VERSION_LENGTH));
}

function getDismissalKey(version?: string): string {
  return `${DISMISSAL_KEY_PREFIX}:${NOTICE_REVISION}:${version ?? 'unknown'}`;
}

function isDismissed(version?: string): boolean {
  try {
    return window.localStorage.getItem(getDismissalKey(version)) === 'true';
  } catch {
    return false;
  }
}

function rememberDismissal(version?: string): void {
  try {
    window.localStorage.setItem(getDismissalKey(version), 'true');
  } catch {
    // The notice still dismisses for this page when storage is unavailable.
  }
}

function getExtensionManagementPage(): string {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return userAgent.includes('firefox') ? 'about:addons' : 'chrome://extensions';
}

export function LegacyExtensionNotice() {
  const [extensionVersion, setExtensionVersion] = useState<string | undefined>();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const requestId = window.crypto.randomUUID();
    let isListening = true;

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (!isListening || event.source !== window || event.origin !== window.location.origin) return;
      if (!isExtensionPresentMessage(event.data, requestId)) return;

      isListening = false;
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);

      setExtensionVersion(event.data.version);
      setIsVisible(!isDismissed(event.data.version));
    };

    const timeoutId = window.setTimeout(() => {
      isListening = false;
      window.removeEventListener('message', handleMessage);
    }, DETECTION_TIMEOUT_MS);

    window.addEventListener('message', handleMessage);

    let storedVersion: string | undefined;
    let wasPreviouslyDetected = false;
    try {
      storedVersion = window.localStorage.getItem('millennium-extension-version') || undefined;
      wasPreviouslyDetected = window.localStorage.getItem('millennium-extension-installed') === 'true';
    } catch {
      // Continue with active detection when browser storage is unavailable.
    }
    if (storedVersion || wasPreviouslyDetected) {
      isListening = false;
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
      setExtensionVersion(storedVersion);
      setIsVisible(!isDismissed(storedVersion));
    } else {
      window.postMessage(
        { source: WEB_APP_SOURCE, type: CHECK_EXTENSION, requestId },
        window.location.origin,
      );
    }

    return () => {
      isListening = false;
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  if (!isVisible) return null;

  const extensionManagementPage = getExtensionManagementPage();

  const handleDismiss = () => {
    rememberDismissal(extensionVersion);
    setIsVisible(false);
  };

  return (
    <aside className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-xl sm:inset-x-6">
      <Alert className="pointer-events-auto border-border/80 bg-card/95 py-3 pr-12 shadow-lg backdrop-blur">
        <IconInfoCircle aria-hidden="true" />
        <AlertTitle>Legacy extension detected</AlertTitle>
        <AlertDescription>
          Millennium now refreshes data in the background. {extensionVersion ? `Version v${extensionVersion} ` : 'This extension '}
          is no longer required and is safe to uninstall. Open{' '}
          <span className="font-medium text-foreground">{extensionManagementPage}</span>{' '}
          in your browser, find Millennium Sync, and choose Remove.
        </AlertDescription>
        <AlertAction className="right-2 top-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss extension removal notice"
            onClick={handleDismiss}
          >
            <IconX aria-hidden="true" />
          </Button>
        </AlertAction>
      </Alert>
    </aside>
  );
}
