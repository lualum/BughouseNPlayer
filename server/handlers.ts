import { GameSocket } from "./server";
import { Room, RoomStatus, Team } from "../shared/room";
import { rooms, emitRoomList, MENU_ROOM } from "./server";
import { Server } from "socket.io";
import { PlayerStatus } from "../shared/player";
import { Color, Move } from "../shared/chess";

export function setupHandlers(socket: GameSocket, io: Server): void {
   // Menu handlers
   socket.on("set-name", (name: string) => {
      socket.player!.name = name.trim().substring(0, 20);
   });

   socket.on("create-room", () => {
      const code = createRoom();
      if (!code) {
         socket.emit("error", "Room limit reached");
         return;
      }
      joinRoom(socket, io, code);
      emitRoomList();
   });

   socket.on("join-room", (code: string) => {
      joinRoom(socket, io, code.toUpperCase());
      emitRoomList();
   });

   socket.on("leave-room", () => {
      tryLeavePlayer(socket);
      socket.leave(socket.room!.code);
      socket.join(MENU_ROOM);
   });

   socket.on("disconnect", () => {
      tryLeavePlayer(socket);
   });

   // Lobby handlers
   socket.on("toggle-ready", () => {
      if (!socket.room || socket.room.status === RoomStatus.PLAYING) return;

      socket.player!.status =
         socket.player!.status === PlayerStatus.READY
            ? PlayerStatus.NOT_READY
            : PlayerStatus.READY;

      io.to(socket.room.code).emit(
         "p-set-status",
         socket.player.id,
         socket.player!.status
      );

      const currentTime = Date.now();
      if (socket.room.tryStartRoom()) {
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
         socket.room.game.matches[boardID].getPlayer(color)?.id !==
            socket.player!.id
      ) {
         return;
      }

      const currentTime = Date.now();
      socket.room?.game.matches[boardID].switchTurn(currentTime);
      socket.room.game.tryApplyMove(boardID, move);

      io.to(socket.room.code).emit("p-moved-board", boardID, move, currentTime);

      if (socket.room.game.matches[boardID].chess.isCheckmate()) {
         socket.room.endRoom();
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

function createRoom(roomCode?: string): string | null {
   if (rooms.size >= 10000) {
      return null;
   }

   const code = roomCode || randomCode();
   const room = new Room(code);

   rooms.set(code, room);
   console.log(`Room created with code: ${code}`);

   return code;
}

function joinRoom(socket: GameSocket, io: Server, code: string): void {
   const room = rooms.get(code);

   if (!room) {
      socket.emit("error", "Room not found");
      return;
   }

   // Leave the menu room when joining a game room
   socket.leave(MENU_ROOM);

   socket.join(code);
   socket.room = room;

   const playerInRoom = room.players.get(socket.player!.id);
   if (playerInRoom) {
      playerInRoom.status = PlayerStatus.NOT_READY;
      socket.to(socket.room.code).emit("p-set-status", PlayerStatus.NOT_READY);
   } else {
      socket.player!.status = PlayerStatus.NOT_READY;
      room.addPlayer(socket.player!);
   }

   if (room.status === RoomStatus.PLAYING) {
      for (const match of room.game.matches) {
         match.updateTime(Date.now());
      }
   }

   socket.emit("joined-room", room.serialize());
   io.to(socket.room.code).emit(
      "p-joined-room",
      socket.player?.id,
      socket.player?.name
   );

   console.log(`${socket.player!.name || "[unnamed]"} joined room ${code}`);
}

export function tryLeavePlayer(socket: GameSocket): void {
   if (!socket.room) return;

   socket.leave(socket.room!.code);

   socket.room.players.get(socket.player!.id)!.status =
      PlayerStatus.DISCONNECTED;
   if (socket.room.allPlayersDisconnected()) {
      rooms.delete(socket.room.code);
      emitRoomList();
      return;
   }

   if (socket.room.status === RoomStatus.LOBBY) {
      socket.room.removePlayer(socket.player!.id);
      socket.to(socket.room.code).emit("p-left-room", socket.player!.id);
      emitRoomList();
   } else {
      socket.room.players.get(socket.player!.id)!.status =
         PlayerStatus.DISCONNECTED;
      socket
         .to(socket.room.code)
         .emit("p-set-status", socket.player!.id, PlayerStatus.DISCONNECTED);
   }
}

function randomCode(): string {
   const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
   let result = "";
   do {
      result = "";
      for (let i = 0; i < 4; i++) {
         result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
   } while (rooms.has(result)); // Ensure unique code
   return result;
}
