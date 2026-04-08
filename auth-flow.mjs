#!/usr/bin/env node
// Caido auth flow: subscribe to createdAuthenticationToken via WebSocket
// Usage: node auth-flow.mjs <requestId>
// Then approve at dashboard.caido.io, token saved to ~/.caido-mcp/caido-mcp-extended-token.json

import { WebSocket } from "ws";
import { writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const REQUEST_ID = process.argv[2];
if (!REQUEST_ID) {
  console.error("Usage: node auth-flow.mjs <requestId>");
  process.exit(1);
}

const TOKEN_PATH = join(homedir(), ".caido-mcp", "caido-mcp-extended-token.json");
const WS_URL = "ws://127.0.0.1:8080/ws/graphql";

console.log(`[auth] Connecting to ${WS_URL}`);
console.log(`[auth] Waiting for approval of request: ${REQUEST_ID}`);

const ws = new WebSocket(WS_URL, ["graphql-transport-ws"]);

ws.on("open", () => {
  console.log("[auth] WebSocket connected, sending connection_init...");
  ws.send(JSON.stringify({ type: "connection_init", payload: {} }));
});

ws.on("message", (data) => {
  let msg;
  try { msg = JSON.parse(data.toString()); } catch { return; }

  if (msg.type === "connection_ack") {
    console.log("[auth] connection_ack received, subscribing to createdAuthenticationToken...");
    ws.send(JSON.stringify({
      id: "1",
      type: "subscribe",
      payload: {
        query: `subscription WaitForToken($requestId: ID!) {
          createdAuthenticationToken(requestId: $requestId) {
            token { accessToken refreshToken expiresAt }
          }
        }`,
        variables: { requestId: REQUEST_ID },
      },
    }));
    console.log("[auth] Subscribed. Approve at https://dashboard.caido.io/#/consent");
  }

  if (msg.type === "next") {
    const token = msg.payload?.data?.createdAuthenticationToken?.token;
    if (token?.accessToken) {
      console.log("[auth] GOT TOKEN!");
      const tokenFile = {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken ?? "",
        expiresAt: token.expiresAt,
      };
      mkdirSync(join(homedir(), ".caido-mcp"), { recursive: true });
      writeFileSync(TOKEN_PATH, JSON.stringify(tokenFile, null, 2));
      console.log(`[auth] Token saved to ${TOKEN_PATH}`);
      console.log(`[auth] Token: ${token.accessToken.slice(0, 20)}...`);
      ws.close();
      process.exit(0);
    }
  }

  if (msg.type === "error") {
    console.error("[auth] Subscription error:", JSON.stringify(msg.payload));
    ws.close();
    process.exit(1);
  }

  if (msg.type === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
  }
});

ws.on("error", (err) => {
  console.error("[auth] WebSocket error:", err.message);
  process.exit(1);
});

ws.on("close", (code, reason) => {
  console.log("[auth] Connection closed:", code, reason.toString());
});

// Timeout after 5 min
setTimeout(() => {
  console.error("[auth] Timeout - token not received in 5 minutes");
  ws.close();
  process.exit(1);
}, 300_000);
