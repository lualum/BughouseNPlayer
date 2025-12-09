import { Color } from "../shared/chess";
import { Match, RoomStatus } from "../shared/room";
import { session } from "./session";
import {
   createBoardElement,
   createPocketElement,
   updateUIBoard,
} from "./boardUI";

export let visualFlipped: boolean = false;
let intervalID: number;

// Visual Flip Control
export function setVisualFlipped(flipped: boolean): void {
   visualFlipped = flipped;
}

export function toggleVisualFlipped(): void {
   visualFlipped = !visualFlipped;
}

function getMatchInstance(boardID: number): Match {
   return session.room?.game.matches[boardID]!;
}

export function getBoardFlipState(boardID: number): boolean {
   const match = session.room?.game.matches[boardID];
   const matchFlipped = match?.flipped || false;
   // XOR: if both are flipped or both are not flipped, result is false (not flipped)
   // if one is flipped and the other is not, result is true (flipped)
   return matchFlipped !== visualFlipped;
}

function formatTime(time: number): string {
   const milliseconds = Math.max(time, 0);
   const totalSeconds = Math.floor(milliseconds / 1000);
   const minutes = Math.floor(totalSeconds / 60);
   const seconds = totalSeconds % 60;
   return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function createPocketRowElements(
   boardID: number,
   position: "top" | "bottom"
): HTMLDivElement {
   const row = document.createElement("div");
   row.className = "pocket-row";

   const info = document.createElement("div");
   info.className = "player-info";
   info.id = `${position}-info-${boardID}`;

   const name = document.createElement("div");
   name.className = "player-name-display";

   const time = document.createElement("div");
   time.className = "player-time-display";

   info.appendChild(name);
   info.appendChild(time);

   const playerSlot = document.createElement("div");
   playerSlot.className = "player-slot";
   playerSlot.id = `${position}-player-slot-${boardID}`;

   const pocket = createPocketElement(boardID, position);

   row.appendChild(playerSlot);
   row.appendChild(info);
   row.appendChild(pocket);

   return row;
}

// Match Element Creation
export function createMatchElements(boardID: number): void {
   const boardsArea = document.getElementById("game-area");
   if (!boardsArea) return;

   const boardContainer = document.createElement("div");
   boardContainer.className = "match-container";
   boardContainer.dataset.boardId = boardID.toString();

   const topRow = createPocketRowElements(boardID, "top");
   boardContainer.appendChild(topRow);

   const board = createBoardElement(boardID);
   boardContainer.appendChild(board);

   const bottomRow = createPocketRowElements(boardID, "bottom");
   boardContainer.appendChild(bottomRow);

   boardsArea.appendChild(boardContainer);
}

export function deleteBoard(boardID: number): void {
   const boardContainer = document.querySelector(
      `.match-container[data-board-id="${boardID}"]`
   );
   if (boardContainer && boardContainer.parentNode) {
      boardContainer.parentNode.removeChild(boardContainer);
   }
}

// UI Update Functions - Players
export function updateUIAllPlayers(): void {
   for (let i = 0; i < session.room!.game.matches.length; i++) {
      updateUIPlayers(i);
   }
}

export function updateUIPlayers(boardID: number): void {
   const matchInstance = getMatchInstance(boardID);
   if (!matchInstance) return;

   const isFlipped = getBoardFlipState(boardID);
   const { topPlayer, bottomPlayer, topColor, bottomColor } =
      getPlayerPositions(matchInstance, isFlipped);

   updatePlayerSlot(boardID, "top", topPlayer, topColor);
   updatePlayerSlot(boardID, "bottom", bottomPlayer, bottomColor);
}

function getPlayerPositions(matchInstance: any, isFlipped: boolean) {
   return {
      topPlayer: isFlipped
         ? matchInstance.whitePlayer
         : matchInstance.blackPlayer,
      bottomPlayer: isFlipped
         ? matchInstance.blackPlayer
         : matchInstance.whitePlayer,
      topColor: isFlipped ? Color.WHITE : Color.BLACK,
      bottomColor: isFlipped ? Color.BLACK : Color.WHITE,
   };
}

function updatePlayerSlot(
   boardID: number,
   position: "top" | "bottom",
   player: any,
   color: Color
): void {
   const playerSlot = document.querySelector(
      `#${position}-player-slot-${boardID}`
   ) as HTMLElement;
   const playerInfo = document.querySelector(
      `#${position}-info-${boardID}`
   ) as HTMLElement;

   if (playerSlot) {
      playerSlot.innerHTML = "";
      const slotContent = player
         ? createPlayerIcon(boardID, player, color, position)
         : createEmptySlot(boardID, color);
      playerSlot.appendChild(slotContent);
   }

   if (playerInfo) {
      updatePlayerName(playerInfo, player);
   }
}

function createEmptySlot(boardID: number, color: Color): HTMLElement {
   if (session.room!.status === RoomStatus.LOBBY) {
      const slot = document.createElement("button");
      slot.className = "join-board-btn";
      slot.textContent = "[+]";
      slot.addEventListener("click", () => {
         session.socket.emit("join-board", boardID, color);
      });
      return slot;
   } else {
      const slot = document.createElement("img");
      slot.className = "player-icon";
      slot.src = "/img/default-icon.png";
      return slot;
   }
}

function createPlayerIcon(
   boardID: number,
   player: any,
   color: Color,
   position: "top" | "bottom"
): HTMLElement {
   const iconContainer = document.createElement("div");
   iconContainer.style.position = "relative";
   iconContainer.style.display = "inline-block";

   const slot = document.createElement("img");
   slot.className = "player-icon";
   slot.src = "/img/default-icon.png";
   iconContainer.appendChild(slot);

   const shouldShowLeaveBtn =
      session.room!.status === RoomStatus.LOBBY &&
      player.id === session.player!.id;

   if (shouldShowLeaveBtn) {
      const leaveBtn = createLeaveButton(boardID, color);
      iconContainer.appendChild(leaveBtn);
   } else {
      slot.style.opacity = RoomStatus.PLAYING ? "1" : "0.4";
   }

   return iconContainer;
}

function createLeaveButton(boardID: number, color: Color): HTMLButtonElement {
   const leaveBtn = document.createElement("button");
   leaveBtn.className = "leave-board-btn";
   leaveBtn.textContent = "×";
   leaveBtn.addEventListener("click", () => {
      session.socket.emit("leave-board", boardID, color);
   });
   return leaveBtn;
}

function updatePlayerName(playerInfo: HTMLElement, player: any): void {
   const name = playerInfo.querySelector(".player-name-display");
   if (name) {
      name.textContent = player ? player.name : "";
      (name as HTMLElement).style.color =
         player && player.id === session.player!.id
            ? "#FFFFFF"
            : "var(--hidden-text)";
   }
}

// UI Update Functions - Time
export function updateUITime(): void {
   for (let i = 0; i < session.room!.game.matches.length; i++) {
      const matchInstance = getMatchInstance(i);
      if (!matchInstance) continue;

      const isFlipped = getBoardFlipState(i);

      const whiteTime = formatTime(matchInstance.whiteTime);
      const blackTime = formatTime(matchInstance.blackTime);

      const topTime = isFlipped ? whiteTime : blackTime;
      const bottomTime = isFlipped ? blackTime : whiteTime;

      updateTimeDisplay(i, "top", topTime);
      updateTimeDisplay(i, "bottom", bottomTime);
   }
}

function updateTimeDisplay(
   boardID: number,
   position: "top" | "bottom",
   timeString: string
): void {
   const playerInfo = document.querySelector(
      `#${position}-info-${boardID}`
   ) as HTMLElement;

   if (playerInfo) {
      const timeDisplay = playerInfo.querySelector(".player-time-display");
      if (timeDisplay) {
         timeDisplay.textContent = timeString;

         const color =
            (position === "top") === getBoardFlipState(boardID)
               ? Color.BLACK
               : Color.WHITE;
         if (
            session.room!.status === RoomStatus.PLAYING &&
            color === getMatchInstance(boardID)?.activeColor
         ) {
            (timeDisplay as HTMLElement).style.color = "var(--hidden-text)";
         } else {
            (timeDisplay as HTMLElement).style.color = "#FFFFFF";
         }
      }
   }
}

export function updateTimeLeft(currentTime: number = Date.now()): void {
   for (let i = 0; i < session.room!.game.matches.length; i++) {
      const matchInstance = getMatchInstance(i);
      if (!matchInstance) continue;

      matchInstance.updateTime(currentTime);
   }
}

export function startTimeUpdates(): void {
   stopTimeUpdates();

   intervalID = window.setInterval(() => {
      updateTimeLeft();
      updateUITime();
   }, 100); // Update every 100ms for smooth display
}

export function stopTimeUpdates(): void {
   clearInterval(intervalID);
}

// Global Update Functions
export function updateUIAllBoards(): void {
   for (let i = 0; i < session.room!.game.matches.length; i++) {
      updateUIBoard(i);
   }
}

export function updateUIAllGame(): void {
   updateUIAllBoards();
   updateUIAllPlayers();
   updateUITime();
}
