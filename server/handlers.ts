import type { Server } from "socket.io";
import type { Color, Move } from "../shared/chess";
import { PlayerStatus } from "../shared/player";
import { Room, RoomStatus, Team } from "../shared/room";
import type { GameSocket } from "./server";
import { emitRoomList, io, MENU_ROOM, rooms } from "./server";

export function setupHandlers(socket: GameSocket): void {
   socket.on("ping", () => {
      socket.emit("pong");
   });

   socket.on("set-name", (name: string) => {
      socket.player.name = name.trim().slice(0, 20);
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
      handlePlayerLeave(socket);
      socket.join(MENU_ROOM);
   });

   socket.on("disconnect", () => {
      handlePlayerLeave(socket);
   });

   socket.on("toggle-ready", () => {
      if (!socket.room || socket.room.status === RoomStatus.PLAYING) return;

      socket.player.status =
         socket.player.status === PlayerStatus.READY
            ? PlayerStatus.NOT_READY
            : PlayerStatus.READY;

      io.to(socket.room.code).emit(
         "p-set-status",
         socket.player.id,
         socket.player.status
      );

      const currentTime = Date.now();
      if (socket.room.tryStartRoom()) {
         io.to(socket.room.code).emit(
            "started-room",
            socket.room.game.serialize(),
            currentTime
         );
      }
   });

   socket.on("send-chat", (message: string) => {
      if (!socket.room) return;
      socket.room.chat.push(socket.player.id, message.trim().slice(0, 200));
      io.to(socket.room.code).emit("p-sent-chat", socket.player.id, message);
   });

   socket.on("join-board", (boardID: number, color: Color) => {
      if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;

      const oppTeam =
         socket.room.game.matches[boardID].getTeam(color) === Team.RED
            ? Team.BLUE
            : Team.RED;

      for (const match of socket.room.game.matches)
         if (match.getPlayerTeam(oppTeam)?.id === socket.player.id) return;

      socket.room.game.matches[boardID].setPlayer(socket.player, color);
      io.to(socket.room.code).emit(
         "p-joined-board",
         socket.player.id,
         boardID,
         color
      );
   });

   socket.on("move-board", (boardID: number, color: Color, move: Move) => {
      if (
         !socket.room ||
         socket.room.status !== RoomStatus.PLAYING ||
         socket.room.game.matches[boardID].getPlayer(color)?.id !==
            socket.player.id ||
         !socket.room.game.matches[boardID].chess.isLegal(move, false)
      )
         return;

      const currentTime = Date.now();
      socket.room.game.matches[boardID].updateTime(currentTime);
      socket.room.game.doMove(boardID, move);

      io.to(socket.room.code).emit("p-moved-board", boardID, move, currentTime);

      if (socket.room.game.matches[boardID].chess.isCheckmate()) {
         socket.room.endRoom();
         io.to(socket.room.code).emit(
            "ended-room",
            socket.room.game.matches[boardID].getTeam(color),
            socket.room.game.matches[boardID].getPlayer(color)?.name + " won!",
            currentTime
         );
      }
   });

   socket.on("leave-board", (boardID: number, color: Color) => {
      if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;
      socket.room.game.matches[boardID].removePlayer(color);
      io.to(socket.room.code).emit("p-left-board", boardID, color);
   });

   // TODO: Make team a property of the player
   socket.on("resign-room", () => {
      if (!socket.room || socket.room.status !== RoomStatus.PLAYING) return;

      const playerTeam = (() => {
         for (const match of socket.room.game.matches) {
            if (match.getPlayerTeam(Team.BLUE)?.id === socket.player.id)
               return Team.BLUE;
            if (match.getPlayerTeam(Team.RED)?.id === socket.player.id)
               return Team.RED;
         }
         return;
      })();

      if (!playerTeam) return;

      socket.room.endRoom();
      io.to(socket.room.code).emit(
         "ended-room",
         playerTeam,
         "Draw",
         Date.now()
      );
   });
}

function createRoom(roomCode?: string): string | undefined {
   if (rooms.size >= 10_000) return;
   const code = roomCode || randomCode();
   const room = new Room(code);
   rooms.set(code, room);
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

   if (room.status === RoomStatus.PLAYING)
      for (const match of room.game.matches) match.updateTime(Date.now());

   const playerInRoom = room.players.get(socket.player.id);
   if (playerInRoom) {
      playerInRoom.status = PlayerStatus.NOT_READY;
      socket.emit("joined-room", room.serialize());
      socket.to(socket.room.code).emit("p-set-status", PlayerStatus.NOT_READY);
   } else {
      socket.player.status = PlayerStatus.NOT_READY;
      room.addPlayer(socket.player);
      io.to(socket.room.code).emit(
         "p-joined-room",
         socket.player.id,
         socket.player.name
      );
      socket.emit("joined-room", room.serialize());
   }
}

function handlePlayerLeave(socket: GameSocket): void {
   const room = socket.room;
   if (!room) return;

   socket.leave(room.code);

   if (room.status === RoomStatus.LOBBY) handleLobbyPlayerLeave(socket, room);
   else handleGamePlayerDisconnect(socket, room);

   // Check if room should be deleted
   if (shouldDeleteRoom(room)) deleteRoom(room.code);
}

function handleLobbyPlayerLeave(socket: GameSocket, room: Room): void {
   room.removePlayer(socket.player.id);
   socket.to(room.code).emit("p-left-room", socket.player.id);
   emitRoomList();
}

function handleGamePlayerDisconnect(socket: GameSocket, room: Room): void {
   const player = room.players.get(socket.player.id);
   if (player) {
      player.status = PlayerStatus.DISCONNECTED;
      socket
         .to(room.code)
         .emit("p-set-status", socket.player.id, PlayerStatus.DISCONNECTED);
   }
}

function shouldDeleteRoom(room: Room): boolean {
   return room.allPlayersDisconnected();
}

function deleteRoom(roomCode: string): void {
   rooms.delete(roomCode);
   emitRoomList();
}

function randomCode(): string {
   const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
   let result = "";
   do {
      result = "";
      for (let index = 0; index < 4; index++)
         result += chars.charAt(Math.floor(Math.random() * chars.length));
   } while (rooms.has(result)); // Ensure unique code

   return result;
}
