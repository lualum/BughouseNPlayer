import { session } from "./session";
import { updateURL } from "./url";
import { Game, RoomListing, RoomStatus, Team } from "../shared/room";
import { Player, PlayerStatus } from "../shared/player";
import { Room } from "../shared/room";
import { showError, updateLobbiesList } from "./menuUI";
import {
   endGameUI as showLobbyUI,
   showRoomElements,
   startGameUI as showGameUI,
   updateChatDisplay,
   updateUIPlayerList,
} from "./gameUI";
import { Color, Move } from "../shared/chess";
import {
   startTimeUpdates,
   stopTimeUpdates,
   updateUIAllPlayers,
   updateUIPlayers,
   updateUITime,
} from "./matchUI";
import { updateUIAllBoards } from "./chessUI";

export function initSocketEvents(): void {
   session.socket.on("created-player", (id: string, auth: string) => {
      session.player = new Player(id);
      session.auth = auth;

      sessionStorage.setItem("id", id);
      sessionStorage.setItem("auth", auth);
   });

   session.socket.on("sent-player", (name: string) => {
      session.player!.name = name;
   });

   session.socket.on("listed-rooms", (lobbies: RoomListing[]) => {
      updateLobbiesList(lobbies);
   });

   session.socket.on("joined-room", (raw: Room) => {
      const room = Room.deserialize(raw);

      session.room = room;
      session.player = room.players.get(session.player!.id)!;

      showRoomElements();

      updateUIPlayerList();
      updateChatDisplay();
      updateUIAllBoards();
      updateUIAllPlayers();
      updateUITime();

      if (room.status === RoomStatus.PLAYING) {
         showGameUI();
         startTimeUpdates();
      } else {
         showLobbyUI();
         stopTimeUpdates();
      }

      updateURL(room.code);
   });

   session.socket.on("p-joined-room", (id: string, name: string) => {
      if (id === session.player?.id) {
         return;
      }

      session.room?.addPlayer(new Player(id, name));
      updateUIPlayerList();
   });

   session.socket.on("p-left-room", (id: string) => {
      session.room?.removePlayer(id);
      updateUIPlayerList();
   });

   session.socket.on(
      "p-joined-board",
      (id: string, boardID: number, color: Color) => {
         const player = session.room?.getPlayer(id)!;
         session.room?.game.matches[boardID].setPlayer(player, color);
         updateUIPlayers(boardID);
      }
   );

   session.socket.on("p-left-board", (boardID: number, color: Color) => {
      session.room?.game.matches[boardID].removePlayer(color);
      updateUIPlayers(boardID);
   });

   session.socket.on("p-set-status", (id: string, status: PlayerStatus) => {
      const player = session.room?.getPlayer(id)!;
      player.status = status;
      updateUIPlayerList();
   });

   session.socket.on("started-room", (raw: Game, timeStarted: number) => {
      session.room!.status = RoomStatus.PLAYING;
      session.room!.game = Game.deserialize(raw);
      session.room!.tryStartRoom(timeStarted);

      showGameUI();
      startTimeUpdates();
      console.log(`Game started in room ${session.room!.code}`);
   });

   session.socket.on(
      "p-moved-board",
      (boardID: number, move: Move, newTime: number) => {
         session.room?.game.tryApplyMove(boardID, move);
         session.room?.game.matches[boardID].updateTime(newTime);
         session.room?.game.matches[boardID].switchTurn(newTime);
         session.room?.game.matches[boardID].updateTime(Date.now());

         updateUITime();

         updateUIAllBoards();
      }
   );

   session.socket.on("ended-room", (raw: Team, reason: string) => {
      const team = raw === "red" ? Team.RED : Team.BLUE;
      session.room!.endRoom();
      showLobbyUI();
      stopTimeUpdates();

      // TODO: Show modal end game screen
   });

   session.socket.on("p-sent-chat", (id: string, message: string) => {
      console.log(`Chat message from ${id}: ${message}`);
      session.room?.chat.push(id, message);
      updateChatDisplay();
   });

   session.socket.on("error", (error: string) => {
      showError("menu-error", error);
   });
}
