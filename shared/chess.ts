export interface SerializedChess {
   board: Board;
   whitePocket: Record<PieceType, number>;
   blackPocket: Record<PieceType, number>;
   turn: Color;
   whiteCastleShort: boolean;
   whiteCastleLong: boolean;
   blackCastleShort: boolean;
   blackCastleLong: boolean;
   enPassantTarget: Position | undefined;
}

export class Chess {
   board: Board = [];
   whitePocket: Map<PieceType, number> = new Map();
   blackPocket: Map<PieceType, number> = new Map();
   turn: Color = Color.WHITE;
   whiteCastleShort: boolean = true;
   whiteCastleLong: boolean = true;
   blackCastleShort: boolean = true;
   blackCastleLong: boolean = true;
   enPassantTarget: Position | undefined = undefined;

   constructor() {
      this.reset();
   }

   clone(): Chess {
      const chess = new Chess();
      chess.board = this.board.map((row) => [...row]);
      chess.whitePocket = new Map(this.whitePocket);
      chess.blackPocket = new Map(this.blackPocket);
      chess.turn = this.turn;
      chess.whiteCastleShort = this.whiteCastleShort;
      chess.whiteCastleLong = this.whiteCastleLong;
      chess.blackCastleShort = this.blackCastleShort;
      chess.blackCastleLong = this.blackCastleLong;
      chess.enPassantTarget = this.enPassantTarget;
      return chess;
   }

   serialize(): SerializedChess {
      return {
         board: this.board,
         whitePocket: Object.fromEntries(this.whitePocket) as Record<
            PieceType,
            number
         >,
         blackPocket: Object.fromEntries(this.blackPocket) as Record<
            PieceType,
            number
         >,
         turn: this.turn,
         whiteCastleShort: this.whiteCastleShort,
         whiteCastleLong: this.whiteCastleLong,
         blackCastleShort: this.blackCastleShort,
         blackCastleLong: this.blackCastleLong,
         enPassantTarget: this.enPassantTarget,
      };
   }

   static deserialize(data: SerializedChess): Chess {
      const chess = new Chess();
      chess.board = data.board;
      chess.whitePocket = new Map();
      for (const [key, value] of Object.entries(data.whitePocket))
         chess.whitePocket.set(key as PieceType, value);

      chess.blackPocket = new Map();
      for (const [key, value] of Object.entries(data.blackPocket))
         chess.blackPocket.set(key as PieceType, value);

      chess.turn = data.turn;
      chess.whiteCastleShort = data.whiteCastleShort;
      chess.whiteCastleLong = data.whiteCastleLong;
      chess.blackCastleShort = data.blackCastleShort;
      chess.blackCastleLong = data.blackCastleLong;
      chess.enPassantTarget = data.enPassantTarget;
      return chess;
   }

   reset(): void {
      this.whitePocket = new Map();
      this.blackPocket = new Map();
      this.turn = Color.WHITE;
      this.whiteCastleShort = true;
      this.whiteCastleLong = true;
      this.blackCastleShort = true;
      this.blackCastleLong = true;
      this.enPassantTarget = undefined;
      this.board = createEmptyBoard();

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

      for (let index = 0; index < 8; index++) {
         this.board[0][index] = { type: backRank[index], color: Color.BLACK };
         this.board[1][index] = { type: PieceType.PAWN, color: Color.BLACK };
         this.board[6][index] = { type: PieceType.PAWN, color: Color.WHITE };
         this.board[7][index] = { type: backRank[index], color: Color.WHITE };
      }

      this.whitePocket = new Map();
      this.blackPocket = new Map();
   }

   getPocket(color: Color): Map<PieceType, number> {
      return color ? this.whitePocket : this.blackPocket;
   }

   getPiece(pos: Position): Piece | undefined {
      if (pos.loc === "board") return this.board[pos.row][pos.col];
      else {
         const pocket = this.getPocket(pos.color);
         const count = pocket.get(pos.type) || 0;
         if (count > 0) return { type: pos.type, color: pos.color };

         return undefined;
      }
   }

