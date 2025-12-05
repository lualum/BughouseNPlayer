import { randomBytes } from "crypto";
import express from "express";
import http from "http";
import { setupLobbyHandlers } from "lobbyHandlers";
import { setupMenuHandlers } from "menuHandlers";
import path from "path";
import { Server, Socket } from "socket.io";
import { Player } from "../shared/player";
import { Room, RoomStatus } from "../shared/room";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

export const rooms = new Map<string, Room>();
export const players = new Map<string, PlayerSave>();

export class GameSocket extends Socket {
   room?: Room | null;
   player?: Player | null;
}

export interface PlayerSave {
   player: Player;
   playerID: string;
   auth: string;
}

app.use(express.static(path.join(__dirname, "..", "..", "public")));
app.use(
   "/dist",
   express.static(path.join(__dirname, "..", "..", "public", "dist"))
);
app.use(
   "/pieces",
   express.static(path.join(__dirname, "..", "..", "public", "pieces"))
);
app.use(
   "/img",
   express.static(path.join(__dirname, "..", "..", "public", "img"))
);
app.get("/games/:roomCode", (req, res) => {
   const roomCode = req.params.roomCode as string;
   if (!/^[A-Z0-9]{4}$/.test(roomCode)) {
      return res.status(404).send("Invalid room code format");
   }
   res.sendFile(path.join(__dirname, "..", "..", "public", "index.html"));
});

io.on("connection", (socket: GameSocket) => {
   if (socket.handshake.auth.playerID && socket.handshake.auth.token) {
      const playerSave = players.get(socket.handshake.auth.playerID);
      if (playerSave && playerSave.auth === socket.handshake.auth.token) {
         socket.player = playerSave.player;

         // TODO: Generalize to "profile"
         socket.emit("sent-player", playerSave.player.name);

         console.log("User reconnected:", socket.player!.name || "[unnamed]");
      } else {
         socket.disconnect();
         return;
      }
   } else {
      const playerID = randomPlayerID();
      const player = new Player(playerID);

      const playerAuth = randomAuth();

      socket.player = player;
      players.set(playerID, { player, playerID, auth: playerAuth });

      socket.emit("created-player", playerID, playerAuth);
   }
   console.log("User connected:", socket.player!.name || "[unnamed]");

   setupMenuHandlers(socket, io);
   setupLobbyHandlers(socket, io);

   emitRoomList();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
   console.log(
      `<< Started Server [${PORT}] on ${new Date().toLocaleString()} >> \n\n`
   );
});

const timeoutCheckInterval = setInterval(() => {
   const currentTime = Date.now();
   rooms.forEach((room) => {
      if (room.status === RoomStatus.PLAYING) {
         room.game.updateTime(currentTime);
         const timeout = room.game.checkTimeout();
         if (timeout) {
            room.endRoom();
            console.log(timeout.player.name + " timed out.");
            io.to(room.code).emit(
               "ended-room",
               timeout.team,
               timeout.player.name + " timed out."
            );
         }
      }
   });
}, 100);

function randomPlayerID(): string {
   return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
   );
}

function randomAuth(): string {
   return randomBytes(32).toString("hex");
}

export function emitRoomList(): void {
   io.emit(
      "listed-rooms",
      Array.from(rooms.values()).map((room) => room.getRoomListing())
   );
}
