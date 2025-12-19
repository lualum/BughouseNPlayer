import { ChatMessage } from "../shared/chat";
import { Color } from "../shared/chess";
import { PlayerStatus } from "../shared/player";
import {
   createMatchElements,
   setVisualFlipped,
   toggleVisualFlipped,
   updateUIAllGame,
} from "./match-ui";
import { leaveRoom } from "./menu-ui";
import { gs } from "./session";

let pingIntervalID: NodeJS.Timeout;
let pingStartTime: number = 0;

export function initGameControls(): void {
   const leaveGameButton = document.querySelector("#leave-game-btn");
   leaveGameButton?.addEventListener("click", () => {
      leaveRoom();
   });

   const chatInput = document.querySelector("#chat-input");
   chatInput?.addEventListener("keypress", (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Enter") sendChatMessage();
   });

   // Prevent chat input from triggering keyboard shortcuts
   chatInput?.addEventListener("keydown", (event: Event) => {
      event.stopPropagation();
   });

   document.addEventListener("keydown", (event: Event) => {
      const keyEvent = event as KeyboardEvent;

      // Check if user is typing in an input or textarea
      const target = keyEvent.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
         return;
      }

      if (keyEvent.key === "x") {
         toggleVisualFlipped();
         updateUIAllGame();
      }

      // Navigate boards with arrow keys or A/D
      if (
         keyEvent.key === "ArrowLeft" ||
         keyEvent.key === "a" ||
         keyEvent.key === "A"
      ) {
         keyEvent.preventDefault(); // Override default HTML behavior
         navigateBoards(-1);
      } else if (
         keyEvent.key === "ArrowRight" ||
         keyEvent.key === "d" ||
         keyEvent.key === "D"
      ) {
         keyEvent.preventDefault(); // Override default HTML behavior
         navigateBoards(1);
      }
   });
}

// MARK: Ping Indicator

function initPingIndicator(): void {
   gs.socket.on("pong", () => {
      const pingTime = Date.now() - pingStartTime;
      updatePingDisplay(pingTime);
   });

   startPingUpdates();
}

function updatePingDisplay(ping: number): void {
   // Determine bars and color based on ping ranges
   const ranges = [
      { max: 50, bars: 5, color: "#5DA061" }, // Green
      { max: 100, bars: 4, color: "#7DB86D" }, // Light green
      { max: 150, bars: 3, color: "#D4AF37" }, // Yellow
      { max: 250, bars: 2, color: "#E67E22" }, // Orange
      { max: Infinity, bars: 1, color: "#E74C3C" }, // Red
   ];

   const { bars: activeBars, color } = ranges.find((r) => ping < r.max)!;

   // Update bar colors
   for (const [index, bar] of document
      .querySelectorAll(".ping-bar")
      .entries()) {
      const barElement = bar as HTMLElement;
      if (index < activeBars) {
         barElement.style.backgroundColor = color;
         barElement.style.opacity = "1";
      } else {
         barElement.style.backgroundColor = "#333";
         barElement.style.opacity = "0.3";
      }
   }
}

function sendPing(): void {
   pingStartTime = Date.now();
   gs.socket.emit("ping");
}

export function startPingUpdates(): void {
   stopPingUpdates();
   sendPing();
   pingIntervalID = globalThis.setInterval(() => {
      sendPing();
   }, 5000);
}

export function stopPingUpdates(): void {
   if (!pingIntervalID) return;
   clearInterval(pingIntervalID);
}

// MARK: Sidebar UI

export function showRoomElements(): void {
   const gameScreen = document.querySelector("#game");
   for (const screen of document.querySelectorAll(".screen")) {
      screen.classList.add("hidden");
   }
   gameScreen?.classList.remove("hidden");

   const gameRoomCode = document.querySelector(
      "#game-room-code"
   ) as HTMLElement;
   gameRoomCode.textContent = gs.room.code || "";

   const boardsArea = document.querySelector("#game-area");
   if (boardsArea) {
      for (const container of boardsArea.querySelectorAll(".game-container")) {
         container.remove();
      }
   }

   if (gs.room.game.matches) {
      for (let index = 0; index < gs.room.game.matches.length; index++) {
         createMatchElements(index);
      }

      const totalBoardsSpan = document.querySelector("#totalBoards");
      if (totalBoardsSpan) {
         totalBoardsSpan.textContent = gs.room.game.matches.length.toString();
      }

      initScrollControls();
      initPingIndicator();
   }
}

