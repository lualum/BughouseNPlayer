import { Chat } from "./chat";
import { Chess, Color, Move, MoveResult, SerializedChess } from "./chess";
import { Player, PlayerStatus } from "./player";

const defaultTime = 180000; // 3 minutes in milliseconds

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
   whitePlayer: Player | null;
   blackPlayer: Player | null;
   whiteTime: number;
   blackTime: number;
   whitePremoves: Move[];
   blackPremoves: Move[];
   playerTimeSinceMove: number;
   lastMoveTime: number | null;
   activeColor: Color;
   flipped: boolean;
}

export interface SerializedGame {
   matches: SerializedMatch[];
}

export interface SerializedRoom {
   code: string;
   status: RoomStatus;
   gameState: SerializedGame;
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
      this.game.matches.push(new Match(defaultTime, false));
      this.game.matches.push(new Match(defaultTime, true));
      // this.game.matches.push(new Match(defaultTime, false));
   }

   serialize(): SerializedRoom {
      const serializedPlayers: Record<string, Player> = {};
      this.players.forEach((player, id) => {
         serializedPlayers[id] = player;
      });

      return {
         code: this.code,
         status: this.status,
         gameState: this.game.serialize(),
         chat: this.chat,
         players: serializedPlayers,
      };
   }

   static deserialize(data: SerializedRoom): Room {
      const room = new Room(data.code);
      room.status = data.status;
      room.game = Game.deserialize(data.gameState);
      room.chat = data.chat;

      const playersData = data.players || {};
      Object.entries(playersData).forEach(([id, playerData]) => {
         room.players.set(id, playerData);
      });

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
         if (match.whitePlayer?.id === id) {
            match.whitePlayer = null;
         }
         if (match.blackPlayer?.id === id) {
            match.blackPlayer = null;
         }
      }
   }

   getPlayer(id: string): Player | undefined {
      return this.players.get(id);
   }

   allPlayersDisconnected(): boolean {
      if (this.players.size === 0) return true;
      for (const player of this.players.values()) {
         if (player.status !== PlayerStatus.DISCONNECTED) return false;
      }
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

      this.game.matches.forEach((match) => {
         match.whiteTime = defaultTime; // TODO: make configurable (currently 3 min)
         match.blackTime = defaultTime;
         match.playerTimeSinceMove = defaultTime;
         match.lastMoveTime = currentTime;
         match.activeColor = Color.WHITE;
         match.chess.reset();
      });

      return true;
   }

   endRoom(): void {
      this.status = RoomStatus.LOBBY;

      for (const player of this.players.values()) {
         if (player.status === PlayerStatus.DISCONNECTED) {
            this.removePlayer(player.id);
         } else {
            player.status = PlayerStatus.NOT_READY;
         }
      }
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
      state.matches = (data.matches || []).map((matchData) =>
         Match.deserialize(matchData)
      );
      return state;
   }

   tryApplyMove(
      matchIndex: number,
      move: Move,
      currentTime: number = Date.now()
   ): MoveResult {
      if (matchIndex < 0 || matchIndex >= this.matches.length) {
         return { success: false, capturedPiece: null };
      }

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
      const premoves =
         match.activeColor === Color.WHITE
            ? match.whitePremoves
            : match.blackPremoves;

      if (premoves.length === 0) return { success: false, capturedPiece: null };

      const premove = premoves[0];

      const result = match.chess.move(premove);
      if (result.success) {
         premoves.shift();
         this.moveResultEffects(matchIndex, result);
         match.switchTurn(currentTime);
      } else {
         // Premove is invalid, clear all remaining premoves
         premoves.length = 0;
      }

      return result;
   }

   moveResultEffects(matchIndex: number, result: MoveResult): void {
      if (result.capturedPiece) {
         for (let i = 0; i < this.matches.length; i++) {
            if (this.matches[i].flipped === this.matches[matchIndex].flipped) {
               this.matches[i].chess.addToPocket(
                  Chess.invertPieceColor(result.capturedPiece)
               );
            } else {
               this.matches[i].chess.addToPocket(result.capturedPiece);
            }
         }
      }
   }

   addPremove(matchIndex: number, move: Move): boolean {
      const match = this.matches[matchIndex];

      // Determine which color is making the premove (opposite of active color)
      const premoveColor =
         match.activeColor === Color.WHITE ? Color.BLACK : Color.WHITE;

      if (premoveColor === Color.WHITE) {
         match.whitePremoves.push(move);
      } else {
         match.blackPremoves.push(move);
      }

      return true;
   }

   clearPremoves(matchIndex: number, color: Color): void {
      const match = this.matches[matchIndex];

      if (color === Color.WHITE) {
         match.whitePremoves = [];
      } else {
         match.blackPremoves = [];
      }
   }

   getPremoves(matchIndex: number, color: Color): Move[] {
      if (matchIndex < 0 || matchIndex >= this.matches.length) {
         return [];
      }

      const match = this.matches[matchIndex];

      return color === Color.WHITE
         ? [...match.whitePremoves]
         : [...match.blackPremoves];
   }

   getPremovedChess(matchIndex: number): Chess {
      const chess = this.matches[matchIndex].chess.clone();
      const color = this.matches[matchIndex].activeColor;

      for (const move of this.getPremoves(matchIndex, color)) {
         chess.move(move, true);
      }

      return chess;
   }

   updateTime(currentTime: number = Date.now()): void {
      for (const match of this.matches) {
         match.updateTime(currentTime);
      }
   }

   checkTimeout(): { team: Team; player: Player } | null {
      let minTime = Infinity;
      let minSide: Team | null = null;
      let minPlayer: Player | null = null;

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

      return minTime > 0 ? null : { team: minSide!, player: minPlayer! };
   }
}

