import { useLingui } from "@lingui/react/macro";
import type { MultiplayerConnectionState } from "../multiplayer/MultiplayerClient";

const MultiplayerConnectionStatus = ({ state }: { state: MultiplayerConnectionState }) => {
  const { t } = useLingui();
  if (state === "connected") return null;

  return (
    <p className="rounded border border-amber-700/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" role="status" aria-live="polite">
      {state === "connecting"
        ? t({ comment: "Status shown while connecting or reconnecting to the multiplayer server", message: "Forbinder til multiplayer-serveren…" })
        : t({ comment: "Status shown while multiplayer is offline and automatic reconnect is being attempted", message: "Forbindelsen er afbrudt. Prøver igen…" })}
    </p>
  );
};

export default MultiplayerConnectionStatus;
