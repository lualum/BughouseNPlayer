import { Color } from "../shared/chess";
import { PlayerStatus } from "../shared/player";
import { updateUIAllBoards } from "./matchUI";
import {
   createMatchElements,
   flipAllAndUpdate,
   updateUIAllPlayers,
} from "./matchUI";
import { leaveRoom } from "./menuUI";
import { session } from "./session";

export function initGameControls(): void {
   const leaveGameBtn = document.getElementById("leave-game-btn");
   leaveGameBtn?.addEventListener("click", () => {
      leaveRoom();
   });

   const chatInput = document.getElementById("chat-input");
   chatInput?.addEventListener("keypress", (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === "Enter") {
         sendChatMessage();
      }
   });

   document.addEventListener("keydown", (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === "x") {
         flipAllAndUpdate();
      }
   });
}

export function showRoomElements(): void {
   const gameScreen = document.getElementById("game");
   document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.add("hidden");
   });
   gameScreen?.classList.remove("hidden");

   const gameRoomCode = document.getElementById("game-room-code");
   if (gameRoomCode) {
      gameRoomCode.textContent = session.room?.code || "";
   }

   const boardsArea = document.getElementById("game-area");
   boardsArea?.querySelectorAll(".game-container").forEach((container) => {
      container.remove();
   });

   if (session.room?.game?.matches) {
      for (let i = 0; i < session.room.game.matches.length; i++) {
         createMatchElements(i);
      }
   }
}

export function sendChatMessage(): void {
   const chatInput = document.getElementById("chat-input") as HTMLInputElement;
   if (!chatInput) return;

   const message = chatInput.value.trim();
   if (message.length > 0) {
      session.socket.emit("send-chat", message);
      chatInput.value = "";
   }
}

export function updateReadyButton(): void {
   const readyBtn = document.getElementById("ready-btn");
   if (!readyBtn) return;

   if (session.player && session.player.status) {
      readyBtn.textContent = "Not Ready";
      readyBtn.classList.add("ready");
   } else {
      readyBtn.textContent = "Ready";
      readyBtn.classList.remove("ready");
   }
}

export function updateUIPlayerList(): void {
   const playerList = document.getElementById("player-list");
   if (playerList) {
      playerList.innerHTML = "";
      session.room?.players.forEach((player) => {
         const playerDiv = document.createElement("div");
         playerDiv.className = "player-item";

         let statusIcon = "";
         let statusClass = "";

         switch (player.status) {
            case PlayerStatus.READY:
               statusIcon = "✓";
               statusClass = "status-ready";
               break;
            case PlayerStatus.NOT_READY:
               statusIcon = "";
               statusClass = "status-not-ready";
               break;
            case PlayerStatus.DISCONNECTED:
               statusIcon = "⚠";
               statusClass = "status-disconnected";
               break;
         }

         const isCurrentPlayer = player.id === session.player?.id;

         playerDiv.innerHTML = `
            <span class="status-checkbox ${statusClass}">${statusIcon}</span>
            <div class="player-name" style="${
               isCurrentPlayer ? "font-weight: bold;" : ""
            }">${player.name}</div>
         `;

         playerList.appendChild(playerDiv);
      });
   }
}

export function updateChatDisplay(): void {
   const chatMessagesDiv = document.getElementById("chat-messages");
   if (!chatMessagesDiv) return;

   chatMessagesDiv.innerHTML = "";
   session.room?.chat.messages.forEach((message) => {
      const messageDiv = document.createElement("div");
      messageDiv.className = `chat-message ${
         message.id === session.player!.id ? "own" : ""
      }`;
      const senderName =
         message.id === session.player!.id
            ? "You"
            : session!.room!.players!.get(message!.id)!.name;
      messageDiv.innerHTML = `
      <div class="chat-sender">${senderName}</div>
      <div class="chat-text">${escapeHtml(message.message)}</div>
    `;
      chatMessagesDiv.appendChild(messageDiv);
   });
   chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

export function startGameUI(): void {
   const readyBtn = document.getElementById("ready-btn");
   if (readyBtn) {
      readyBtn.style.display = "none";
   }

   // Put current player on bottom
   let topBottomDelta = 0; // # of this player on top - # on bottom
   for (const match of session.room!.game!.matches) {
      const playerIsTop =
         match.getPlayer(match.flipped ? Color.WHITE : Color.BLACK)?.id ===
         session.player!.id;
      const playerIsBottom =
         match.getPlayer(match.flipped ? Color.BLACK : Color.WHITE)?.id ===
         session.player!.id;

      topBottomDelta += (playerIsTop ? 1 : 0) - (playerIsBottom ? 1 : 0);
   }

   // If more boards have this player on top than bottom, flip all boards
   if (topBottomDelta > 0) {
      flipAllAndUpdate();
   } else {
      updateUIAllBoards();
      updateUIAllPlayers();
      updateUIPlayerList();
   }
}

export function endGameUI(): void {
   const readyBtn = document.getElementById("ready-btn");
   if (readyBtn) {
      readyBtn.style.display = "block";
   }

   updateUIAllBoards();
   updateUIAllPlayers();
   updateUIPlayerList();
}

function escapeHtml(text: string): string {
   const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
   };
   return text.replace(/[&<>"']/g, (m) => map[m]);
}
