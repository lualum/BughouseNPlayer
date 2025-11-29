import { Chat } from "./chat";
import { Player, PlayerStatus } from "./player";
import { Game } from "./state";

export enum RoomStatus {
   LOBBY = "lobby",
   PLAYING = "playing",
}

export interface RoomListing {
   code: string;
   numPlayers: number;
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
   }

   serialize(): any {
      const serializedPlayers: Record<string, any> = {};
      this.players.forEach((player, playerId) => {
         serializedPlayers[playerId] = player.serialize();
      });

      return {
         code: this.code,
         roomState: this.status,
         gameState: this.game.serialize(),
         chat: this.chat.serialize(),
         players: serializedPlayers,
      };
   }

   static deserialize(data: any): Room {
      const room = new Room(data.code);
      room.status = data.roomState;
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

   removePlayer(playerId: string): void {
      this.players.delete(playerId);
      // Remove player from boards if they are in one
      for (const match of this.game.matches) {
         if (match.whitePlayer?.id === playerId) {
            match.whitePlayer = null;
         }
         if (match.blackPlayer?.id === playerId) {
            match.blackPlayer = null;
         }
      }
   }

   getPlayer(playerId: string): Player | undefined {
      return this.players.get(playerId);
   }

   allBoardsFull(): boolean {
      for (const match of this.game.matches) {
         if (!match.whitePlayer || !match.blackPlayer) return false;
      }
      return true;
   }

   readyToStart(): boolean {
      if (this.players.size < 2) return false;
      for (const player of this.players.values()) {
         if (player.status !== PlayerStatus.READY) return false;
      }
      return true;
   }

   autoAssignPlayers(): void {
      // Count current assignments for each player
      const playerBoardCounts = new Map<string, number>();
      this.players.forEach((player) => {
         playerBoardCounts.set(player.id, 0);
      });

      // Count existing assignments
      for (const match of this.game.matches) {
         if (match.whitePlayer) {
            playerBoardCounts.set(
               match.whitePlayer.id,
               (playerBoardCounts.get(match.whitePlayer.id) || 0) + 1
            );
         }
         if (match.blackPlayer) {
            playerBoardCounts.set(
               match.blackPlayer.id,
               (playerBoardCounts.get(match.blackPlayer.id) || 0) + 1
            );
         }
      }

      // Get list of players sorted by fewest boards assigned, with randomness for ties
      const getSortedPlayers = (): Player[] => {
         const players = Array.from(this.players.values());

         // Shuffle array first to randomize ties
         for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
         }

         // Sort by board count (stable sort preserves random order for ties)
         return players.sort((a, b) => {
            const countA = playerBoardCounts.get(a.id) || 0;
            const countB = playerBoardCounts.get(b.id) || 0;
            return countA - countB;
         });
      };

      // Fill empty positions
      for (const match of this.game.matches) {
         // Fill white position if empty
         if (!match.whitePlayer) {
            const sortedPlayers = getSortedPlayers();
            for (const player of sortedPlayers) {
               // Check if player is already black on this board
               if (match.blackPlayer?.id === player.id) continue;

               // Check if player is on the opposite color of a flipped equivalent board
               let canAssign = true;
               for (const otherMatch of this.game.matches) {
                  if (otherMatch === match) continue;
                  if (otherMatch.flipped !== match.flipped) {
                     // Different flip means different color mapping
                     if (otherMatch.blackPlayer?.id === player.id) {
                        canAssign = false;
                        break;
                     }
                  }
               }

               if (canAssign) {
                  match.whitePlayer = player;
                  playerBoardCounts.set(
                     player.id,
                     (playerBoardCounts.get(player.id) || 0) + 1
                  );
                  break;
               }
            }
         }

         // Fill black position if empty
         if (!match.blackPlayer) {
            const sortedPlayers = getSortedPlayers();
            for (const player of sortedPlayers) {
               // Check if player is already white on this board
               if (match.whitePlayer?.id === player.id) continue;

               // Check if player is on the opposite color of a flipped equivalent board
               let canAssign = true;
               for (const otherMatch of this.game.matches) {
                  if (otherMatch === match) continue;
                  if (otherMatch.flipped !== match.flipped) {
                     // Different flip means different color mapping
                     if (otherMatch.whitePlayer?.id === player.id) {
                        canAssign = false;
                        break;
                     }
                  }
               }

               if (canAssign) {
                  match.blackPlayer = player;
                  playerBoardCounts.set(
                     player.id,
                     (playerBoardCounts.get(player.id) || 0) + 1
                  );
                  break;
               }
            }
         }
      }
   }

   allPlayersDisconnected(): boolean {
      if (this.players.size === 0) return true;
      for (const player of this.players.values()) {
         if (player.status !== PlayerStatus.DISCONNECTED) return false;
      }
      return true;
   }

   resetGame(): void {
      this.status = RoomStatus.LOBBY;
      this.game.resetState();
      for (const player of this.players.values()) {
         player.status = PlayerStatus.NOT_READY;
      }
   }
}
