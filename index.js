import http from "http";
import { createHash, randomBytes } from "crypto";
import {WebSocketServer} from "ws";

const port = Number(process.env.PORT);
const relayMap = new Map();
const socketServer = http.createServer();

const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);
const uid = () => createHash("sha256").update(randomBytes(32)).digest("hex");

socketServer.on("request", (request, response) => {
  const pathname = new URL(String(request.url), "http://localhost").pathname;
  const { method } = request;

  switch (true) {
    case method === "GET" && pathname === "/new":
      response.writeHead(200).end(uid());
      break;

    case method === "GET" && pathname === "/status":
      const list = [...relayMap.values()].map((socket) => ({
        id: socket.id,
        clients: socket.clients.size,
      }));
      response.writeHead(200).end(JSON.stringify(list, null, 2));
      break;

    default:
      response.writeHead(404).end();
  }
});

socketServer.on("upgrade", function (request, socket, head) {
  const pathname = new URL(String(request.url), "http://localhost").pathname;
  const sessionId = pathname.slice(1);

  if (!sessionId) {
    socket.destroy();
    return;
  }

  log(`New client for ${sessionId}`);
  let relay = relayMap.get(sessionId);

  if (!relay) {
    relay = new WebSocketServer({ noServer: true });
    relay.id = sessionId;
    relayMap.set(sessionId, relay);
  }

  relay.handleUpgrade(request, socket, head, (webSocket) => {
    webSocket.id = sessionId;
    handleNewClient(webSocket);
  });
});

function broadcast(origin, message) {
  const sessionId = origin.id;
  const socket = relayMap.get(sessionId);

  if (!socket || socket.clients.size < 2) {
    return;
  }

  const hexMessage =
    typeof message !== "string" ? message.toString("hex") : message;

  socket.clients.forEach((client) => {
    if (client === origin || client.readyState !== WebSocket.OPEN) return;

    if (client.textOnly) {
      log(`TO ${client.id} ${hexMessage}`);
      client.send(hexMessage);
      return;
    }

    log(`TO ${client.id} #${message.length}`);
    client.send(message);
  });
}

function handleNewClient(socket) {
  socket.on("message", function (message) {
    if (message === "text") {
      socket.textOnly = true;
      return;
    }

    broadcast(socket, message);
  });
}

function cleanup() {
  relayMap.forEach((relay, key) => {
    if (!relay.clients.size) {
      log(`Deleting stale session ${relay.id}`);
      relay.close();
      relayMap.delete(key);
    }
  });
}

socketServer.listen(port);
setInterval(cleanup, 5000);
console.log(`[${new Date().toISOString()}] relay running at ${port}`);
