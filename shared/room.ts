import { Chat } from "./chat";
import {
   Chess,
   Color,
   invertColor,
   Move,
   MoveResult,
   SerializedChess,
} from "./chess";
import { Player, PlayerStatus } from "./player";

const defaultTime = 180_000; // 3 minutes in milliseconds

export enum RoomStatus {
   LOBBY = "lobby",
   PLAYING = "playing",
}

export interface RoomListing {
   code: string;
   numPlayers: number;
}

// Red: White unflipped & Black flipped
// Blue: White flipped & Black unflipped
export enum Team {
   RED = "red",
   BLUE = "blue",
}

export interface SerializedMatch {
   chess: SerializedChess;
   whitePlayer: Player | undefined;
   blackPlayer: Player | undefined;
   whiteTime: number;
   blackTime: number;
   whitePremoves: Move[];
   blackPremoves: Move[];
   playerTimeSinceMove: number;
   lastMoveTime: number | undefined;
   activeColor: Color;
   flipped: boolean;
}

export interface SerializedGame {
   matches: SerializedMatch[];
}

export interface SerializedRoom {
   code: string;
   status: RoomStatus;
   game: SerializedGame;
   chat: Chat;
   players: Record<string, Player>;
}

export class Room {
   code: string;
   players: Map<string, Player>;
   status: RoomStatus;
   game: Game;
   chat: Chat;

   constructor(code: string) {
      this.code = code;
      this.players = new Map();
      this.status = RoomStatus.LOBBY;
      this.game = new Game();
      this.chat = new Chat();

      // Initialize two chess games for the room
      this.game.matches.push(
         new Match(defaultTime, false),
         new Match(defaultTime, true)
      );
      // this.game.matches.push(new Match(defaultTime, false));
   }

   serialize(): SerializedRoom {
      const serializedPlayers: Record<string, Player> = {};
      for (const [id, player] of this.players.entries()) {
         serializedPlayers[id] = player;
      }

      return {
         code: this.code,
         status: this.status,
         game: this.game.serialize(),
         chat: this.chat,
         players: serializedPlayers,
      };
   }

   static deserialize(data: SerializedRoom): Room {
      const room = new Room(data.code);
      room.status = data.status;
      room.game = Game.deserialize(data.game);
      room.chat = data.chat;

      const playersData = data.players;
      for (const [id, playerData] of Object.entries(playersData)) {
         room.players.set(id, playerData);
      }

      return room;
   }

   getRoomListing(): RoomListing {
      return {
         code: this.code,
         numPlayers: this.players.size,
      };
   }

   addPlayer(player: Player): void {
      this.players.set(player.id, player);
   }

   removePlayer(id: string): void {
      this.players.delete(id);

      for (const match of this.game.matches) {
         if (match.whitePlayer?.id === id) match.whitePlayer = undefined;

         if (match.blackPlayer?.id === id) match.blackPlayer = undefined;
      }
   }

   getPlayer(id: string): Player | undefined {
      return this.players.get(id);
   }

   allPlayersDisconnected(): boolean {
      if (this.players.size === 0) return true;
      for (const player of this.players.values())
         if (player.status !== PlayerStatus.DISCONNECTED) return false;

      return true;
   }

   tryStartRoom(currentTime: number = Date.now()): boolean {
      if (this.status !== RoomStatus.LOBBY) return false;
      for (const match of this.game.matches) {
         if (!match.whitePlayer || !match.blackPlayer) return false;
         if (
            match.whitePlayer.status !== PlayerStatus.READY ||
            match.blackPlayer.status !== PlayerStatus.READY
         )
            return false;
      }

      this.status = RoomStatus.PLAYING;

      for (const match of this.game.matches) {
         match.whiteTime = defaultTime; // TODO: make configurable (currently 3 min)
         match.blackTime = defaultTime;
         match.playerTimeSinceMove = defaultTime;
         match.lastMoveTime = currentTime;
         match.activeColor = Color.WHITE;
         match.chess.reset();
      }

      return true;
   }

