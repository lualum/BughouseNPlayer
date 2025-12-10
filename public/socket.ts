import { Color, Move } from "../shared/chess";
import { Player, PlayerStatus } from "../shared/player";
import {
   Game,
   Room,
   RoomListing,
   RoomStatus,
   SerializedGame,
   SerializedRoom,
   Team,
} from "../shared/room";
import {
   endGameUI,
   showRoomElements,
   startGameUI,
   updateUIAllChat,
   updateUIPlayerList,
   updateUIPushChat,
} from "./gameUI";
import {
   startTimeUpdates,
   stopTimeUpdates,
   updateUIAllBoards,
   updateUIAllPlayers,
   updateUIPlayers,
   updateUITime,
} from "./matchUI";
import { showError, updateLobbiesList } from "./menuUI";
import { sn } from "./session";
import { updateURL } from "./url";

export function initSocketEvents(): void {
   sn.socket.on("created-player", (id: string, auth: string) => {
      sn.player = new Player(id);
      sn.auth = auth;

      sessionStorage.setItem("id", id);
      sessionStorage.setItem("auth", auth);
   });

   sn.socket.on("sent-player", (name: string) => {
      sn.player!.name = name;
   });

   sn.socket.on("listed-rooms", (lobbies: RoomListing[]) => {
      updateLobbiesList(lobbies);
   });

   sn.socket.on("joined-room", (raw: SerializedRoom) => {
      const room = Room.deserialize(raw);

      sn.room = room;
      sn.player = room.players.get(sn.player!.id)!;

      showRoomElements();

      updateUIPlayerList();
      updateUIAllChat();
      updateUIAllBoards();
      updateUIAllPlayers();
      updateUITime();

      if (room.status === RoomStatus.PLAYING) {
         startGameUI();
         startTimeUpdates();
      } else {
         endGameUI();
         stopTimeUpdates();
      }

      updateURL(room.code);
   });

   sn.socket.on("p-joined-room", (id: string, name: string) => {
      if (id === sn.player?.id) {
         return;
      }

      sn.room?.addPlayer(new Player(id, name));
      updateUIPlayerList();
   });

   sn.socket.on("p-left-room", (id: string) => {
      sn.room?.removePlayer(id);
      updateUIPlayerList();
   });

   sn.socket.on(
      "p-joined-board",
      (id: string, boardID: number, color: Color) => {
         const player = sn.room!.getPlayer(id)!;
         sn.room?.game.matches[boardID].setPlayer(player, color);
         updateUIPlayers(boardID);
      }
   );

   sn.socket.on("p-left-board", (boardID: number, color: Color) => {
      sn.room?.game.matches[boardID].removePlayer(color);
      updateUIPlayers(boardID);
   });

   sn.socket.on("p-set-status", (id: string, status: PlayerStatus) => {
      const player = sn.room!.getPlayer(id)!;
      player.status = status;
      updateUIPlayerList();
   });

   sn.socket.on("started-room", (raw: SerializedGame, timeStarted: number) => {
      sn.room!.status = RoomStatus.PLAYING;
      sn.room!.game = Game.deserialize(raw);
      sn.room!.tryStartRoom(timeStarted);

      startGameUI();
      startTimeUpdates();
      console.log(`Game started in room ${sn.room!.code}`);
   });

   sn.socket.on(
      "p-moved-board",
      (boardID: number, move: Move, newTime: number) => {
         sn.room?.game.tryApplyMove(boardID, move);
         sn.room?.game.matches[boardID].updateTime(newTime);
         sn.room?.game.matches[boardID].switchTurn(newTime);
         sn.room?.game.matches[boardID].updateTime(Date.now());

         updateUITime();

         updateUIAllBoards();
      }
   );

   sn.socket.on("ended-room", (raw: Team, reason: string) => {
      sn.room!.endRoom();
      endGameUI();
      stopTimeUpdates();
      updateUIPushChat({ id: "server", message: reason });
      // TODO: Show modal end game screen
   });

   sn.socket.on("p-sent-chat", (id: string, message: string) => {
      console.log(`Chat message from ${id}: ${message}`);
      sn.room?.chat.push(id, message);

      updateUIPushChat({ id, message });
   });

   sn.socket.on("error", (error: string) => {
      showError("menu-error", error);
   });
}
