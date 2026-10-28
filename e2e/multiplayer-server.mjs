import { createMultiplayerServer } from "../server/index.js";

const port = Number(process.env.PORT ?? 10001);
const server = createMultiplayerServer({
});

await server.listen(port);

const shutdown = () => {
  void server.close().finally(() => process.exit(0));
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