export function updateReadyButton(): void {
   const readyButton = document.querySelector("#ready-btn");
   if (!readyButton) return;

   if (gs.player && gs.player.status) {
      readyButton.textContent = "Not Ready";
      readyButton.classList.add("ready");
   } else {
      readyButton.textContent = "Ready";
      readyButton.classList.remove("ready");
   }
}

export function updateUIPlayerList(): void {
   const playerList = document.querySelector("#player-list");
   if (playerList) {
      playerList.innerHTML = "";
      for (const [id, player] of gs.room.players) {
         const playerDiv = document.createElement("div");
         playerDiv.className = "player-item";

         let statusIcon = "";
         let statusClass = "";

         switch (player.status) {
            case PlayerStatus.READY: {
               statusIcon = "✓";
               statusClass = "status-ready";
               break;
            }
            case PlayerStatus.NOT_READY: {
               statusIcon = "";
               statusClass = "status-not-ready";
               break;
            }
            case PlayerStatus.DISCONNECTED: {
               statusIcon = "⚠";
               statusClass = "status-disconnected";
               break;
            }
         }

         const isCurrentPlayer = id === gs.player.id;

         playerDiv.innerHTML = `
            <span class="status-checkbox ${statusClass}">${statusIcon}</span>
            <div class="player-name" style="${
               isCurrentPlayer ? "font-weight: bold;" : ""
            }">${player.name}</div>
         `;

         playerList.append(playerDiv);
      }
   }
}

// MARK: Chat UI

export function updateUIAllChat(): void {
   const chatMessagesDiv = document.querySelector("#chat-messages");
   if (!chatMessagesDiv) return;

   chatMessagesDiv.innerHTML = "";
   for (const message of gs.room.chat.messages) {
      updateUIPushChat(message);
   }
}

