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
   premoves: Move[]; // Later moves appear at the end, ALWAYS opposite of chess.turn
   playerTimeSinceMove: number;
   lastMoveTime: number | undefined;
   activeColor: Color; // Player's
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
         match.whiteTime = defaultTime;
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

   tryAddMove(
      matchIndex: number,
      move: Move,
      premove: boolean = false,
      currentTime: number = Date.now()
   ): MoveResult {
      return premove
         ? this.tryAddPremove(matchIndex, move)
         : this.tryApplyMove(matchIndex, move, currentTime);
   }

   getChessPremoved(matchIndex: number): Chess {
      const chess = this.matches[matchIndex].chess.clone();

      for (const move of this.getPremoves(matchIndex)) {
         chess.tryMove(move, true);
      }

      return chess;
   }

   private tryApplyMove(
      matchIndex: number,
      move: Move,
      currentTime: number = Date.now()
   ): MoveResult {
      if (matchIndex < 0 || matchIndex >= this.matches.length)
         return { success: false, captured: undefined };

      const match = this.matches[matchIndex];
      const result = match.chess.tryMove(move);

      if (result.success) {
         this.moveResultEffects(matchIndex, result);
         match.switchTurn(currentTime);
         this.tryExecutePremoves(matchIndex, currentTime);
      }

      return result;
   }

   private tryAddPremove(matchIndex: number, move: Move): MoveResult {
      const match = this.matches[matchIndex];
      if (this.getChessPremoved(matchIndex).isLegal(move, true)) {
         match.premoves.push(move);
         return { success: true, captured: undefined };
      }
      return { success: false, captured: undefined };
   }

   tryExecutePremoves(
      matchIndex: number,
      currentTime: number = Date.now()
   ): MoveResult {
      const match = this.matches[matchIndex];

      if (match.premoves.length === 0)
         return { success: false, captured: undefined };

      const premove = match.premoves[0];

      const result = match.chess.tryMove(premove);
      if (result.success) {
         match.premoves.shift();
         this.moveResultEffects(matchIndex, result);
         match.switchTurn(currentTime);
      } else match.premoves.length = 0;

      return result;
   }

   private moveResultEffects(matchID: number, result: MoveResult): void {
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

   clearPremoves(matchIndex: number): void {
      const match = this.matches[matchIndex];
      match.premoves.length = 0;
   }

   getPremoves(matchIndex: number): Move[] {
      if (matchIndex < 0 || matchIndex >= this.matches.length) return [];
      return this.matches[matchIndex].premoves;
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
   premoves: Move[];
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
      this.premoves = [];
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
         premoves: this.premoves,
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
      match.premoves = data.premoves;
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

   clearPremoves(): void {
      this.premoves.length = 0;
   }
}