export class Match {
   chess: Chess;
   whitePlayer: Player | null;
   blackPlayer: Player | null;
   whiteTime: number;
   blackTime: number;
   whitePremoves: Move[];
   blackPremoves: Move[];
   playerTimeSinceMove: number;
   lastMoveTime: number | null = null;
   activeColor: Color;
   flipped: boolean; // normal has bottom as white

   constructor(time: number = 0, flipped: boolean = false) {
      this.chess = new Chess();
      this.whitePlayer = null;
      this.blackPlayer = null;
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
      match.whitePremoves = data.whitePremoves || [];
      match.blackPremoves = data.blackPremoves || [];
      match.playerTimeSinceMove = data.playerTimeSinceMove;
      match.lastMoveTime = data.lastMoveTime;
      match.activeColor = data.activeColor;
      match.flipped = data.flipped;
      return match;
   }

   getPlayer(color: Color): Player | null {
      if (color === Color.WHITE) {
         return this.whitePlayer;
      } else {
         return this.blackPlayer;
      }
   }

   setPlayer(player: Player, color: Color): void {
      if (color === Color.WHITE) {
         this.whitePlayer = player;
      } else {
         this.blackPlayer = player;
      }
   }

   removePlayer(color: Color): void {
      if (color === Color.WHITE) {
         this.whitePlayer = null;
      } else {
         this.blackPlayer = null;
      }
   }

   updateTime(currentTime: number = Date.now()): void {
      if (!this.lastMoveTime) return;

      const elapsed = currentTime - this.lastMoveTime;
      if (this.activeColor === Color.WHITE) {
         this.whiteTime = this.playerTimeSinceMove - elapsed;
      } else {
         this.blackTime = this.playerTimeSinceMove - elapsed;
      }
   }

   switchTurn(currentTime: number): void {
      this.updateTime(currentTime);
      this.activeColor = this.chess.turn;
      this.playerTimeSinceMove =
         this.activeColor === Color.WHITE ? this.whiteTime : this.blackTime;
      this.lastMoveTime = currentTime;
   }

   clearPremoves(color: Color): void {
      if (color === Color.WHITE) {
         this.whitePremoves = [];
      } else {
         this.blackPremoves = [];
      }
   }
}