export function updateUIPushChat(message: ChatMessage): void {
   const chatMessagesDiv = document.querySelector("#chat-messages");
   if (!chatMessagesDiv) return;

   const messageDiv = document.createElement("div");
   messageDiv.className = `chat-message ${
      message.id === gs.player.id ? "own" : ""
   }`;

   const getSenderName = () => {
      if (message.id === gs.player.id) return "You";
      if (message.id === "server") return "Server";
      return gs.room.players?.get(message.id)?.name ?? "Unknown";
   };

   const senderName = getSenderName();

   messageDiv.innerHTML = `
      <div class="chat-sender">${senderName}</div>
      <div class="chat-text">${escapeHtml(message.message)}</div>
    `;
   chatMessagesDiv.append(messageDiv);
   chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

export function sendChatMessage(): void {
   const chatInput = document.querySelector("#chat-input") as HTMLInputElement;

   const message = chatInput.value.trim();
   if (message.length > 0) {
      gs.socket.emit("send-chat", message);
      chatInput.value = "";
   }
}

// MARK: Scrolling UI

function getBoardAreaDimensions(): { board: number; gap: number } {
   const boardArea = document.querySelectorAll(
      ".match-container"
   )[0] as HTMLElement;
   return {
      board: boardArea.clientWidth,
      gap: Number.parseFloat(getComputedStyle(boardArea).gap) || 0,
   };
}

function getTotalBoards(): number {
   return gs.room.game.matches.length || 1;
}

function scrollBoards(
   gameArea: HTMLDivElement,
   direction: number,
   updateScrollButtons: () => void
): void {
   const { board, gap } = getBoardAreaDimensions();
   gameArea.scrollBy({
      left: direction * (board + gap),
      behavior: "smooth",
   });
   setTimeout(updateScrollButtons, 300);
}

function updateScrollButtons(
   gameArea: HTMLDivElement,
   leftButton: HTMLButtonElement,
   rightButton: HTMLButtonElement
): void {
   const scrollLeft = gameArea.scrollLeft;
   const maxScroll = gameArea.scrollWidth - gameArea.clientWidth;
   leftButton.disabled = scrollLeft <= 1;
   rightButton.disabled = scrollLeft >= maxScroll - 1;

   const totalBoards = getTotalBoards();
   const { board, gap } = getBoardAreaDimensions();
   const leftBoard = Math.ceil((scrollLeft - gap) / (board + gap)) + 1;
   const rightBoard =
      totalBoards - Math.ceil((maxScroll - scrollLeft - gap) / (board + gap));

   const currentBoardSpan = document.querySelector("#boardRange");
   const totalBoardsSpan = document.querySelector("#totalBoards");

   if (currentBoardSpan) {
      if (leftBoard > rightBoard) currentBoardSpan.textContent = "_";
      else if (leftBoard === rightBoard) {
         currentBoardSpan.textContent = `${leftBoard}`;
      } else currentBoardSpan.textContent = `${leftBoard}-${rightBoard}`;
   }

   if (totalBoardsSpan) totalBoardsSpan.textContent = totalBoards.toString();
}

// Navigate boards with keyboard
function navigateBoards(direction: number): void {
   const gameArea = document.querySelector("#game-area") as HTMLDivElement;
   const leftButton = document.querySelector(
      "#scrollLeft"
   ) as HTMLButtonElement;
   const rightButton = document.querySelector(
      "#scrollRight"
   ) as HTMLButtonElement;

   if (!gameArea) return;

   const updateScrollButtonsBound = () =>
      updateScrollButtons(gameArea, leftButton, rightButton);

   scrollBoards(gameArea, direction, updateScrollButtonsBound);
}

export function initScrollControls(): void {
   const gameArea = document.querySelector("#game-area") as HTMLDivElement;
   const leftButton = document.querySelector(
      "#scrollLeft"
   ) as HTMLButtonElement;
   const rightButton = document.querySelector(
      "#scrollRight"
   ) as HTMLButtonElement;

   const updateScrollButtonsBound = () =>
      updateScrollButtons(gameArea, leftButton, rightButton);

   leftButton.addEventListener("click", () =>
      scrollBoards(gameArea, -1, updateScrollButtonsBound)
   );
   rightButton.addEventListener("click", () =>
      scrollBoards(gameArea, 1, updateScrollButtonsBound)
   );
   gameArea.addEventListener("scroll", updateScrollButtonsBound);

   updateScrollButtonsBound();
}

// MARK: Start/End Game UI

export function startGameUI(): void {
   const readyButton = document.querySelector(
      "#ready-btn"
   ) as HTMLButtonElement;
   if (readyButton) readyButton.style.display = "none";

   // Put current player on bottom
   let topBottomDelta = 0; // # of this player on top - # on bottom
   for (const match of gs.room.game.matches) {
      const playerIsTop =
         match.getPlayer(match.flipped ? Color.WHITE : Color.BLACK)?.id ===
         gs.player.id;
      const playerIsBottom =
         match.getPlayer(match.flipped ? Color.BLACK : Color.WHITE)?.id ===
         gs.player.id;

      topBottomDelta += (playerIsTop ? 1 : 0) - (playerIsBottom ? 1 : 0);
   }

   // If more boards have this player on top than bottom, flip all boards
   setVisualFlipped(topBottomDelta > 0);
   updateUIAllGame();
   initScrollControls();
}

export function endGameUI(): void {
   const readyButton = document.querySelector(
      "#ready-btn"
   ) as HTMLButtonElement;
   if (readyButton) readyButton.style.display = "block";

   updateUIAllGame();
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
   return text.replaceAll(/[&<>"']/g, (m: string | number) => map[m]);
}
