import { MultiplayerClient } from "./MultiplayerClient";

let multiplayerClient: MultiplayerClient | undefined;
let multiplayerSessionActive = false;
let multiplayerStartedAt: number | null = null;

const participantSessionKey = "wikispeedrun.multiplayer.participant";
export type SavedParticipantSession = { roomCode: string; nickname: string; participantToken: string };

export const getSavedParticipantSession = (): SavedParticipantSession | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(participantSessionKey);
    if (!value) return undefined;
    const session = JSON.parse(value) as Partial<SavedParticipantSession>;
    if (!session.roomCode || !session.participantToken) return undefined;
    return { roomCode: session.roomCode, nickname: session.nickname ?? "", participantToken: session.participantToken };
  } catch {
    return undefined;
  }
};

export const saveParticipantSession = (session: SavedParticipantSession) => {
  if (typeof window !== "undefined") window.localStorage.setItem(participantSessionKey, JSON.stringify(session));
};

export const clearSavedParticipantSession = () => {
  if (typeof window !== "undefined") window.localStorage.removeItem(participantSessionKey);
};

export const getMultiplayerClient = () => {
  multiplayerClient ??= new MultiplayerClient();
  return multiplayerClient;
};

export const activateMultiplayerSession = () => {
  multiplayerSessionActive = true;
};

export const isMultiplayerSessionActive = () => multiplayerSessionActive;

export const setMultiplayerStartedAt = (startedAt: number | null) => {
  multiplayerStartedAt = startedAt;
};

export const getMultiplayerStartedAt = () => multiplayerStartedAt;
