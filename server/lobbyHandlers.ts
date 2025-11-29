import { GameSocket, rooms } from "./server";
import { RoomStatus } from "../shared/room";
import { PlayerStatus } from "../shared/player";
import { Color, Move, Team } from "../shared/state";
import { Server } from "socket.io";

export function setupLobbyHandlers(socket: GameSocket, io: Server): void {
   socket.on("toggle-ready", () => {
      if (!socket.room || socket.room.status === RoomStatus.PLAYING) return;

      socket.player!.status =
         socket.player!.status === PlayerStatus.READY
            ? PlayerStatus.NOT_READY
            : PlayerStatus.READY;

      io.to(socket.room.code).emit(
         "p-set-status",
         socket.player?.id,
         socket.player!.status
      );

      // socket.room.autoAssignPlayers();

      if (
         socket.room.status === RoomStatus.LOBBY &&
         socket.room.allBoardsFull() &&
         socket.room.readyToStart()
      ) {
         const currentTime = Date.now();
         socket.room.status = RoomStatus.PLAYING;

         socket.room!.game.matches.forEach((match) => {
            match.chess.reset();
            match.lastMoveTime = currentTime;
         });

         // TODO: move this to an expanded room class
         const timeoutCheckInterval = setInterval(() => {
            const currentTime = Date.now();
            rooms.forEach((room) => {
               if (room.status === RoomStatus.PLAYING) {
                  room.game.updateTime(currentTime);
                  const timeout = room.game.checkTimeout();
                  if (timeout) {
                     room.status = RoomStatus.LOBBY;
                     clearInterval(timeoutCheckInterval);
                     io.to(room.code).emit(
                        "ended-room",
                        timeout.team,
                        timeout.player + " timed out."
                     );
                  }
               }
            });
         }, 100);

         io.to(socket.room.code).emit(
            "started-room",
            socket.room.game.serialize(),
            currentTime
         );
         console.log(`Game started in room ${socket.room.code}`);
      }
   });

   socket.on("send-chat", (message: string) => {
      if (!socket.room) return;
      socket.room.chat.push(
         socket.player!.id,
         message.trim().substring(0, 200)
      );
      io.to(socket.room.code).emit("p-sent-chat", socket.player!.id, message);
   });

   socket.on("join-board", (boardID: number, color: Color) => {
      if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;
      socket.room.game.matches[boardID].setPlayer(socket.player!, color);
      io.to(socket.room.code).emit(
         "p-joined-board",
         socket.player!.id,
         boardID,
         color
      );
   });

   socket.on("move-board", (boardID: number, color: Color, move: Move) => {
      if (
         !socket.room ||
         socket.room.status !== RoomStatus.PLAYING ||
         !socket.room.game.matches[boardID].samePlayer(socket.player!, color)
      ) {
         return;
      }

      const currentTime = Date.now();
      socket.room?.game.matches[boardID].switchTurn(currentTime);
      socket.room.game.applyMove(boardID, move);

      io.to(socket.room.code).emit("p-moved-board", boardID, move, currentTime);

      if (socket.room.game.matches[boardID].chess.isCheckmate()) {
         socket.room.status = RoomStatus.LOBBY;
         io.to(socket.room.code).emit(
            "ended-room",
            (color === Color.WHITE) ===
               socket.room.game.matches[boardID].flipped
               ? Team.RED
               : Team.BLUE,
            socket.room.game.matches[boardID].getPlayer(color)?.name +
               " got checkmated."
         );
      }
   });

   socket.on("leave-board", (boardID: number, color: Color) => {
      if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;
      socket.room.game.matches[boardID].removePlayer(color);
      io.to(socket.room.code).emit("p-left-board", boardID, color);
   });
}