   endRoom(): void {
      this.status = RoomStatus.LOBBY;

      for (const player of this.players.values())
         if (player.status === PlayerStatus.DISCONNECTED)
            this.removePlayer(player.id);
         else player.status = PlayerStatus.NOT_READY;
   }
}

export class Game {
   matches: Match[];

   constructor() {
      this.matches = [];
   }

   serialize(): SerializedGame {
      return {
         matches: this.matches.map((match) => match.serialize()),
      };
   }

   static deserialize(data: SerializedGame): Game {
      const state = new Game();
      state.matches = data.matches.map((matchData) =>
         Match.deserialize(matchData)
      );
      return state;
   }

   tryApplyMove(
      matchIndex: number,
      move: Move,
      currentTime: number = Date.now()
   ): MoveResult {
      if (matchIndex < 0 || matchIndex >= this.matches.length)
         return { success: false, captured: undefined };

      const match = this.matches[matchIndex];
      const result = match.chess.move(move);

      if (result.success) {
         this.moveResultEffects(matchIndex, result);
         match.switchTurn(currentTime);
         this.tryExecutePremoves(matchIndex, currentTime);
      }

      return result;
   }

   tryExecutePremoves(
      matchIndex: number,
      currentTime: number = Date.now()
   ): MoveResult {
      const match = this.matches[matchIndex];
      const premoves = match.activeColor
         ? match.whitePremoves
         : match.blackPremoves;

      if (premoves.length === 0) return { success: false, captured: undefined };

      const premove = premoves[0];

      const result = match.chess.move(premove);
      if (result.success) {
         premoves.shift();
         this.moveResultEffects(matchIndex, result);
         match.switchTurn(currentTime);
      }
      // Premove is invalid, clear all remaining premoves
      else premoves.length = 0;

      return result;
   }

   moveResultEffects(matchID: number, result: MoveResult): void {
      if (!result.captured) return;

      for (let index = 0; index < this.matches.length; index++) {
         const shouldInvert =
            this.matches[index].flipped === this.matches[matchID].flipped;
         const color = shouldInvert
            ? invertColor(result.captured.color)
            : result.captured.color;

         this.matches[index].chess.addToPocket({
            type: result.captured.type,
            color,
         });
      }
   }

   addPremove(matchIndex: number, move: Move): boolean {
      const match = this.matches[matchIndex];

      // Determine which color is making the premove (opposite of active color)
      const premoveColor = invertColor(match.activeColor);

      if (premoveColor) match.whitePremoves.push(move);
      else match.blackPremoves.push(move);

      return true;
   }

   clearPremoves(matchIndex: number, color: Color): void {
      const match = this.matches[matchIndex];

      if (color) match.whitePremoves = [];
      else match.blackPremoves = [];
   }

   getPremoves(matchIndex: number, color: Color): Move[] {
      if (matchIndex < 0 || matchIndex >= this.matches.length) return [];
      const match = this.matches[matchIndex];
      return color ? [...match.whitePremoves] : [...match.blackPremoves];
   }

   getPremovedChess(matchIndex: number): Chess {
      const chess = this.matches[matchIndex].chess.clone();
      const color = this.matches[matchIndex].activeColor;

      for (const move of this.getPremoves(matchIndex, color))
         chess.move(move, true);

      return chess;
   }

   updateTime(currentTime: number = Date.now()): void {
      for (const match of this.matches) match.updateTime(currentTime);
   }

