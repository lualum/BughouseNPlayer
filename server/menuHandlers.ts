import { GameSocket } from "./server";
import { Room, RoomStatus } from "../shared/room";
import { rooms, emitRoomList } from "./server";
import { Server } from "socket.io";
import { PlayerStatus } from "../shared/player";

export function setupMenuHandlers(socket: GameSocket, io: Server): void {
   socket.on("set-name", (name: string) => {
      socket.player!.name = name.trim().substring(0, 20);
   });

   socket.on("list-rooms", () => {
      emitRoomList();
   });

   socket.on("create-room", () => {
      const code = createRoom();
      if (code === null) {
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
      if (socket.room && socket.room.code) {
         socket.leave(socket.room!.code);
      }

      socket.room = null;
   });

   socket.on("disconnect", () => {
      tryLeavePlayer(socket);
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

   console.log("User disconnected:", socket.player!.name || "[unnamed]");

   socket.player!.status = PlayerStatus.DISCONNECTED;

   if (socket.room.allPlayersDisconnected()) {
      rooms.delete(socket.room.code);
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
