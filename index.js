import http from "http";
import { randomUUID } from "crypto";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT);
const relayMap = new Map();
const socketServer = http.createServer();
const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

socketServer.on("request", (request, response) => {
  const pathname = new URL(String(request.url), "http://localhost").pathname;
  const { method } = request;

  switch (true) {
    case method === "GET" && pathname === "/new":
      response.writeHead(200).end(randomUUID());
      break;

    case method === "GET" && pathname === "/status":
      const list = [...relayMap.values()].map((socket) => ({
        id: socket.id,
        clients: socket.clients.size,
      }));
      response.writeHead(200).end(JSON.stringify(list, null, 2));
      break;

    case method === "POST" && pathname === "/publish":
      onPublish(request, response);
      break;

    default:
      response.writeHead(404).end();
  }
});

socketServer.on("upgrade", function (request, socket, head) {
  const url = new URL(String(request.url), "http://localhost");
  const { pathname } = url;
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
    webSocket.sessionId = sessionId;
    webSocket.uid = ~~(Math.random() * 999999);
    webSocket.textOnly = url.searchParams.has('text');
    webSocket.on("message", function (message, isBinary) {
      broadcast({ from: webSocket.uid, to: sessionId, message, isBinary });
    });
  });
});

async function onPublish(request, response) {
  try {
    const body = Buffer.concat(await request.toArray()).toString('utf8');
    const message = JSON.parse(body);
    const { sessionId, data } = message;
    broadcast({ from: '', to: sessionId, isBinary: false, message: data });    
    response.writeHead(202).end();
  } catch (e) {
    console.log('onPublish error', e);
    response.writeHead(400).end(String(e));
  }
}

function broadcast(payload) {
  const { from, to, isBinary, message } = payload;
  const socket = relayMap.get(to);

  if (!socket || socket.clients.size < 2) {
    return;
  }

  const hexMessage = typeof message !== "string" ? message.toString("hex") : message;

  socket.clients.forEach((client) => {
    if (client.uid === from || client.readyState !== WebSocket.OPEN) return;

    if (client.textOnly) {
      log(`TO ${to} #${client.uid} ${hexMessage}`);
      client.send(hexMessage, { binary: false });
      return;
    }

    log(`TO ${to} #${client.uid} ${message.length} bytes`);
    client.send(message, { binary: isBinary });
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
