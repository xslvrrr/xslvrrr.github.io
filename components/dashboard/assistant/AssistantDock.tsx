import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { IconLoader2, IconSend } from "@tabler/icons-react";

import { STUDY_TRIAL_REQUEST_EVENT } from "@/lib/study-trial-shared";
import styles from "./AssistantChat.module.css";

const AssistantChat = lazy(() => import("./AssistantChat"));

interface AssistantDockProps {
  summarizeThinking?: boolean;
  onOpenInMain?: () => void;
  before?: ReactNode;
  beforeVisible?: boolean;
  after?: ReactNode;
  showLauncher?: boolean;
}

function DockLauncher({ loading = false, onClick, before, beforeVisible = false, after, showLauncher = true }: { loading?: boolean; onClick?: () => void; before?: ReactNode; beforeVisible?: boolean; after?: ReactNode; showLauncher?: boolean }) {
  return (
    <div className={styles.launcherBar} data-tour-id="assistant-launcher">
      {before}
      {before && showLauncher ? <span className={styles.dockSeparator} data-visible={beforeVisible ? "true" : "false"} aria-hidden="true" /> : null}
      {showLauncher ? (
        <button
          type="button"
          className={styles.launcherButton}
          onClick={onClick}
          disabled={loading}
          aria-label={loading ? "Loading AI Agent" : "Open AI Agent"}
          aria-busy={loading || undefined}
        >
          {loading ? <IconLoader2 size={15} aria-hidden="true" /> : <IconSend size={15} aria-hidden="true" />}
          <span>{loading ? "Loading AI Agent" : "AI Agent"}</span>
        </button>
      ) : null}
      {after}
    </div>
  );
}

/** Keeps the assistant bundle off the dashboard's critical path until requested. */
export function AssistantDock({ summarizeThinking, onOpenInMain, before, beforeVisible = false, after, showLauncher = true }: AssistantDockProps) {
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (!showLauncher) setActivated(false);
  }, [showLauncher]);

  useEffect(() => {
    const openForStudyTrial = () => setActivated(true);
    window.addEventListener(STUDY_TRIAL_REQUEST_EVENT, openForStudyTrial);
    return () => window.removeEventListener(STUDY_TRIAL_REQUEST_EVENT, openForStudyTrial);
  }, []);

  if (!showLauncher) {
    return <DockLauncher before={before} beforeVisible={beforeVisible} after={after} showLauncher={false} />;
  }

  if (!activated) {
    return <DockLauncher before={before} beforeVisible={beforeVisible} after={after} onClick={() => setActivated(true)} />;
  }

  return (
    <Suspense fallback={<DockLauncher loading before={before} beforeVisible={beforeVisible} after={after} />}>
      <AssistantChat
        initiallyOpen
        summarizeThinking={summarizeThinking}
        onOpenInMain={onOpenInMain}
        dockBefore={before}
        dockBeforeVisible={beforeVisible}
        dockAfter={after}
      />
    </Suspense>
  );
}
