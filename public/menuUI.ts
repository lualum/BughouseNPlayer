import { RoomListing } from "../shared/room";
import { stopTimeUpdates } from "./matchUI";
import { session } from "./session";

// Store the pending action
let pendingAction: (() => void) | null = null;

export function initMenuControls(): void {
   // Menu buttons
   const createRoomBtn = document.getElementById("create-room-btn");
   createRoomBtn?.addEventListener("click", () => {
      if (
         checkAndPromptForName(() => {
            session.socket.emit("create-room");
         })
      ) {
         session.socket.emit("create-room");
      }
   });

   const joinRoomBtn = document.getElementById("join-room-btn");
   joinRoomBtn?.addEventListener("click", () => {
      const roomCodeInput = document.getElementById(
         "room-code-input"
      ) as HTMLInputElement;
      const roomCode = roomCodeInput?.value.trim() || "";
      if (roomCode.length === 4) {
         if (
            checkAndPromptForName(() => {
               session.socket.emit("join-room", roomCode);
            })
         ) {
            session.socket.emit("join-room", roomCode);
         }
      } else {
         showError("menu-error", "Room code must be 4 characters");
      }
   });

   const roomCodeInput = document.getElementById("room-code-input");
   roomCodeInput?.addEventListener("keypress", (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === "Enter") {
         joinRoomBtn?.click();
      }
   });

   setupNameInput("player-name-input");

   const readyBtn = document.getElementById("ready-btn");
   readyBtn?.addEventListener("click", () => {
      session.socket.emit("toggle-ready");
   });

   const leaveRoomBtn = document.getElementById("leave-room-btn");
   leaveRoomBtn?.addEventListener("click", () => {
      leaveRoom();
   });

   // Setup name change modal
   setupNameModal();
}

// Export this function so it can be used in other files
export function checkAndPromptForName(action: () => void): boolean {
   const nameInput = document.getElementById(
      "player-name-input"
   ) as HTMLInputElement;
   const currentName = nameInput?.value.trim() || "";

   // Check if name is default or empty (adjust "Player" to match your actual default)
   if (
      !currentName ||
      currentName === "Player" ||
      currentName.startsWith("Player")
   ) {
      pendingAction = action;
      showNameModal();
      return false;
   }
   return true;
}

function setupNameModal(): void {
   const modal = document.getElementById("name-modal");
   const closeBtn = document.getElementById("close-modal");
   const submitBtn = document.getElementById("submit-name-btn");
   const modalInput = document.getElementById(
      "modal-name-input"
   ) as HTMLInputElement;

   closeBtn?.addEventListener("click", () => {
      pendingAction = null;
      hideNameModal();
   });

   modal?.addEventListener("click", (e) => {
      if (e.target === modal) {
         pendingAction = null;
         hideNameModal();
      }
   });

   submitBtn?.addEventListener("click", () => {
      const name = modalInput?.value.trim();
      if (name) {
         const mainInput = document.getElementById(
            "player-name-input"
         ) as HTMLInputElement;
         if (mainInput) {
            mainInput.value = name;
         }
         session.socket.emit("set-name", name);
         hideNameModal();

         // Execute the pending action
         if (pendingAction) {
            pendingAction();
            pendingAction = null;
         }
      }
   });

   modalInput?.addEventListener("keypress", (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === "Enter") {
         submitBtn?.click();
      }
   });
}

function showNameModal(): void {
   const modal = document.getElementById("name-modal");
   const modalInput = document.getElementById(
      "modal-name-input"
   ) as HTMLInputElement;
   if (modal) {
      modal.classList.remove("hidden");
      modalInput?.focus();
   }
}

function hideNameModal(): void {
   const modal = document.getElementById("name-modal");
   const modalInput = document.getElementById(
      "modal-name-input"
   ) as HTMLInputElement;
   const errorElement = document.getElementById("modal-error");
   if (modal) {
      modal.classList.add("hidden");
      if (modalInput) modalInput.value = "";
      if (errorElement) errorElement.textContent = "";
   }
}

function setupNameInput(elementId: string) {
   const input = document.getElementById(elementId);

   const handleNameSubmit = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const name = target.value.trim();
      if (name) {
         session.socket.emit("set-name", name);
      }
   };

   input?.addEventListener("keypress", (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === "Enter") {
         handleNameSubmit(e);
      }
   });

   input?.addEventListener("blur", handleNameSubmit);
}

export function leaveRoom(): void {
   window.history.replaceState({}, "", window.location.pathname);
   session.socket.emit("leave-room");
   showMenuScreen();
}

export function showScreen(screenId: string): void {
   document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.add("hidden");
   });
   const targetScreen = document.getElementById(screenId);
   targetScreen?.classList.remove("hidden");
}

export function showMenuScreen(): void {
   showScreen("menu");
   clearErrors();
   const gameArea = document.getElementById("game-area");
   if (gameArea) gameArea.innerHTML = "";
   session.socket.emit("list-rooms");

   stopTimeUpdates();
}

export function showError(elementId: string, message: string): void {
   const errorElement = document.getElementById(elementId);
   if (errorElement) {
      errorElement.textContent = message;
      setTimeout(() => {
         errorElement.textContent = "";
      }, 5000);
   }
}

export function clearErrors(): void {
   document.querySelectorAll(".error").forEach((error) => {
      error.textContent = "";
   });
}

export function updateLobbiesList(lobbies: RoomListing[]): void {
   const lobbiesContainer = document.getElementById("lobbies-list");
   if (!lobbiesContainer) return;

   if (lobbies.length === 0) {
      lobbiesContainer.innerHTML = `
      <div class="no-lobbies">
        <p>No lobbies available</p>
        <p style="font-size: 12px; margin-top: 5px">Create a new room or wait for others to host!</p>
      </div>`;
      return;
   }

   lobbiesContainer.innerHTML = "";

   lobbies.forEach((lobby) => {
      const lobbyDiv = document.createElement("div");
      lobbyDiv.className = "lobby-item";
      lobbyDiv.innerHTML = `
      <div class="lobby-info">
        <div class="lobby-code">${lobby.code}</div>
        <div class="lobby-players">
          <span style="color: #ea4179; font-weight: 700;">${lobby.numPlayers}</span>
        </div>
      </div>
      <button class="lobby-join-btn">Join</button>
    `;

      lobbyDiv.addEventListener("click", () => {
         const roomCodeInput = document.getElementById(
            "room-code-input"
         ) as HTMLInputElement;
         if (roomCodeInput) {
            roomCodeInput.value = lobby.code;
         }
         if (
            checkAndPromptForName(() => {
               session.socket.emit("join-room", lobby.code);
            })
         ) {
            session.socket.emit("join-room", lobby.code);
         }
      });

      lobbiesContainer.appendChild(lobbyDiv);
   });
}
