import { createFileRoute } from "@tanstack/react-router";
import Multiplayer from "../pages/Multiplayer";

export const Route = createFileRoute("/multiplayer")({ component: Multiplayer });
