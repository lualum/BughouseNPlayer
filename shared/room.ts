import { Chat } from "./chat";
import { Chess, Color, Move, MoveResult } from "./chess";
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
   }

   serialize(): any {
      const serializedPlayers: Record<string, any> = {};
      this.players.forEach((player, playerId) => {
         serializedPlayers[playerId] = player.serialize();
      });

      return {
         code: this.code,
         status: this.status,
         gameState: this.game.serialize(),
         chat: this.chat.serialize(),
         players: serializedPlayers,
      };
   }

   static deserialize(data: any): Room {
      const room = new Room(data.code);
      room.status = data.status;
      room.game = Game.deserialize(data.gameState);
      room.chat = Chat.deserialize(data.chat);

      const playersData = data.players || {};
      Object.entries(playersData).forEach(
         ([playerId, playerData]: [string, any]) => {
            room.players.set(playerId, Player.deserialize(playerData));
         }
      );

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
         player.status = PlayerStatus.NOT_READY;
      }
   }
}

export class Game {
   matches: Match[];

   constructor() {
      this.matches = [];
   }

   serialize(): any {
      return {
         matches: this.matches.map((match) => match.serialize()),
      };
   }

   static deserialize(data: any): Game {
      const state = new Game();
      state.matches = (data.matches || []).map((matchData: any) =>
         Match.deserialize(matchData)
      );
      return state;
   }

   tryApplyMove(matchIndex: number, move: Move): MoveResult {
      if (matchIndex < 0 || matchIndex >= this.matches.length) {
         return { success: false, capturedPiece: null };
      }

      const result = this.matches[matchIndex].chess.move(move);

      if (result.success && result.capturedPiece) {
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

      return result;
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
      this.playerTimeSinceMove = time;
      this.lastMoveTime = Date.now();
      this.activeColor = Color.WHITE;
      this.flipped = flipped;
   }

   serialize(): any {
      return {
         chess: this.chess.serialize(),
         whitePlayer: this.whitePlayer ? this.whitePlayer.serialize() : null,
         blackPlayer: this.blackPlayer ? this.blackPlayer.serialize() : null,
         whiteTime: this.whiteTime,
         blackTime: this.blackTime,
         playerTimeSinceMove: this.playerTimeSinceMove,
         lastMoveTime: this.lastMoveTime,
         activeColor: this.activeColor,
         flipped: this.flipped,
      };
   }

   static deserialize(data: any): Match {
      const match = new Match();
      match.chess = Chess.deserialize(data.chess);
      match.whitePlayer = data.whitePlayer
         ? Player.deserialize(data.whitePlayer)
         : null;
      match.blackPlayer = data.blackPlayer
         ? Player.deserialize(data.blackPlayer)
         : null;
      match.whiteTime = data.whiteTime;
      match.blackTime = data.blackTime;
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
}