   addToPocket(piece: Piece): void {
      const pocket = this.getPocket(piece.color);
      const typeToAdd =
         piece.type === PieceType.PROMOTED_QUEEN ? PieceType.PAWN : piece.type;
      pocket.set(typeToAdd, (pocket.get(typeToAdd) || 0) + 1);
   }

   removeFromPocket(pieceType: PieceType, color: Color): boolean {
      const pocket = this.getPocket(color);
      const count = pocket.get(pieceType) || 0;
      if (count > 0) {
         pocket.set(pieceType, count - 1);
         if (count - 1 === 0) pocket.delete(pieceType);

         return true;
      }

      return false;
   }

   findKing(color: Color): Position | undefined {
      for (let row = 0; row < 8; row++)
         for (let col = 0; col < 8; col++) {
            const piece = this.board[row][col];
            if (piece && piece.type === PieceType.KING && piece.color === color)
               return { loc: "board", row, col };
         }

      return undefined;
   }

   isSquareAttacked(pos: Position, color: Color): boolean {
      if (pos.loc !== "board") return false;

      for (let row = 0; row < 8; row++)
         for (let col = 0; col < 8; col++) {
            const piece = this.board[row][col];
            if (
               piece &&
               piece.color === color &&
               this.canPieceAttack({ loc: "board", row, col }, pos)
            )
               return true;
         }

      return false;
   }

   canPieceAttack(from: Position, to: Position): boolean {
      if (from.loc !== "board" || to.loc !== "board") return false;

      const piece = this.board[from.row][from.col];
      if (!piece) return false;

      switch (piece.type) {
         case PieceType.PAWN: {
            const direction = piece.color ? -1 : 1;
            return (
               Math.abs(from.col - to.col) === 1 &&
               to.row - from.row === direction
            );
         }

         case PieceType.KNIGHT: {
            const dr = Math.abs(from.row - to.row);
            const dc = Math.abs(from.col - to.col);
            return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
         }

         case PieceType.BISHOP: {
            return this.isDiagonalPath(from, to);
         }
         case PieceType.ROOK: {
            return this.isStraightPath(from, to);
         }
         case PieceType.PROMOTED_QUEEN:
         case PieceType.QUEEN: {
            return (
               this.isDiagonalPath(from, to) || this.isStraightPath(from, to)
            );
         }
         case PieceType.KING: {
            return (
               Math.abs(from.row - to.row) <= 1 &&
               Math.abs(from.col - to.col) <= 1
            );
         }
         default: {
            return false;
         }
      }
   }

   isInCheck(color: Color): boolean {
      const kingPos = this.findKing(color);
      if (!kingPos) return false;
      return this.isSquareAttacked(kingPos, color ? Color.BLACK : Color.WHITE);
   }

   isPathClear(from: Position, to: Position): boolean {
      if (from.loc !== "board" || to.loc !== "board") return false;

      const rowStep = to.row > from.row ? 1 : to.row < from.row ? -1 : 0;
      const colStep = to.col > from.col ? 1 : to.col < from.col ? -1 : 0;

      let currentRow = from.row + rowStep;
      let currentCol = from.col + colStep;

      while (currentRow !== to.row || currentCol !== to.col) {
         if (this.board[currentRow][currentCol] !== null) return false;

         currentRow += rowStep;
         currentCol += colStep;
      }

      return true;
   }

   isDiagonalPath(from: Position, to: Position): boolean {
      if (from.loc !== "board" || to.loc !== "board") return false;

      if (Math.abs(from.row - to.row) !== Math.abs(from.col - to.col))
         return false;
      return this.isPathClear(from, to);
   }

   isStraightPath(from: Position, to: Position): boolean {
      if (from.loc !== "board" || to.loc !== "board") return false;

      if (from.row !== to.row && from.col !== to.col) return false;
      return this.isPathClear(from, to);
   }

