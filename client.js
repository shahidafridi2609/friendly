// ================= WebSocket =================
const ws = new WebSocket("ws://localhost:3000");

let username = localStorage.getItem("myUsername") || null;
let currentChat = null;

// ================= UI Elements =================
const statusEl = document.getElementById("myStatus");
const usernameInput = document.getElementById("usernameInput");
const saveProfileBtn = document.getElementById("saveProfileBtn");

const profileAvatar = document.getElementById("profileAvatar");
const myAvatar = document.getElementById("myAvatar");
const uploadProfileAvatar = document.getElementById("uploadProfileAvatar");
const changeProfileAvatar = document.getElementById("changeProfileAvatar");

const chatName = document.getElementById("chatName");
const chatAvatar = document.getElementById("chatAvatar");

const friendListEl = document.getElementById("friendList");
const searchUser = document.getElementById("searchUser");

const sendForm = document.getElementById("sendForm");
const messageInput = document.getElementById("messageInput");
const messages = document.getElementById("messages");

// ================= Sounds =================
const sendSound = new Audio("send.mp3");    // Place send.mp3
const receiveSound = new Audio("receive.mp3"); // Place receive.mp3

// ================= Profile Handling =================
changeProfileAvatar.addEventListener("click", () => uploadProfileAvatar.click());

uploadProfileAvatar.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    profileAvatar.src = e.target.result;
    myAvatar.src = e.target.result;
    localStorage.setItem("myAvatar", e.target.result);

    // Send avatar update to server
    if (username) {
      ws.send(JSON.stringify({ type: "avatar_update", avatar: e.target.result }));
    }
  };
  reader.readAsDataURL(file);
});

// Load saved avatar
const savedAvatar = localStorage.getItem("myAvatar");
if (savedAvatar) {
  profileAvatar.src = savedAvatar;
  myAvatar.src = savedAvatar;
}

// Save profile
saveProfileBtn.addEventListener("click", () => {
  const name = usernameInput.value.trim();
  const status = document.getElementById("statusSelect").value;

  if (!name) return alert("Username cannot be empty");

  localStorage.setItem("myUsername", name);
  localStorage.setItem("myStatus", status);

  myAvatar.title = name;
  statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);

  username = name;

  // Send to server
  ws.send(JSON.stringify({ type: "set_username", username }));
  alert("Profile updated!");
});

// ================= WebSocket Events =================
ws.onopen = () => {
  if (username) {
    ws.send(JSON.stringify({ type: "set_username", username }));
  }
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "username_set":
      username = data.username;
      localStorage.setItem("myUsername", username);
      myAvatar.title = username;
      break;

    case "friend_request":
      addFriendRequest(data.from);
      break;

    case "friend_request_accepted":
      addFriend(data.friend, data.avatar || "avatar.png");
      break;

    case "chat_message":
      if (data.from === currentChat) {
        addMessage(data.from, data.message, false);
      }
      break;

    case "typing":
      if (data.from === currentChat) showTypingIndicator();
      break;

    case "stop_typing":
      removeTypingIndicator();
      break;

    case "friend_avatar_update":
      updateFriendAvatar(data.friend, data.avatar);
      break;
  }
};

// ================= Friends =================
function addFriend(friendName, avatar = "avatar.png") {
  if ([...friendListEl.children].some(li => li.dataset.name === friendName)) return;

  const li = document.createElement("li");
  li.dataset.name = friendName;
  li.dataset.avatar = avatar;
  li.innerHTML = `<img class="friend-avatar" src="${avatar}" alt="${friendName}"><span>${friendName}</span>`;
  li.addEventListener("click", () => openChat(friendName, avatar));
  friendListEl.appendChild(li);
}

// Update friend avatar
function updateFriendAvatar(friendName, avatar) {
  const li = [...friendListEl.children].find(li => li.dataset.name === friendName);
  if (!li) return;
  li.dataset.avatar = avatar;
  li.querySelector("img").src = avatar;
}

