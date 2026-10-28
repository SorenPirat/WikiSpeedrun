import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { getMultiplayerClient, getSavedTeacherSession } from "../multiplayer/session";
import type { MultiplayerMessage, MultiplayerRoom } from "../multiplayer/MultiplayerClient";
import { TeacherHistoryTable, TeacherStopwatch } from "../pages/Multiplayer";
import { Resizable } from "re-resizable";
import { useLingui } from "@lingui/react";
import { useClicks } from "../stores/GameStore";
import { useSettingsStoreActions, useSidebarWidth } from "../stores/SettingsStore";
import HistoryTable from "./HistoryTable";
import { Stopwatch } from "./Stopwatch";

const Sidebar = () => {
  const { i18n } = useLingui();
  const location = useLocation();
  const client = getMultiplayerClient();
  const [room, setRoom] = useState<MultiplayerRoom>();

  useEffect(() => {
    const unsubscribe = client.onMessage((message: MultiplayerMessage) => {
      if (message.type === "room-created" || message.type === "room-joined" || message.type === "room-state") setRoom(message.room);
    });
    return () => { unsubscribe(); };
  }, [client]);

  const teacherRoom = location.pathname === "/multiplayer" && getSavedTeacherSession() && room ? room : undefined;
  const sidebarWidth = useSidebarWidth();
  const { setSidebarWidth } = useSettingsStoreActions();

  const clicks = useClicks();
  return (
    <>
      <Resizable
        size={{
          width: sidebarWidth,
          height: "100%",
        }}
        onResizeStop={(_e, _direction, ref) => {
          setSidebarWidth(ref.offsetWidth);
        }}
        minHeight="100%"
        minWidth={300}
        maxWidth={1000}
        className="border-r-[2px] border-secondary-blue pt-3 pr-3 hover:border-r-[2px] hover:border-primary-blue md:hidden"
        enable={{
          top: false,
          right: true,
          bottom: false,
          left: false,
          topRight: false,
          bottomRight: false,
          bottomLeft: false,
          topLeft: false,
        }}
      >
        <div className="flex h-full w-full flex-col items-center justify-start gap-8">
          {teacherRoom ? <TeacherHistoryTable room={teacherRoom} onRemoveParticipant={(participantId) => {
            const teacherSession = getSavedTeacherSession();
            if (teacherSession && window.confirm("Fjern denne deltager fra rummet?")) client.removeParticipant(teacherSession.teacherToken, participantId);
          }} /> : <HistoryTable />}
          <div className="relative mt-auto flex w-full shrink-0 flex-wrap items-baseline justify-between overflow-auto pr-6 pb-6">
            {teacherRoom ? teacherRoom.status === "running" && teacherRoom.startedAt !== null && <TeacherStopwatch startedAt={teacherRoom.startedAt} /> : <>
              <span>
                {i18n._(
                  /** i18n */
                  { id: "Clicks: {clicks}", values: { clicks } },
                )}
              </span>
              <Stopwatch />
            </>}
          </div>
        </div>
      </Resizable>
    </>
  );
};

export default Sidebar;