   canCastle(color: Color, side: CastleMove): boolean {
      const row = color ? 7 : 0;
      const kingCol = 4;
      const rookCol = side === CastleMove.SHORT ? 7 : 0;

      // Check if castling rights exist
      if (color) {
         if (side === CastleMove.SHORT && !this.whiteCastleShort) return false;
         if (side === CastleMove.LONG && !this.whiteCastleLong) return false;
      } else {
         if (side === CastleMove.SHORT && !this.blackCastleShort) return false;
         if (side === CastleMove.LONG && !this.blackCastleLong) return false;
      }

      // Check if king and rook are in correct positions
      const king = this.board[row][kingCol];
      const rook = this.board[row][rookCol];

      if (!king || king.type !== PieceType.KING || king.color !== color)
         return false;

      if (!rook || rook.type !== PieceType.ROOK || rook.color !== color)
         return false;

      // Check if king is in check
      if (this.isInCheck(color)) return false;

      // Check if squares between king and rook are empty
      const start = Math.min(kingCol, rookCol) + 1;
      const end = Math.max(kingCol, rookCol);
      for (let col = start; col < end; col++)
         if (this.board[row][col] !== null) return false;

      // Check if squares the king passes through are not under attack
      const enemyColor = invertColor(color);
      const kingDestinationCol = side === CastleMove.SHORT ? 6 : 2;
      const step = side === CastleMove.SHORT ? 1 : -1;

      for (let col = kingCol; col !== kingDestinationCol + step; col += step)
         if (this.isSquareAttacked({ loc: "board", row, col }, enemyColor))
            return false;

      return true;
   }

   isCastlingMove(from: Position, to: Position): boolean {
      if (from.loc !== "board" || to.loc !== "board") return false;

      const piece = this.board[from.row][from.col];
      if (!piece || piece.type !== PieceType.KING) return false;

      // King moving 2 squares horizontally is castling
      return Math.abs(from.col - to.col) === 2 && from.row === to.row;
   }

   isEnPassantMove(from: Position, to: Position): boolean {
      if (from.loc !== "board" || to.loc !== "board") return false;
      if (!this.enPassantTarget || this.enPassantTarget.loc !== "board")
         return false;

      const piece = this.board[from.row][from.col];
      if (!piece || piece.type !== PieceType.PAWN) return false;

      // Check if moving to the en passant target square
      return (
         to.row === this.enPassantTarget.row &&
         to.col === this.enPassantTarget.col
      );
   }

