const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname)));

// === Data stores ===
const clients = new Map();   // clientId -> { ws, username }
const users = new Map();     // username -> clientId
const friends = new Map();   // username -> Set of friends
const requests = new Map();  // username -> Set of pending requests
const messages = new Map();  // "user1|user2" -> [{from, text, timestamp}]

// Utility
function makeId(len = 6) {
  return crypto.randomBytes(len).toString("hex").slice(0, len);
}

function getConversation(user1, user2) {
  const key = [user1, user2].sort().join("|");
  if (!messages.has(key)) messages.set(key, []);
  return messages.get(key);
}

// Send a message to a single client
function sendToClient(clientId, msg) {
  const entry = clients.get(clientId);
  if (!entry) return;
  if (entry.ws.readyState === WebSocket.OPEN) {
    entry.ws.send(JSON.stringify(msg));
  }
}

// === WebSocket logic ===
wss.on("connection", (ws) => {
  const clientId = makeId();
  clients.set(clientId, { ws, username: null });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const clientEntry = clients.get(clientId);

    // === Set username ===
    if (msg.type === "set_username") {
      const old = clientEntry.username;
      const newName = msg.username.trim();
      if (!newName) return;

      if (users.has(newName) && users.get(newName) !== clientId) {
        return sendToClient(clientId, { type: "error", text: "Username taken" });
      }

      if (old) users.delete(old);
      clientEntry.username = newName;
      users.set(newName, clientId);

      if (!friends.has(newName)) friends.set(newName, new Set());
      if (!requests.has(newName)) requests.set(newName, new Set());

      sendToClient(clientId, { type: "username_set", username: newName });

      // Send friend list
      sendToClient(clientId, { type: "friend_list", friends: Array.from(friends.get(newName)) });
    }

    // === Friend request ===
    if (msg.type === "friend_request") {
      const fromUser = clientEntry.username;
      const toUser = msg.to;
      if (!fromUser || !users.has(toUser)) return;

      if (friends.get(fromUser).has(toUser)) {
        return sendToClient(clientId, { type: "error", text: "Already friends" });
      }

      requests.get(toUser).add(fromUser);
      const toId = users.get(toUser);
      if (toId) sendToClient(toId, { type: "friend_request", from: fromUser });
    }

    // === Friend request response ===
    if (msg.type === "friend_request_response") {
      const toUser = clientEntry.username;
      const fromUser = msg.from;
      if (!toUser || !fromUser) return;

      requests.get(toUser).delete(fromUser);

      if (msg.accept) {
        friends.get(toUser).add(fromUser);
        friends.get(fromUser).add(toUser);

        // Notify both
        const fromId = users.get(fromUser);
        const toId = users.get(toUser);
        if (fromId) sendToClient(fromId, { type: "friend_request_accepted", friend: toUser });
        if (toId) sendToClient(toId, { type: "friend_request_accepted", friend: fromUser });
      }
    }

    // === Chat message ===
    if (msg.type === "chat_message") {
      const fromUser = clientEntry.username;
      const toUser = msg.to;
      if (!fromUser || !toUser) return;

      if (!friends.get(fromUser).has(toUser)) {
        return sendToClient(clientId, { type: "error", text: "Not friends" });
      }

      const conv = getConversation(fromUser, toUser);
      conv.push({ from: fromUser, text: msg.message, timestamp: Date.now() });

      const toId = users.get(toUser);
      if (toId) sendToClient(toId, { type: "chat_message", from: fromUser, message: msg.message });
    }

    // === Typing indicator ===
    if (msg.type === "typing" || msg.type === "stop_typing") {
      const fromUser = clientEntry.username;
      const toUser = msg.to;
      const toId = users.get(toUser);
      if (toId) sendToClient(toId, { type: msg.type, from: fromUser });
    }

    // === Fetch conversation ===
    if (msg.type === "get_conversation") {
      const fromUser = clientEntry.username;
      const toUser = msg.with;
      if (!fromUser || !toUser) return;

      const conv = getConversation(fromUser, toUser);
      sendToClient(clientId, { type: "conversation_history", with: toUser, messages: conv });
    }
  });

  ws.on("close", () => {
    const entry = clients.get(clientId);
    if (!entry) return;
    const uname = entry.username;
    if (uname) users.delete(uname);
    clients.delete(clientId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
