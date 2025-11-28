import { checkAndPromptForName } from "./menuUI";
import { session } from "./session";

export function checkURLForRoom(): void {
   // Extract room code from path like /games/ABCD
   const pathParts = window.location.pathname.split("/");
   const roomCode = pathParts[2]; // Assuming /games/ROOMCODE structure

   if (roomCode && roomCode.length === 4) {
      const input = document.getElementById(
         "room-code-input"
      ) as HTMLInputElement;
      if (input) {
         input.value = roomCode;
      }

      // Check for name and prompt if needed, then join room
      if (
         checkAndPromptForName(() => {
            // Remove URL extension
            window.history.replaceState({}, "", "/");
            session.socket.emit("join-room", roomCode);
         })
      ) {
         // If name is already set, join immediately
         window.history.replaceState({}, "", "/");
         session.socket.emit("join-room", roomCode);
      }
   }
}

export function updateURL(roomCode: string): void {
   const newPath = `/games/${roomCode}`;
   window.history.replaceState({}, "", newPath);
}
