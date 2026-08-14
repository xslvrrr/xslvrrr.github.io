import { createFileRoute } from "@tanstack/react-router";
import AssistantChat from "../../components/dashboard/assistant/AssistantChat";

export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
  head: () => ({
    meta: [
      { title: "Assistant - Millennium" },
      { name: "description", content: "Millennium AI assistant." },
    ],
  }),
});

function AssistantPage() {
  return <AssistantChat mode="page" />;
}