// ================= Chat =================
function openChat(friendName, avatar) {
  currentChat = friendName;
  chatName.textContent = friendName;
  chatAvatar.src = avatar || "avatar.png";
  messages.innerHTML = "";
}

// Send message
sendForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentChat) return;
  const text = messageInput.value.trim();
  if (!text) return;

  // Add message locally
  addMessage(username, text, true);

  ws.send(JSON.stringify({ type: "chat_message", to: currentChat, message: text }));
  ws.send(JSON.stringify({ type: "stop_typing", to: currentChat }));

  messageInput.value = "";
});

// Add message to DOM
function addMessage(sender, text, isMe) {
  const div = document.createElement("div");
  div.className = "message" + (isMe ? " me" : "");
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  if (isMe) sendSound.play();
  else receiveSound.play();
}

// ================= Typing Indicator =================
let typingEl = null;
messageInput.addEventListener("input", () => {
  if (!currentChat) return;
  if (messageInput.value.length > 0) {
    ws.send(JSON.stringify({ type: "typing", to: currentChat }));
  } else {
    ws.send(JSON.stringify({ type: "stop_typing", to: currentChat }));
  }
});

function showTypingIndicator() {
  if (typingEl) return;
  typingEl = document.createElement("div");
  typingEl.className = "message";
  typingEl.textContent = `${currentChat} is typing...`;
  messages.appendChild(typingEl);
  messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
  if (typingEl) {
    typingEl.remove();
    typingEl = null;
  }
}

// ================= Friend Search =================
searchUser.addEventListener("input", () => {
  const filter = searchUser.value.toLowerCase();
  [...friendListEl.children].forEach(li => {
    li.style.display = li.dataset.name.toLowerCase().includes(filter) ? "flex" : "none";
  });
});

// ================= Friend Requests =================
function addFriendRequest(fromUser) {
  if (!confirm(`${fromUser} sent you a friend request. Accept?`)) return;

  ws.send(JSON.stringify({ type: "friend_request_response", from: fromUser, accept: true }));
  alert(`You are now friends with ${fromUser}`);
}

// ================= Open Profile Sidebar =================
myProfile.addEventListener("click", () => {
  // Populate sidebar inputs with saved data
  const savedUsername = localStorage.getItem("myUsername") || "";
  const savedBio = localStorage.getItem("myBio") || "";
  const savedStatus = localStorage.getItem("myStatus") || "offline";
  const savedAvatar = localStorage.getItem("myAvatar") || "log0.png";

  usernameInput.value = savedUsername;
  bioInput.value = savedBio;
  statusSelect.value = savedStatus;
  profileAvatar.src = savedAvatar;

  profileSidebar.classList.add("open");
  overlay.style.display = "block";
  setTimeout(() => overlay.classList.add("show"), 10);
});

// ================= Profile Sidebar =================
myProfile.addEventListener("click", () => {
  profileSidebar.classList.add("open");
  overlay.style.display = "block";
  setTimeout(() => overlay.classList.add("show"), 10);
});

// Close sidebar function
const closeSidebar = () => {
  profileSidebar.classList.remove("open");
  overlay.classList.remove("show");
  // Wait for animation before hiding overlay
  setTimeout(() => (overlay.style.display = "none"), 300);
};

// Close on clicking the × button
closeProfile.addEventListener("click", closeSidebar);

// Close on clicking outside sidebar (overlay)
overlay.addEventListener("click", closeSidebar);

// ================= Save Profile =================
saveProfileBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim();
  const bio = bioInput.value.trim();
  const status = statusSelect.value;

  if (!username) {
    alert("Username cannot be empty!");
    return;
  }

  // Save to localStorage
  localStorage.setItem("myUsername", username);
  localStorage.setItem("myBio", bio);
  localStorage.setItem("myStatus", status);
  localStorage.setItem("myAvatar", profileAvatar.src);

  // Update bottom profile in sidebar
  myName.textContent = username;
  myStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  myAvatar.src = profileAvatar.src;

  alert("Profile updated!");
  // Sidebar stays open; user can click × or overlay to close
});