   checkTimeout(): { team: Team; player: Player } | undefined {
      let minTime = Infinity;
      let minSide: Team | undefined;
      let minPlayer: Player | undefined;

      for (const match of this.matches) {
         if (match.flipped ? match.blackTime : match.whiteTime < minTime) {
            minTime = match.flipped ? match.blackTime : match.whiteTime;
            minSide = Team.BLUE;
            minPlayer = match.flipped ? match.blackPlayer : match.whitePlayer;
         }

         // Bottom side
         if (match.flipped ? match.whiteTime : match.blackTime < minTime) {
            minTime = match.flipped ? match.whiteTime : match.blackTime;
            minSide = Team.RED;
            minPlayer = match.flipped ? match.whitePlayer : match.blackPlayer;
         }
      }

      return minTime > 0 || !minSide || !minPlayer
         ? undefined
         : { team: minSide, player: minPlayer };
   }
}

export class Match {
   chess: Chess;
   whitePlayer: Player | undefined;
   blackPlayer: Player | undefined;
   whiteTime: number;
   blackTime: number;
   whitePremoves: Move[];
   blackPremoves: Move[];
   playerTimeSinceMove: number;
   lastMoveTime: number | undefined;
   activeColor: Color;
   flipped: boolean; // normal has bottom as white

   constructor(time: number = 0, flipped: boolean = false) {
      this.chess = new Chess();
      this.whitePlayer = undefined;
      this.blackPlayer = undefined;
      this.whiteTime = time;
      this.blackTime = time;
      this.whitePremoves = [];
      this.blackPremoves = [];
      this.playerTimeSinceMove = time;
      this.lastMoveTime = Date.now();
      this.activeColor = Color.WHITE;
      this.flipped = flipped;
   }

   serialize(): SerializedMatch {
      return {
         chess: this.chess.serialize(),
         whitePlayer: this.whitePlayer,
         blackPlayer: this.blackPlayer,
         whiteTime: this.whiteTime,
         blackTime: this.blackTime,
         whitePremoves: this.whitePremoves,
         blackPremoves: this.blackPremoves,
         playerTimeSinceMove: this.playerTimeSinceMove,
         lastMoveTime: this.lastMoveTime,
         activeColor: this.activeColor,
         flipped: this.flipped,
      };
   }

   static deserialize(data: SerializedMatch): Match {
      const match = new Match();
      match.chess = Chess.deserialize(data.chess);
      match.whitePlayer = data.whitePlayer;
      match.blackPlayer = data.blackPlayer;
      match.whiteTime = data.whiteTime;
      match.blackTime = data.blackTime;
      match.whitePremoves = data.whitePremoves;
      match.blackPremoves = data.blackPremoves;
      match.playerTimeSinceMove = data.playerTimeSinceMove;
      match.lastMoveTime = data.lastMoveTime;
      match.activeColor = data.activeColor;
      match.flipped = data.flipped;
      return match;
   }

   getPlayer(color: Color): Player | undefined {
      return color ? this.whitePlayer : this.blackPlayer;
   }

   getTeam(color: Color): Team {
      return (color === Color.WHITE) === this.flipped ? Team.BLUE : Team.RED;
   }

   getPlayerTeam(team: Team): Player | undefined {
      return (team === Team.BLUE) === this.flipped
         ? this.whitePlayer
         : this.blackPlayer;
   }

   setPlayer(player: Player, color: Color): void {
      if (color) this.whitePlayer = player;
      else this.blackPlayer = player;
   }

   removePlayer(color: Color): void {
      if (color) this.whitePlayer = undefined;
      else this.blackPlayer = undefined;
   }

   updateTime(currentTime: number = Date.now()): void {
      if (!this.lastMoveTime) return;

      const elapsed = currentTime - this.lastMoveTime;
      if (this.activeColor) this.whiteTime = this.playerTimeSinceMove - elapsed;
      else this.blackTime = this.playerTimeSinceMove - elapsed;
   }

   switchTurn(currentTime: number): void {
      this.updateTime(currentTime);
      this.activeColor = this.chess.turn;
      this.playerTimeSinceMove = this.activeColor
         ? this.whiteTime
         : this.blackTime;
      this.lastMoveTime = currentTime;
   }

   clearPremoves(color: Color): void {
      if (color) this.whitePremoves = [];
      else this.blackPremoves = [];
   }
}
