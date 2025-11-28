import { Player } from "./player";

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

   changeState(newState: Game): void {
      this.matches = newState.matches;
   }

   applyMove(matchIndex: number, move: Move): MoveResult {
      if (matchIndex < 0 || matchIndex >= this.matches.length) {
         return { success: false, capturedPiece: null };
      }
      const result = this.matches[matchIndex].chess.move(move);

      if (!result.success) {
         return { success: false, capturedPiece: null };
      } else if (result.capturedPiece) {
         for (let i = 0; i < this.matches.length; i++) {
            if (this.matches[i].flipped === this.matches[matchIndex].flipped) {
               this.matches[i].chess.addToPocket(
                  this.matches[matchIndex].chess.invertPieceColor(
                     result.capturedPiece!
                  )!
               );
            } else {
               this.matches[i].chess.addToPocket(result.capturedPiece!);
            }
         }
      }
      return result;
   }

   resetState(): void {
      this.matches = [];
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
            minTime = match.whiteTime;
            minSide = Team.BLUE;
            minPlayer = match.flipped ? match.blackPlayer : match.whitePlayer;
         }

         // Bottom side
         if (match.flipped ? match.whiteTime : match.blackTime < minTime) {
            minTime = match.blackTime;
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

   samePlayer(player: Player, color: Color): boolean {
      if (color === Color.WHITE) {
         return this.whitePlayer?.id === player.id;
      } else {
         return this.blackPlayer?.id === player.id;
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

export class Chess {
   board: Board;
   whitePocket: Piece[];
   blackPocket: Piece[];
   turn: Color;

   constructor() {
      this.board = Array(8)
         .fill(null)
         .map(() => Array(8).fill(null));
      this.whitePocket = [];
      this.blackPocket = [];
      this.turn = Color.WHITE;
      this.initializeBoard();
   }

   serialize(): any {
      return {
         board: this.board.map((row) => [...row]),
         whitePocket: [...this.whitePocket],
         blackPocket: [...this.blackPocket],
         turn: this.turn,
      };
   }

   static deserialize(data: any): Chess {
      const chess = new Chess();
      chess.board = data.board.map((row: any[]) => [...row]);
      chess.whitePocket = [...(data.whitePocket || [])];
      chess.blackPocket = [...(data.blackPocket || [])];
      chess.turn = deserializeColor(data.turn);
      return chess;
   }

   initializeBoard(): void {
      const backRank: string[] = [
         PieceType.ROOK,
         PieceType.KNIGHT,
         PieceType.BISHOP,
         PieceType.QUEEN,
         PieceType.KING,
         PieceType.BISHOP,
         PieceType.KNIGHT,
         PieceType.ROOK,
      ];
      for (let i = 0; i < 8; i++) {
         this.board[Rank.ONE][i] = backRank[i].toLowerCase() as Piece;
         this.board[Rank.TWO][i] = PieceType.PAWN.toLowerCase() as Piece;
         this.board[Rank.SEVEN][i] = PieceType.PAWN as Piece;
         this.board[Rank.EIGHT][i] = backRank[i] as Piece;
      }
   }

   getPiece(pos: Position): Piece | null {
      return this.board[pos.row][pos.col];
   }

   isWhitePiece(piece: string): boolean {
      return piece === piece.toUpperCase();
   }

   invertPieceColor(piece: Piece): Piece | null {
      if (!piece) return null;
      return (
         this.isWhitePiece(piece) ? piece.toLowerCase() : piece.toUpperCase()
      ) as Piece;
   }

   getPieceColor(piece: Piece): Color | null {
      if (!piece) return null;
      return piece === piece.toUpperCase() ? Color.WHITE : Color.BLACK;
   }

   getPieceColorAt(pos: Position): Color | null {
      const piece = this.board[pos.row][pos.col];
      if (!piece) return null;
      return piece === piece.toUpperCase() ? Color.WHITE : Color.BLACK;
   }

   getPocket(color: Color): Piece[] {
      return color === Color.WHITE ? this.whitePocket : this.blackPocket;
   }

   addToPocket(piece: Piece): void {
      this.getPocket(this.getPieceColor(piece)!).push(piece);
   }

   findKing(isWhite: boolean): Position | null {
      for (let row = 0; row < 8; row++) {
         for (let col = 0; col < 8; col++) {
            const piece = this.board[row][col];
            if (
               piece &&
               piece.toUpperCase() === PieceType.KING &&
               this.isWhitePiece(piece) === isWhite
            ) {
               return createPosition(row, col);
            }
         }
      }
      return null;
   }

   isSquareAttacked(pos: Position, byWhite: boolean): boolean {
      for (let r = 0; r < 8; r++) {
         for (let c = 0; c < 8; c++) {
            const piece = this.board[r][c];
            if (piece && this.isWhitePiece(piece) === byWhite) {
               if (this.canPieceAttack(createPosition(r, c), pos)) {
                  return true;
               }
            }
         }
      }
      return false;
   }

   canPieceAttack(from: Position, to: Position): boolean {
      const piece = this.board[from.row][from.col];
      if (!piece) return false;

      const pieceType = piece.toUpperCase() as PieceType;
      const isWhite = this.isWhitePiece(piece);
      const direction = isWhite ? -1 : 1;

      switch (pieceType) {
         case PieceType.PAWN:
            return (
               Math.abs(from.col - to.col) === 1 &&
               to.row - from.row === direction
            );
         case PieceType.KNIGHT:
            const dr = Math.abs(from.row - to.row);
            const dc = Math.abs(from.col - to.col);
            return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
         case PieceType.BISHOP:
            return this.isDiagonalPath(from, to);
         case PieceType.ROOK:
            return this.isStraightPath(from, to);
         case PieceType.QUEEN:
            return (
               this.isDiagonalPath(from, to) || this.isStraightPath(from, to)
            );
         case PieceType.KING:
            return (
               Math.abs(from.row - to.row) <= 1 &&
               Math.abs(from.col - to.col) <= 1
            );
         default:
            return false;
      }
   }

   isInCheck(isWhite: boolean): boolean {
      const kingPos = this.findKing(isWhite);
      if (!kingPos) return false;
      return this.isSquareAttacked(kingPos, !isWhite);
   }

   isPathClear(from: Position, to: Position): boolean {
      const rowStep = to.row > from.row ? 1 : to.row < from.row ? -1 : 0;
      const colStep = to.col > from.col ? 1 : to.col < from.col ? -1 : 0;

      let currentRow = from.row + rowStep;
      let currentCol = from.col + colStep;

      while (currentRow !== to.row || currentCol !== to.col) {
         if (this.board[currentRow][currentCol] !== null) {
            return false;
         }
         currentRow += rowStep;
         currentCol += colStep;
      }
      return true;
   }

   isDiagonalPath(from: Position, to: Position): boolean {
      if (Math.abs(from.row - to.row) !== Math.abs(from.col - to.col))
         return false;
      return this.isPathClear(from, to);
   }

   isStraightPath(from: Position, to: Position): boolean {
      if (from.row !== to.row && from.col !== to.col) return false;
      return this.isPathClear(from, to);
   }

   isLegalMove(from: Position, to: Position): boolean {
      const piece = this.board[from.row][from.col];
      if (!piece) return false;

      const isWhite = this.isWhitePiece(piece);
      if ((this.turn === Color.WHITE) !== isWhite) return false;

      const targetPiece = this.board[to.row][to.col];
      if (targetPiece && this.isWhitePiece(targetPiece) === isWhite)
         return false;

      const pieceType = piece.toUpperCase() as PieceType;
      const direction = isWhite ? -1 : 1;

      let isValid = false;

      switch (pieceType) {
         case PieceType.PAWN:
            if (from.col === to.col) {
               if (to.row - from.row === direction && !targetPiece) {
                  isValid = true;
               } else if (to.row - from.row === 2 * direction && !targetPiece) {
                  const startRow = isWhite ? Rank.SEVEN : Rank.TWO;
                  if (from.row === startRow && this.isPathClear(from, to)) {
                     isValid = true;
                  }
               }
            } else if (
               Math.abs(from.col - to.col) === 1 &&
               to.row - from.row === direction &&
               targetPiece
            ) {
               isValid = true;
            }
            break;
         case PieceType.KNIGHT:
            const dr = Math.abs(from.row - to.row);
            const dc = Math.abs(from.col - to.col);
            isValid = (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
            break;
         case PieceType.BISHOP:
            isValid = this.isDiagonalPath(from, to);
            break;
         case PieceType.ROOK:
            isValid = this.isStraightPath(from, to);
            break;
         case PieceType.QUEEN:
            isValid =
               this.isDiagonalPath(from, to) || this.isStraightPath(from, to);
            break;
         case PieceType.KING:
            isValid =
               Math.abs(from.row - to.row) <= 1 &&
               Math.abs(from.col - to.col) <= 1;
            break;
      }

      if (!isValid) return false;

      const originalPiece = this.board[to.row][to.col];
      this.board[to.row][to.col] = piece;
      this.board[from.row][from.col] = null;

      const inCheck = this.isInCheck(isWhite);

      this.board[from.row][from.col] = piece;
      this.board[to.row][to.col] = originalPiece;

      return !inCheck;
   }

   isLegalDrop(pos: Position, piece: string): boolean {
      if (this.board[pos.row][pos.col] !== null) return false;

      const isWhite = this.turn === Color.WHITE;
      if ((this.turn === Color.WHITE) !== (piece === piece.toUpperCase()))
         return false;

      if (
         piece.toUpperCase() === PieceType.PAWN &&
         (pos.row === Rank.ONE || pos.row === Rank.EIGHT)
      ) {
         return false;
      }

      const finalPiece = isWhite ? piece.toUpperCase() : piece.toLowerCase();
      this.board[pos.row][pos.col] = finalPiece as Piece;

      const inCheck = this.isInCheck(isWhite);

      this.board[pos.row][pos.col] = null;

      return !inCheck;
   }

   move(action: Move): MoveResult {
      if (action.type === "drop") {
         return this.dropPiece(action.to, action.piece);
      } else {
         return this.movePiece(action.from, action.to);
      }
   }

   dropPiece(pos: Position, piece: Piece): MoveResult {
      if (!this.isLegalDrop(pos, piece)) {
         return { success: false, capturedPiece: null };
      }

      const finalPiece =
         this.turn === Color.WHITE ? piece.toUpperCase() : piece.toLowerCase();
      this.board[pos.row][pos.col] = finalPiece as Piece;

      const pocket =
         this.turn === Color.WHITE ? this.whitePocket : this.blackPocket;
      const idx = pocket.indexOf(piece.toUpperCase() as Piece);
      if (idx > -1) pocket.splice(idx, 1);

      this.turn = this.turn === Color.WHITE ? Color.BLACK : Color.WHITE;
      return { success: true, capturedPiece: null };
   }

   movePiece(from: Position, to: Position): MoveResult {
      const piece = this.board[from.row][from.col];
      if (!piece || !this.isLegalMove(from, to)) {
         return { success: false, capturedPiece: null };
      }

      const captured = this.board[to.row][to.col];

      this.board[to.row][to.col] = piece;
      this.board[from.row][from.col] = null;

      if (
         piece.toUpperCase() === PieceType.PAWN &&
         (to.row === Rank.ONE || to.row === Rank.EIGHT)
      ) {
         this.board[to.row][to.col] = (
            this.turn === Color.WHITE
               ? PieceType.QUEEN
               : PieceType.QUEEN.toLowerCase()
         ) as Piece;
      }

      this.turn = this.turn === Color.WHITE ? Color.BLACK : Color.WHITE;

      return { success: true, capturedPiece: captured };
   }

   isCheckmate(): Color | null {
      // Check if current player (whose turn it is) is in checkmate
      const currentPlayerIsWhite = this.turn === Color.WHITE;

      // Must be in check to be in checkmate
      if (!this.isInCheck(currentPlayerIsWhite)) {
         return null;
      }

      // Try all possible moves for the current player
      for (let fromRow = 0; fromRow < 8; fromRow++) {
         for (let fromCol = 0; fromCol < 8; fromCol++) {
            const piece = this.board[fromRow][fromCol];
            if (!piece || this.isWhitePiece(piece) !== currentPlayerIsWhite) {
               continue;
            }

            // Try moving this piece to all squares
            for (let toRow = 0; toRow < 8; toRow++) {
               for (let toCol = 0; toCol < 8; toCol++) {
                  const from = createPosition(fromRow, fromCol);
                  const to = createPosition(toRow, toCol);

                  if (this.isLegalMove(from, to)) {
                     // Found a legal move, not checkmate
                     return null;
                  }
               }
            }
         }
      }

      // Try dropping a queen (as test piece) on all squares
      const testPiece = (
         currentPlayerIsWhite ? PieceType.QUEEN : PieceType.QUEEN.toLowerCase()
      ) as Piece;
      for (let row = 0; row < 8; row++) {
         for (let col = 0; col < 8; col++) {
            const pos = createPosition(row, col);
            if (this.isLegalDrop(pos, testPiece)) {
               // Found a legal drop, not checkmate
               return null;
            }
         }
      }

      // No legal moves or drops available while in check = checkmate
      return this.turn;
   }

   reset(): void {
      this.board = Array(8)
         .fill(null)
         .map(() => Array(8).fill(null));
      this.whitePocket = [];
      this.blackPocket = [];
      this.turn = Color.WHITE;
      this.initializeBoard();
   }
}

// Red: White unflipped & Black flipped
// Blue: White flipped & Black unflipped
export enum Team {
   RED = "red",
   BLUE = "blue",
}

export enum Color {
   WHITE = "white",
   BLACK = "black",
}

export enum Rank {
   ONE = 0,
   TWO = 1,
   THREE = 2,
   FOUR = 3,
   FIVE = 4,
   SIX = 5,
   SEVEN = 6,
   EIGHT = 7,
}

export enum File {
   A = 0,
   B = 1,
   C = 2,
   D = 3,
   E = 4,
   F = 5,
   G = 6,
   H = 7,
}

export interface Position {
   readonly row: Rank;
   readonly col: File;
}

export enum PieceType {
   KING = "K",
   QUEEN = "Q",
   ROOK = "R",
   BISHOP = "B",
   KNIGHT = "N",
   PAWN = "P",
}

export type Piece =
   | PieceType.KING
   | PieceType.QUEEN
   | PieceType.ROOK
   | PieceType.BISHOP
   | PieceType.KNIGHT
   | PieceType.PAWN
   | Lowercase<PieceType>;

export type Board = (Piece | null)[][];

interface MoveAction {
   type: "move";
   from: Position;
   to: Position;
}

interface DropAction {
   type: "drop";
   piece: Piece;
   to: Position;
}

export type Move = MoveAction | DropAction;

export interface MoveResult {
   success: boolean;
   capturedPiece: Piece | null;
}

export function serializeMove(move: Move): any {
   if (move.type === "move") {
      return {
         type: "move",
         from: serializePosition(move.from),
         to: serializePosition(move.to),
      };
   } else {
      return {
         type: "drop",
         piece: move.piece,
         to: serializePosition(move.to),
      };
   }
}

export function deserializeMove(data: any): Move {
   if (data.type === "move") {
      return {
         type: "move",
         from: deserializePosition(data.from),
         to: deserializePosition(data.to),
      };
   } else {
      return {
         type: "drop",
         piece: data.piece,
         to: deserializePosition(data.to),
      };
   }
}

export function serializeColor(color: Color): string {
   return color;
}

export function deserializeColor(data: string): Color {
   if (data === Color.WHITE || data === Color.BLACK) {
      return data;
   }
   throw new Error(`Invalid color: ${data}`);
}

export function createPosition(row: number, col: number): Position {
   return { row: row as Rank, col: col as File };
}

export function serializePosition(pos: Position): [number, number] {
   return [pos.row, pos.col];
}

export function deserializePosition(data: [number, number]): Position {
   return createPosition(data[0], data[1]);
}