   isLegalMove(from: Position, to: Position): boolean {
      if (from.loc !== "board" || to.loc !== "board") return false;

      const piece = this.board[from.row][from.col];
      if (!piece) return false;

      if (this.turn !== piece.color) return false;

      const targetPiece = this.board[to.row][to.col];
      if (targetPiece && targetPiece.color === piece.color) return false;

      const direction = piece.color ? -1 : 1;
      let isValid = false;

      switch (piece.type) {
         case PieceType.PAWN: {
            if (from.col === to.col) {
               if (to.row - from.row === direction && !targetPiece)
                  isValid = true;
               else if (to.row - from.row === 2 * direction && !targetPiece) {
                  const startRow = piece.color ? 6 : 1;
                  if (from.row === startRow && this.isPathClear(from, to))
                     isValid = true;
               }
            } else if (
               Math.abs(from.col - to.col) === 1 &&
               to.row - from.row === direction
            )
               if (targetPiece)
                  // Regular capture or en passant
                  isValid = true;
               else if (this.isEnPassantMove(from, to)) isValid = true;

            break;
         }
         case PieceType.KNIGHT: {
            const dr = Math.abs(from.row - to.row);
            const dc = Math.abs(from.col - to.col);
            isValid = (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
            break;
         }

         case PieceType.BISHOP: {
            isValid = this.isDiagonalPath(from, to);
            break;
         }
         case PieceType.ROOK: {
            isValid = this.isStraightPath(from, to);
            break;
         }
         case PieceType.PROMOTED_QUEEN:
         case PieceType.QUEEN: {
            isValid =
               this.isDiagonalPath(from, to) || this.isStraightPath(from, to);
            break;
         }
         case PieceType.KING: {
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
      }

      if (!isValid) return false;

      // Simulate the move to check if it leaves the king in check
      const originalPiece = this.board[to.row][to.col];
      let capturedEnPassantPiece: Piece | undefined;

      // Handle en passant capture in simulation
      if (piece.type === PieceType.PAWN && this.isEnPassantMove(from, to)) {
         const captureRow = from.row;
         const captureCol = to.col;
         capturedEnPassantPiece = this.board[captureRow][captureCol];
         this.board[captureRow][captureCol] = undefined;
      }

      this.board[to.row][to.col] = piece;
      this.board[from.row][from.col] = undefined;

      const inCheck = this.isInCheck(piece.color);

      // Restore board state
      this.board[from.row][from.col] = piece;
      this.board[to.row][to.col] = originalPiece;

      if (capturedEnPassantPiece) {
         const captureRow = from.row;
         const captureCol = to.col;
         this.board[captureRow][captureCol] = capturedEnPassantPiece;
      }

      return !inCheck;
   }

   isLegalDrop(pos: Position, pieceType: PieceType, color: Color): boolean {
      if (pos.loc !== "board") return false;

      if (this.board[pos.row][pos.col] !== null) return false;

      if (this.turn !== color) return false;

      const pocket = this.getPocket(color);
      if ((pocket.get(pieceType) ?? 0) <= 0) return false;

      if (pieceType === PieceType.PAWN && (pos.row === 0 || pos.row === 7))
         return false;

      this.board[pos.row][pos.col] = { type: pieceType, color };

      const inCheck = this.isInCheck(color);

      this.board[pos.row][pos.col] = undefined;

      return !inCheck;
   }

   move(action: Move, premove = false): MoveResult {
      if (action.to.loc === "pocket")
         return { success: false, capturedPiece: undefined };

      return action.from.loc === "pocket"
         ? this.dropPiece(action.from, action.to, premove)
         : this.movePiece(action.from, action.to, premove);
   }

   dropPiece(
      from: PocketPosition,
      to: BoardPosition,
      premove = false
   ): MoveResult {
      if (
         premove
            ? !this.isLegalPredrop(from, to)
            : !this.isLegalDrop(to, from.type, from.color)
      )
         return { success: false, capturedPiece: undefined };

      this.board[to.row][to.col] = {
         type: from.type,
         color: from.color,
      };

      this.removeFromPocket(from.type, from.color);
      this.enPassantTarget = undefined;

      if (!premove) this.turn = invertColor(this.turn);
      return { success: true, capturedPiece: undefined };
   }

   movePiece(
      from: BoardPosition,
      to: BoardPosition,
      premove = false
   ): MoveResult {
      if (
         premove ? !this.isLegalPremove(from, to) : !this.isLegalMove(from, to)
      )
         return { success: false, capturedPiece: undefined };

      const piece = this.board[from.row][from.col];

      if (!piece) return { success: false, capturedPiece: undefined };

      let captured =
         this.board[to.row][to.col]?.type === PieceType.PROMOTED_QUEEN
            ? {
                 type: PieceType.PAWN,
                 color: piece.color,
              }
            : this.board[to.row][to.col];

      // Handle en passant capture
      if (piece.type === PieceType.PAWN && this.isEnPassantMove(from, to)) {
         const captureRow = from.row;
         const captureCol = to.col;
         captured = this.board[captureRow][captureCol];
         this.board[captureRow][captureCol] = undefined;
      }

      // Handle castling
      if (piece.type === PieceType.KING && this.isCastlingMove(from, to)) {
         const row = from.row;
         const side = to.col > from.col ? CastleMove.SHORT : CastleMove.LONG;
         const rookFromCol = side === CastleMove.SHORT ? 7 : 0;
         const rookToCol = side === CastleMove.SHORT ? 5 : 3;

         // Move king
         this.board[to.row][to.col] = piece;
         this.board[from.row][from.col] = undefined;

         // Move rook
         const rook = this.board[row][rookFromCol];
         this.board[row][rookToCol] = rook;
         this.board[row][rookFromCol] = undefined;
      } else {
         // Normal move
         this.board[to.row][to.col] = piece;
         this.board[from.row][from.col] = undefined;
      }

      // Set en passant target if pawn moved two squares
      if (piece.type === PieceType.PAWN && Math.abs(to.row - from.row) === 2) {
         const enPassantRow = (from.row + to.row) / 2;
         this.enPassantTarget = {
            loc: "board",
            row: enPassantRow,
            col: to.col,
         };
      } else this.enPassantTarget = undefined;

      // Pawn promotion - use PROMOTED_QUEEN instead of QUEEN
      if (piece.type === PieceType.PAWN && (to.row === 0 || to.row === 7))
         this.board[to.row][to.col] = {
            type: PieceType.PROMOTED_QUEEN,
            color: piece.color,
         };

      // Update castling rights
      if (piece.type === PieceType.KING)
         if (piece.color) {
            this.whiteCastleShort = false;
            this.whiteCastleLong = false;
         } else {
            this.blackCastleShort = false;
            this.blackCastleLong = false;
         }

      if (piece.type === PieceType.ROOK)
         if (piece.color) {
            if (from.row === 7 && from.col === 7) this.whiteCastleShort = false;
            else if (from.row === 7 && from.col === 0)
               this.whiteCastleLong = false;
         } else if (from.row === 0 && from.col === 7)
            this.blackCastleShort = false;
         else if (from.row === 0 && from.col === 0)
            this.blackCastleLong = false;

      // If a rook is captured, remove castling rights
      if (captured && captured.type === PieceType.ROOK)
         if (captured.color === Color.WHITE) {
            if (to.row === 7 && to.col === 7) this.whiteCastleShort = false;
            else if (to.row === 7 && to.col === 0) this.whiteCastleLong = false;
         } else if (to.row === 0 && to.col === 7) this.blackCastleShort = false;
         else if (to.row === 0 && to.col === 0) this.blackCastleLong = false;

      if (!premove) this.turn = invertColor(this.turn);
      return { success: true, capturedPiece: captured };
   }

   isLegalPremove(from: BoardPosition, to: BoardPosition): boolean {
      // Handle regular moves

      const piece = this.board[from.row][from.col];
      if (!piece) return false;

      const direction = piece.color === Color.WHITE ? -1 : 1;

      switch (piece.type) {
         case PieceType.PAWN: {
            // Forward moves
            if (from.col === to.col) {
               // One square forward
               if (to.row - from.row === direction) return true;

               // Two squares forward from starting position
               if (to.row - from.row === 2 * direction) {
                  const startRow = piece.color === Color.WHITE ? 6 : 1;
                  return from.row === startRow;
               }

               return false;
            }

            // Diagonal captures (premove assumes there will be something to capture)
            if (
               Math.abs(from.col - to.col) === 1 &&
               to.row - from.row === direction
            )
               return true;

            return false;
         }

         case PieceType.KNIGHT: {
            const dr = Math.abs(from.row - to.row);
            const dc = Math.abs(from.col - to.col);
            return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
         }

         case PieceType.BISHOP: {
            return (
               Math.abs(from.row - to.row) === Math.abs(from.col - to.col) &&
               from.row !== to.row
            );
         }

         case PieceType.ROOK: {
            return (
               (from.row === to.row || from.col === to.col) &&
               !(from.row === to.row && from.col === to.col)
            );
         }

         case PieceType.PROMOTED_QUEEN:
         case PieceType.QUEEN: {
            const isDiagonal =
               Math.abs(from.row - to.row) === Math.abs(from.col - to.col);
            const isStraight = from.row === to.row || from.col === to.col;
            const notSameSquare = !(from.row === to.row && from.col === to.col);
            return (isDiagonal || isStraight) && notSameSquare;
         }

         case PieceType.KING: {
            const rowDiff = Math.abs(from.row - to.row);
            const colDiff = Math.abs(from.col - to.col);

            if (rowDiff <= 1 && colDiff <= 1 && rowDiff + colDiff > 0)
               return true;

            // Castling (king moves 2 squares horizontally on home rank)
            if (from.row === to.row && Math.abs(from.col - to.col) === 2) {
               // Must be on home rank
               const homeRank = piece.color === Color.WHITE ? 7 : 0;
               if (from.row !== homeRank || from.col !== 4) return false;

               // Check castling rights
               const side =
                  to.col > from.col ? CastleMove.SHORT : CastleMove.LONG;
               if (piece.color === Color.WHITE) {
                  if (
                     side === CastleMove.SHORT &&
                     !this.whiteCastleShort &&
                     to.col > from.col
                  )
                     return false;
                  if (
                     side === CastleMove.LONG &&
                     !this.whiteCastleLong &&
                     to.col < from.col
                  )
                     return false;
               } else {
                  if (
                     side === CastleMove.SHORT &&
                     !this.blackCastleShort &&
                     to.col < from.col
                  )
                     return false;
                  if (
                     side === CastleMove.LONG &&
                     !this.blackCastleLong &&
                     to.col > from.col
                  )
                     return false;
               }

               return true;
            }

            return false;
         }

         default: {
            return false;
         }
      }
   }

   isLegalPredrop(from: PocketPosition, to: Position): boolean {
      if (to.loc !== "board") return false;

      // Square must be empty (we check current state for this)
      if (this.board[to.row][to.col] !== null) return false;

      // Check if piece is in pocket
      const pocket = this.getPocket(from.color);
      if ((pocket.get(from.type) ?? 0) <= 0) return false;

      // Pawns can't be dropped on back rank
      if (from.type === PieceType.PAWN && (to.row === 0 || to.row === 7))
         return false;

      return true;
   }

   isCheckmate(): Color | undefined {
      if (!this.isInCheck(this.turn)) return undefined;

      // Try all possible moves for the current player
      for (let fromRow = 0; fromRow < 8; fromRow++)
         for (let fromCol = 0; fromCol < 8; fromCol++) {
            const piece = this.board[fromRow][fromCol];
            if (!piece || piece.color !== this.turn) continue;

            // Try moving this piece to all squares
            for (let toRow = 0; toRow < 8; toRow++)
               for (let toCol = 0; toCol < 8; toCol++) {
                  const from: Position = {
                     loc: "board",
                     row: fromRow,
                     col: fromCol,
                  };
                  const to: Position = {
                     loc: "board",
                     row: toRow,
                     col: toCol,
                  };

                  if (this.isLegalMove(from, to))
                     // Found a legal move, not checkmate
                     return undefined;
               }
         }

      // Try dropping pieces from pocket on all squares
      const pocket = this.getPocket(this.turn);
      for (const [pieceType, count] of pocket.entries())
         if (count > 0)
            for (let row = 0; row < 8; row++)
               for (let col = 0; col < 8; col++) {
                  const pos: Position = { loc: "board", row, col };
                  if (this.isLegalDrop(pos, pieceType, this.turn))
                     // Found a legal drop, not checkmate
                     return undefined;
               }

      return this.turn;
   }
}

export enum Color {
   WHITE = 1,
   BLACK = 0,
}

export function invertColor(color: Color): Color {
   return color ? Color.BLACK : Color.WHITE;
}

export interface BoardPosition {
   loc: "board";
   row: number;
   col: number;
}

export interface PocketPosition {
   loc: "pocket";
   color: Color;
   type: PieceType;
}

export type Position = BoardPosition | PocketPosition;

export function createPosition(row: number, col: number): BoardPosition;
export function createPosition(color: Color, type: PieceType): PocketPosition;
export function createPosition(
   a: number | Color,
   b: number | PieceType
): Position {
   return typeof b === "number"
      ? { loc: "board", row: a, col: b as number }
      : { loc: "pocket", color: a, type: b as PieceType };
}

export function positionsEqual(a: Position, b: Position): boolean {
   if (a.loc !== b.loc) return false;

   if (a.loc === "board" && b.loc === "board")
      return a.row === b.row && a.col === b.col;

   if (a.loc === "pocket" && b.loc === "pocket")
      return a.color === b.color && a.type === b.type;

   return false;
}

export enum PieceType {
   KING = "K",
   QUEEN = "Q",
   ROOK = "R",
   BISHOP = "B",
   KNIGHT = "N",
   PAWN = "P",
   PROMOTED_QUEEN = "Q+",
}

export interface Piece {
   type: PieceType;
   color: Color;
}

export type Board = (Piece | undefined)[][];

function createEmptyBoard(): Board {
   const board: Board = [];
   for (let row = 0; row < 8; row++) {
      board[row] = [];
      for (let col = 0; col < 8; col++) {
         board[row][col] = undefined;
      }
   }
   return board;
}

export interface Move {
   from: Position;
   to: Position;
}

export interface MoveResult {
   success: boolean;
   capturedPiece: Piece | undefined;
}

export enum CastleMove {
   LONG = "long",
   SHORT = "short",
}
