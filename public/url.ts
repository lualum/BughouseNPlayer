import { checkAndPromptForName } from "./menuUI";
import { sn } from "./session";

export function checkURLForRoom(): void {
   // Extract room code from path like /games/ABCD
   const pathParts = window.location.pathname.split("/");
   const roomCode = pathParts[2]; // Assuming /games/ROOMCODE structure

   if (roomCode && roomCode.length === 4) {
      if (
         checkAndPromptForName(() => {
            // Remove URL extension
            window.history.replaceState({}, "", "/");
            sn.socket.emit("join-room", roomCode);
         })
      ) {
         // If name is already set, join immediately
         window.history.replaceState({}, "", "/");
         sn.socket.emit("join-room", roomCode);
      }
   }
}

export function updateURL(roomCode: string): void {
   const newPath = `/games/${roomCode}`;
   window.history.replaceState({}, "", newPath);
}
