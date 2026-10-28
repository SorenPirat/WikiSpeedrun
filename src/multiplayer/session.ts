import { MultiplayerClient } from "./MultiplayerClient";

let multiplayerClient: MultiplayerClient | undefined;
let multiplayerSessionActive = false;
let multiplayerStartedAt: number | null = null;
let multiplayerSessionPaused = false;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const participantSessionKey = "wikispeedrun.multiplayer.participant";
export type SavedParticipantSession = { roomCode: string; nickname: string; participantToken: string };

export const getSavedParticipantSession = (): SavedParticipantSession | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(participantSessionKey);
    if (!value) return undefined;
    const session: unknown = JSON.parse(value);
    if (!isRecord(session) || typeof session.roomCode !== "string" || typeof session.participantToken !== "string") return undefined;
    return { roomCode: session.roomCode, nickname: typeof session.nickname === "string" ? session.nickname : "", participantToken: session.participantToken };
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

const teacherSessionKey = "wikispeedrun.multiplayer.teacher";
export type SavedTeacherSession = { roomCode: string; teacherToken: string };
export const getSavedTeacherSession = (): SavedTeacherSession | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(teacherSessionKey);
    if (!value) return undefined;
    const session: unknown = JSON.parse(value);
    if (!isRecord(session) || typeof session.roomCode !== "string" || typeof session.teacherToken !== "string") return undefined;
    return { roomCode: session.roomCode, teacherToken: session.teacherToken };
  } catch { return undefined; }
};
export const saveTeacherSession = (session: SavedTeacherSession) => {
  if (typeof window !== "undefined") window.localStorage.setItem(teacherSessionKey, JSON.stringify(session));
};
export const clearSavedTeacherSession = () => {
  if (typeof window !== "undefined") window.localStorage.removeItem(teacherSessionKey);
};

export const getMultiplayerClient = () => {
  multiplayerClient ??= new MultiplayerClient();
  return multiplayerClient;
};

export const activateMultiplayerSession = () => {
  multiplayerSessionActive = true;
  multiplayerSessionPaused = false;
};

export const pauseMultiplayerSession = () => {
  multiplayerSessionPaused = true;
};

export const resumeMultiplayerSession = () => {
  multiplayerSessionPaused = false;
};

export const isMultiplayerSessionPaused = () => multiplayerSessionPaused;

export const isMultiplayerSessionActive = () => multiplayerSessionActive;

export const setMultiplayerStartedAt = (startedAt: number | null) => {
  multiplayerStartedAt = startedAt;
};

export const getMultiplayerStartedAt = () => multiplayerStartedAt;
