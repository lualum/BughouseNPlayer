export class Chess {
   board: Board;
   whitePocket: Map<PieceType, number>;
   blackPocket: Map<PieceType, number>;
   turn: Color;
   whiteCastleShort: boolean;
   whiteCastleLong: boolean;
   blackCastleShort: boolean;
   blackCastleLong: boolean;

   constructor() {
      this.board = Array(8)
         .fill(null)
         .map(() => Array(8).fill(null));
      this.whitePocket = new Map();
      this.blackPocket = new Map();
      this.turn = Color.WHITE;
      this.whiteCastleShort = true;
      this.whiteCastleLong = true;
      this.blackCastleShort = true;
      this.blackCastleLong = true;
      this.initializeBoard();
   }

   serialize(): any {
      return {
         board: this.board.map((row) =>
            row.map((piece) =>
               piece ? { type: piece.type, color: piece.color } : null
            )
         ),
         whitePocket: Object.fromEntries(this.whitePocket),
         blackPocket: Object.fromEntries(this.blackPocket),
         turn: this.turn,
         whiteCanCastleKingside: this.whiteCastleShort,
         whiteCanCastleQueenside: this.whiteCastleLong,
         blackCanCastleKingside: this.blackCastleShort,
         blackCanCastleQueenside: this.blackCastleLong,
      };
   }

   static deserialize(data: any): Chess {
      const chess = new Chess();
      chess.board = data.board.map((row: any[]) =>
         row.map((piece) =>
            piece ? { type: piece.type, color: piece.color } : null
         )
      );

      chess.whitePocket = new Map();
      for (const [key, value] of Object.entries(data.whitePocket)) {
         chess.whitePocket.set(key as PieceType, value as number);
      }

      chess.blackPocket = new Map();
      for (const [key, value] of Object.entries(data.blackPocket)) {
         chess.blackPocket.set(key as PieceType, value as number);
      }

      chess.turn = data.turn;
      chess.whiteCastleShort = data.whiteCanCastleKingside ?? true;
      chess.whiteCastleLong = data.whiteCanCastleQueenside ?? true;
      chess.blackCastleShort = data.blackCanCastleKingside ?? true;
      chess.blackCastleLong = data.blackCanCastleQueenside ?? true;
      return chess;
   }

   initializeBoard(): void {
      const backRank: PieceType[] = [
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
         this.board[0][i] = { type: backRank[i], color: Color.BLACK };
         this.board[1][i] = { type: PieceType.PAWN, color: Color.BLACK };
         this.board[6][i] = { type: PieceType.PAWN, color: Color.WHITE };
         this.board[7][i] = { type: backRank[i], color: Color.WHITE };
      }

      this.whitePocket = new Map();
      this.blackPocket = new Map();
   }

   getPocket(color: Color): Map<PieceType, number> {
      return color === Color.WHITE ? this.whitePocket : this.blackPocket;
   }

   static invertPieceColor(piece: Piece): Piece {
      return {
         type: piece.type,
         color: piece.color === Color.WHITE ? Color.BLACK : Color.WHITE,
      };
   }

   getPiece(pos: Position): Piece | null {
      if (pos.type === "board") {
         return this.board[pos.row][pos.col];
      } else {
         const pocket = this.getPocket(pos.color);
         const count = pocket.get(pos.pieceType) || 0;
         if (count > 0) {
            return { type: pos.pieceType, color: pos.color };
         }
         return null;
      }
   }

   addToPocket(piece: Piece): void {
      const pocket = this.getPocket(piece.color);
      pocket.set(piece.type, (pocket.get(piece.type) || 0) + 1);
   }

   removeFromPocket(pieceType: PieceType, color: Color): boolean {
      const pocket = this.getPocket(color);
      const count = pocket.get(pieceType) || 0;
      if (count > 0) {
         pocket.set(pieceType, count - 1);
         if (count - 1 === 0) {
            pocket.delete(pieceType);
         }
         return true;
      }
      return false;
   }

   findKing(color: Color): Position | null {
      for (let row = 0; row < 8; row++) {
         for (let col = 0; col < 8; col++) {
            const piece = this.board[row][col];
            if (
               piece &&
               piece.type === PieceType.KING &&
               piece.color === color
            ) {
               return { type: "board", row, col };
            }
         }
      }
      return null;
   }

   isSquareAttacked(pos: Position, color: Color): boolean {
      if (pos.type !== "board") return false;

      for (let row = 0; row < 8; row++) {
         for (let col = 0; col < 8; col++) {
            const piece = this.board[row][col];
            if (
               piece &&
               piece.color === color &&
               this.canPieceAttack({ type: "board", row, col }, pos)
            ) {
               return true;
            }
         }
      }
      return false;
   }

   canPieceAttack(from: Position, to: Position): boolean {
      if (from.type !== "board" || to.type !== "board") return false;

      const piece = this.board[from.row][from.col];
      if (!piece) return false;

      switch (piece.type) {
         case PieceType.PAWN:
            const direction = piece.color === Color.WHITE ? -1 : 1;
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

   isInCheck(color: Color): boolean {
      const kingPos = this.findKing(color);
      if (!kingPos) return false;
      return this.isSquareAttacked(
         kingPos,
         color === Color.WHITE ? Color.BLACK : Color.WHITE
      );
   }

   isPathClear(from: Position, to: Position): boolean {
      if (from.type !== "board" || to.type !== "board") return false;

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
      if (from.type !== "board" || to.type !== "board") return false;

      if (Math.abs(from.row - to.row) !== Math.abs(from.col - to.col))
         return false;
      return this.isPathClear(from, to);
   }

   isStraightPath(from: Position, to: Position): boolean {
      if (from.type !== "board" || to.type !== "board") return false;

      if (from.row !== to.row && from.col !== to.col) return false;
      return this.isPathClear(from, to);
   }

   canCastle(color: Color, side: CastleMove): boolean {
      const row = color === Color.WHITE ? 7 : 0;
      const kingCol = 4;
      const rookCol = side === CastleMove.SHORT ? 7 : 0;

      // Check if castling rights exist
      if (color === Color.WHITE) {
         if (side === CastleMove.SHORT && !this.whiteCastleShort) return false;
         if (side === CastleMove.LONG && !this.whiteCastleLong) return false;
      } else {
         if (side === CastleMove.SHORT && !this.blackCastleShort) return false;
         if (side === CastleMove.LONG && !this.blackCastleLong) return false;
      }

      // Check if king and rook are in correct positions
      const king = this.board[row][kingCol];
      const rook = this.board[row][rookCol];

      if (!king || king.type !== PieceType.KING || king.color !== color) {
         return false;
      }
      if (!rook || rook.type !== PieceType.ROOK || rook.color !== color) {
         return false;
      }

      // Check if king is in check
      if (this.isInCheck(color)) return false;

      // Check if squares between king and rook are empty
      const start = Math.min(kingCol, rookCol) + 1;
      const end = Math.max(kingCol, rookCol);
      for (let col = start; col < end; col++) {
         if (this.board[row][col] !== null) return false;
      }

      // Check if squares the king passes through are not under attack
      const enemyColor = color === Color.WHITE ? Color.BLACK : Color.WHITE;
      const kingDestCol = side === CastleMove.SHORT ? 6 : 2;
      const step = side === CastleMove.SHORT ? 1 : -1;

      for (let col = kingCol; col !== kingDestCol + step; col += step) {
         if (this.isSquareAttacked({ type: "board", row, col }, enemyColor)) {
            return false;
         }
      }

      return true;
   }

   isCastlingMove(from: Position, to: Position): boolean {
      if (from.type !== "board" || to.type !== "board") return false;

      const piece = this.board[from.row][from.col];
      if (!piece || piece.type !== PieceType.KING) return false;

      // King moving 2 squares horizontally is castling
      return Math.abs(from.col - to.col) === 2 && from.row === to.row;
   }

   isLegalMove(from: Position, to: Position): boolean {
      if (from.type !== "board" || to.type !== "board") {
         return false;
      }

      const piece = this.board[from.row][from.col];
      if (!piece) return false;

      if (this.turn !== piece.color) return false;

      const targetPiece = this.board[to.row][to.col];
      if (targetPiece && targetPiece.color === piece.color) return false;

      const direction = piece.color === Color.WHITE ? -1 : 1;
      let isValid = false;

      switch (piece.type) {
         case PieceType.PAWN:
            if (from.col === to.col) {
               if (to.row - from.row === direction && !targetPiece) {
                  isValid = true;
               } else if (to.row - from.row === 2 * direction && !targetPiece) {
                  const startRow = piece.color === Color.WHITE ? 6 : 1;
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
            // Check for castling
            if (this.isCastlingMove(from, to)) {
               const side =
                  to.col > from.col ? CastleMove.SHORT : CastleMove.LONG;
               return this.canCastle(piece.color, side);
            }
            isValid =
               Math.abs(from.row - to.row) <= 1 &&
               Math.abs(from.col - to.col) <= 1;
            break;
      }

      if (!isValid) return false;

      const originalPiece = this.board[to.row][to.col];
      this.board[to.row][to.col] = piece;
      this.board[from.row][from.col] = null;

      const inCheck = this.isInCheck(piece.color);

      this.board[from.row][from.col] = piece;
      this.board[to.row][to.col] = originalPiece;

      return !inCheck;
   }

   isLegalDrop(pos: Position, pieceType: PieceType, color: Color): boolean {
      if (pos.type !== "board") return false;

      if (this.board[pos.row][pos.col] !== null) return false;

      if (this.turn !== color) return false;

      const pocket = this.getPocket(color);
      if (!pocket.has(pieceType) || pocket.get(pieceType)! <= 0) {
         return false;
      }

      if (pieceType === PieceType.PAWN && (pos.row === 0 || pos.row === 7)) {
         return false;
      }

      this.board[pos.row][pos.col] = { type: pieceType, color };

      const inCheck = this.isInCheck(color);

      this.board[pos.row][pos.col] = null;

      return !inCheck;
   }

   move(action: Move): MoveResult {
      if (action.from.type === "pocket") {
         return this.dropPiece(action.to, action.from);
      } else {
         return this.movePiece(action.from, action.to);
      }
   }

   dropPiece(pos: Position, from: PocketPosition): MoveResult {
      if (pos.type !== "board") {
         return { success: false, capturedPiece: null };
      }

      if (!this.isLegalDrop(pos, from.pieceType, from.color)) {
         return { success: false, capturedPiece: null };
      }

      this.board[pos.row][pos.col] = {
         type: from.pieceType,
         color: from.color,
      };

      this.removeFromPocket(from.pieceType, from.color);

      this.turn = this.turn === Color.WHITE ? Color.BLACK : Color.WHITE;
      return { success: true, capturedPiece: null };
   }

   movePiece(from: Position, to: Position): MoveResult {
      if (from.type !== "board" || to.type !== "board") {
         return { success: false, capturedPiece: null };
      }

      const piece = this.board[from.row][from.col];
      if (!piece || !this.isLegalMove(from, to)) {
         return { success: false, capturedPiece: null };
      }

      const captured = this.board[to.row][to.col];

      // Handle castling
      if (piece.type === PieceType.KING && this.isCastlingMove(from, to)) {
         const row = from.row;
         const side = to.col > from.col ? CastleMove.SHORT : CastleMove.LONG;
         const rookFromCol = side === CastleMove.SHORT ? 7 : 0;
         const rookToCol = side === CastleMove.SHORT ? 5 : 3;

         // Move king
         this.board[to.row][to.col] = piece;
         this.board[from.row][from.col] = null;

         // Move rook
         const rook = this.board[row][rookFromCol];
         this.board[row][rookToCol] = rook;
         this.board[row][rookFromCol] = null;
      } else {
         // Normal move
         this.board[to.row][to.col] = piece;
         this.board[from.row][from.col] = null;
      }

      // Pawn promotion
      if (piece.type === PieceType.PAWN && (to.row === 0 || to.row === 7)) {
         this.board[to.row][to.col] = {
            type: PieceType.QUEEN,
            color: piece.color,
         };
      }

      // Update castling rights
      if (piece.type === PieceType.KING) {
         if (piece.color === Color.WHITE) {
            this.whiteCastleShort = false;
            this.whiteCastleLong = false;
         } else {
            this.blackCastleShort = false;
            this.blackCastleLong = false;
         }
      }

      if (piece.type === PieceType.ROOK) {
         if (piece.color === Color.WHITE) {
            if (from.row === 7 && from.col === 7) {
               this.whiteCastleShort = false;
            } else if (from.row === 7 && from.col === 0) {
               this.whiteCastleLong = false;
            }
         } else {
            if (from.row === 0 && from.col === 7) {
               this.blackCastleShort = false;
            } else if (from.row === 0 && from.col === 0) {
               this.blackCastleLong = false;
            }
         }
      }

      // If a rook is captured, remove castling rights
      if (captured && captured.type === PieceType.ROOK) {
         if (captured.color === Color.WHITE) {
            if (to.row === 7 && to.col === 7) {
               this.whiteCastleShort = false;
            } else if (to.row === 7 && to.col === 0) {
               this.whiteCastleLong = false;
            }
         } else {
            if (to.row === 0 && to.col === 7) {
               this.blackCastleShort = false;
            } else if (to.row === 0 && to.col === 0) {
               this.blackCastleLong = false;
            }
         }
      }

      this.turn = this.turn === Color.WHITE ? Color.BLACK : Color.WHITE;

      return { success: true, capturedPiece: captured };
   }

   isCheckmate(): Color | null {
      if (!this.isInCheck(this.turn)) {
         return null;
      }

      // Try all possible moves for the current player
      for (let fromRow = 0; fromRow < 8; fromRow++) {
         for (let fromCol = 0; fromCol < 8; fromCol++) {
            const piece = this.board[fromRow][fromCol];
            if (!piece || piece.color !== this.turn) {
               continue;
            }

            // Try moving this piece to all squares
            for (let toRow = 0; toRow < 8; toRow++) {
               for (let toCol = 0; toCol < 8; toCol++) {
                  const from: Position = {
                     type: "board",
                     row: fromRow,
                     col: fromCol,
                  };
                  const to: Position = {
                     type: "board",
                     row: toRow,
                     col: toCol,
                  };

                  if (this.isLegalMove(from, to)) {
                     // Found a legal move, not checkmate
                     return null;
                  }
               }
            }
         }
      }

      // Try dropping pieces from pocket on all squares
      const pocket = this.getPocket(this.turn);
      for (const [pieceType, count] of pocket.entries()) {
         if (count > 0) {
            for (let row = 0; row < 8; row++) {
               for (let col = 0; col < 8; col++) {
                  const pos: Position = { type: "board", row, col };
                  if (this.isLegalDrop(pos, pieceType, this.turn)) {
                     // Found a legal drop, not checkmate
                     return null;
                  }
               }
            }
         }
      }

      return this.turn;
   }

   reset(): void {
      this.board = Array(8)
         .fill(null)
         .map(() => Array(8).fill(null));
      this.whitePocket = new Map();
      this.blackPocket = new Map();
      this.turn = Color.WHITE;
      this.whiteCastleShort = true;
      this.whiteCastleLong = true;
      this.blackCastleShort = true;
      this.blackCastleLong = true;
      this.initializeBoard();
   }
}

export enum Color {
   WHITE = "white",
   BLACK = "black",
}

export interface BoardPosition {
   type: "board";
   row: number;
   col: number;
}

export interface PocketPosition {
   type: "pocket";
   color: Color;
   pieceType: PieceType;
}

export type Position = BoardPosition | PocketPosition;

export enum PieceType {
   KING = "K",
   QUEEN = "Q",
   ROOK = "R",
   BISHOP = "B",
   KNIGHT = "N",
   PAWN = "P",
}

export interface Piece {
   type: PieceType;
   color: Color;
}

export type Board = (Piece | null)[][];

export interface Move {
   from: Position;
   to: Position;
}

export interface MoveResult {
   success: boolean;
   capturedPiece: Piece | null;
}

export enum CastleMove {
   LONG = "long",
   SHORT = "short",
}
