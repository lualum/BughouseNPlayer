import {
   BoardPosition,
   Chess,
   Color,
   Move,
   Piece,
   PieceType,
   PocketPosition,
   Position,
} from "../shared/chess";
import { RoomStatus } from "../shared/room";
import { session } from "./session";

const PIECE_IMAGES = {
   K: "/pieces/wk.png",
   Q: "/pieces/wq.png",
   R: "/pieces/wr.png",
   B: "/pieces/wb.png",
   N: "/pieces/wn.png",
   P: "/pieces/wp.png",
   k: "/pieces/bk.png",
   q: "/pieces/bq.png",
   r: "/pieces/br.png",
   b: "/pieces/bb.png",
   n: "/pieces/bn.png",
   p: "/pieces/bp.png",
};

interface DragState {
   boardID: number;
   position: Position;
   element: HTMLImageElement;
   piece: Piece;
}

let dragState: DragState | null = null;

// Utility Functions
function getBoardInstance(boardID: number): Chess {
   return session.room?.game.matches[boardID].chess!;
}

function createPosition(row: number, col: number): BoardPosition {
   return { type: "board", row, col };
}

function createPocketPosition(
   color: Color,
   pieceType: PieceType
): PocketPosition {
   return { type: "pocket", color, pieceType };
}

function getPieceImageKey(piece: Piece): string {
   const baseKey = piece.type;
   return piece.color === Color.WHITE
      ? baseKey.toUpperCase()
      : baseKey.toLowerCase();
}

function positionToString(position: Position): string {
   if (position.type === "pocket") {
      return `pocket(${position.color} ${position.pieceType})`;
   } else {
      return `board(row: ${position.row}, col: ${position.col})`;
   }
}

function getPositionFromElement(element: HTMLElement): Position {
   const isPocket = element.dataset.pocket === "true";

   if (isPocket) {
      return createPocketPosition(
         element.dataset.pieceColor as Color,
         element.dataset.pieceType as PieceType
      );
   } else {
      return createPosition(
         parseInt(element.dataset.row || "0"),
         parseInt(element.dataset.col || "0")
      );
   }
}

function getBoardID(element: HTMLElement): number {
   return parseInt(element.dataset.boardId || "0");
}

function isFlipped(boardID: number): boolean {
   return session.room?.game.matches[boardID]?.flipped || false;
}

// Board Element Creation
export function createBoardElement(boardID: number): HTMLDivElement {
   const board = document.createElement("div");
   board.id = `board-${boardID}`;
   board.className = "board";
   board.dataset.boardId = boardID.toString();

   for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
         const square = document.createElement("div");
         square.className = `square ${
            (row + col) % 2 === 0 ? "light" : "dark"
         }`;
         square.dataset.boardId = boardID.toString();
         square.dataset.row = row.toString();
         square.dataset.col = col.toString();

         // Add event listeners to squares
         square.addEventListener("mousedown", handleSquareMouseDown);

         board.appendChild(square);
      }
   }

   return board;
}

export function createPocketElement(
   boardID: number,
   position: "top" | "bottom"
): HTMLDivElement {
   const pocket = document.createElement("div");
   pocket.className = "pocket";
   pocket.id = `${position}-pocket-${boardID}`;
   pocket.dataset.boardId = boardID.toString();
   return pocket;
}

// UI Update Functions - Boards
export function updateUIBoard(boardID: number, flipped: boolean): void {
   const boardInstance = getBoardInstance(boardID);
   if (!boardInstance) {
      console.error("Board instance not found:", boardID);
      return;
   }

   clearAnnotations(boardID);

   const squares = document.querySelectorAll(
      `.square[data-board-id="${boardID}"]`
   );

   squares.forEach((square) => {
      const element = square as HTMLElement;
      const row = parseInt(element.dataset.row || "0");
      const col = parseInt(element.dataset.col || "0");

      const displayRow = flipped ? 7 - row : row;
      const displayCol = flipped ? 7 - col : col;
      const position = createPosition(displayRow, displayCol);
      const piece = boardInstance.getPiece(position);

      element.innerHTML = "";

      if (piece) {
         const img = document.createElement("img");
         const imageKey = getPieceImageKey(piece);
         img.src = PIECE_IMAGES[imageKey as keyof typeof PIECE_IMAGES];
         img.className = "piece";

         img.dataset.boardId = boardID.toString();
         img.dataset.pieceType = piece.type;
         img.dataset.pieceColor = piece.color;
         img.dataset.row = displayRow.toString();
         img.dataset.col = displayCol.toString();
         img.dataset.pocket = "false";

         const isMyTurn = boardInstance.turn === piece.color;
         const isMyPiece =
            session.room?.status === RoomStatus.PLAYING &&
            session.room?.game.matches[boardID].getPlayer(piece.color)?.id ===
               session.player?.id;

         if (isMyTurn && isMyPiece) {
            element.style.cursor = "grab";
         } else {
            element.style.cursor = "default";
         }

         if (
            dragState &&
            dragState.boardID === boardID &&
            dragState.position.type === "board" &&
            dragState.position.row === displayRow &&
            dragState.position.col === displayCol
         ) {
            img.style.opacity = "0";
         }

         img.ondragstart = () => false;
         element.appendChild(img);
      } else {
         element.style.cursor = "default";
      }
   });

   const topColor = flipped ? Color.WHITE : Color.BLACK;
   const bottomColor = flipped ? Color.BLACK : Color.WHITE;

   updatePocket(
      "top-pocket",
      boardInstance.getPocket(topColor),
      topColor,
      boardID
   );
   updatePocket(
      "bottom-pocket",
      boardInstance.getPocket(bottomColor),
      bottomColor,
      boardID
   );
}

function updatePocket(
   id: string,
   pieces: Map<PieceType, number>,
   color: Color,
   boardID: number
): void {
   const pocket = document.getElementById(`${id}-${boardID}`);
   if (!pocket) return;

   pocket.innerHTML = "";
   pocket.dataset.boardId = boardID.toString();

   const pieceOrder = [
      PieceType.PAWN,
      PieceType.KNIGHT,
      PieceType.BISHOP,
      PieceType.ROOK,
      PieceType.QUEEN,
   ];

   const isMyTurn = getBoardInstance(boardID).turn === color;
   const isMyPiece =
      session.room?.status === RoomStatus.PLAYING &&
      session.room?.game.matches[boardID].getPlayer(color)?.id ===
         session.player?.id;

   pieceOrder.forEach((pieceType) => {
      const count = pieces.get(pieceType);
      if (count && count > 0) {
         const pieceEl = document.createElement("div");
         pieceEl.className = "pocket-piece";

         const img = document.createElement("img");
         img.dataset.boardId = boardID.toString();
         img.dataset.pieceType = pieceType;
         img.dataset.pieceColor = color;
         img.dataset.pocket = "true";
         img.ondragstart = () => false;

         const imageKey = getPieceImageKey({ type: pieceType, color });
         img.src = PIECE_IMAGES[imageKey as keyof typeof PIECE_IMAGES];

         if (isMyTurn && isMyPiece) {
            img.style.cursor = "grab";
            img.addEventListener("mousedown", handlePocketMouseDown);
         } else {
            img.style.cursor = "default";
         }

         pieceEl.appendChild(img);

         if (count > 1) {
            const countBadge = document.createElement("div");
            countBadge.className = "pocket-count";
            countBadge.textContent = count.toString();
            pieceEl.appendChild(countBadge);
         }

         pocket.appendChild(pieceEl);
      }
   });
}

// Annotation Functions
function clearAnnotations(boardID: number): void {
   const squares = document.querySelectorAll(
      `.square[data-board-id="${boardID}"]`
   );
   squares.forEach((square) => {
      const element = square as HTMLElement;
      element.classList.remove("highlight", "legal-move", "has-piece");
   });
}

function annotateSquare(
   boardID: number,
   row: number,
   col: number,
   classes: string[]
): void {
   const square = document.querySelector(
      `.square[data-board-id="${boardID}"][data-row="${row}"][data-col="${col}"]`
   ) as HTMLElement;
   if (square) {
      classes.forEach((cls) => square.classList.add(cls));
      if (classes.includes("legal-move") && square.querySelector(".piece")) {
         square.classList.add("has-piece");
      }
   }
}

function showAnnotations(boardID: number, position: Position): void {
   const boardInstance = getBoardInstance(boardID);
   if (!boardInstance) return;

   clearAnnotations(boardID);
   const flipped = isFlipped(boardID);

   // Highlight source square if it's a board position
   if (position.type === "board") {
      const highlightRow = flipped ? 7 - position.row : position.row;
      const highlightCol = flipped ? 7 - position.col : position.col;
      annotateSquare(boardID, highlightRow, highlightCol, ["highlight"]);
   }

   // Show legal moves
   for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
         const toPosition = createPosition(r, c);
         const isLegal =
            position.type === "pocket"
               ? boardInstance.isLegalDrop(
                    toPosition,
                    position.pieceType,
                    position.color
                 )
               : boardInstance.isLegalMove(position, toPosition);

         if (isLegal) {
            const displayRow = flipped ? 7 - r : r;
            const displayCol = flipped ? 7 - c : c;
            annotateSquare(boardID, displayRow, displayCol, ["legal-move"]);
         }
      }
   }
}

// Drag and Drop Handlers
function handleSquareMouseDown(e: MouseEvent): void {
   const square = e.currentTarget as HTMLElement;
   if (!square) return;

   const boardID = getBoardID(square);
   const flipped = isFlipped(boardID);
   const row = parseInt(square.dataset.row || "0");
   const col = parseInt(square.dataset.col || "0");
   const displayRow = flipped ? 7 - row : row;
   const displayCol = flipped ? 7 - col : col;
   const position = createPosition(displayRow, displayCol);

   const boardInstance = getBoardInstance(boardID);
   const piece = boardInstance?.getPiece(position);

   if (!piece) return;

   const isMyTurn = boardInstance.turn === piece.color;
   const isMyPiece =
      session.room?.status === RoomStatus.PLAYING &&
      session.room?.game.matches[boardID].getPlayer(piece.color)?.id ===
         session.player?.id;

   if (!isMyTurn || !isMyPiece) return;

   e.preventDefault();

   console.log(
      `[DRAG START] Selected from ${positionToString(
         position
      )} on board ${boardID}`
   );

   showAnnotations(boardID, position);

   // Create drag image
   const pieceImg = square.querySelector("img") as HTMLImageElement;
   if (!pieceImg) return;

   const dragImg = document.createElement("img") as HTMLImageElement;
   dragImg.src = pieceImg.src;
   dragImg.style.position = "fixed";
   dragImg.style.zIndex = "9999";
   dragImg.style.pointerEvents = "none";
   dragImg.style.width = pieceImg.offsetWidth + "px";
   dragImg.style.height = pieceImg.offsetHeight + "px";
   dragImg.style.opacity = "1";
   dragImg.style.cursor = "grabbing";

   const centerOffsetX = pieceImg.offsetWidth / 2;
   const centerOffsetY = pieceImg.offsetHeight / 2;
   dragImg.style.left = e.clientX - centerOffsetX + "px";
   dragImg.style.top = e.clientY - centerOffsetY + "px";

   document.body.appendChild(dragImg);
   pieceImg.style.opacity = "0";

   dragState = {
      boardID,
      position,
      element: dragImg,
      piece,
   };

   document.addEventListener("mousemove", handleMouseMove);
   document.addEventListener("mouseup", handleMouseUp);
}

function handlePocketMouseDown(e: MouseEvent): void {
   const target = e.target as HTMLElement;
   if (!target) return;

   e.preventDefault();

   const boardID = getBoardID(target);
   const position = getPositionFromElement(target);

   console.log(
      `[DRAG START] Selected from ${positionToString(
         position
      )} on board ${boardID}`
   );

   showAnnotations(boardID, position);

   // Create drag image
   const dragImg = document.createElement("img") as HTMLImageElement;
   dragImg.src = (target as HTMLImageElement).src;
   dragImg.style.position = "fixed";
   dragImg.style.zIndex = "9999";
   dragImg.style.pointerEvents = "none";
   dragImg.style.width = target.offsetWidth + "px";
   dragImg.style.height = target.offsetHeight + "px";
   dragImg.style.opacity = "1";
   dragImg.style.cursor = "grabbing";

   const centerOffsetX = target.offsetWidth / 2;
   const centerOffsetY = target.offsetHeight / 2;
   dragImg.style.left = e.clientX - centerOffsetX + "px";
   dragImg.style.top = e.clientY - centerOffsetY + "px";

   document.body.appendChild(dragImg);

   const piece: Piece = {
      type: target.dataset.pieceType as PieceType,
      color: target.dataset.pieceColor as Color,
   };

   dragState = {
      boardID,
      position,
      element: dragImg,
      piece,
   };

   document.addEventListener("mousemove", handleMouseMove);
   document.addEventListener("mouseup", handleMouseUp);
}

function handleMouseMove(e: MouseEvent): void {
   if (!dragState) return;
   e.preventDefault();

   const centerOffsetX = dragState.element.offsetWidth / 2;
   const centerOffsetY = dragState.element.offsetHeight / 2;

   dragState.element.style.left = e.clientX - centerOffsetX + "px";
   dragState.element.style.top = e.clientY - centerOffsetY + "px";
}

function handleMouseUp(e: MouseEvent): void {
   if (!dragState) return;

   document.removeEventListener("mousemove", handleMouseMove);
   document.removeEventListener("mouseup", handleMouseUp);

   // Clean up drag element
   dragState.element.remove();

   const dropTarget = document.elementFromPoint(
      e.clientX,
      e.clientY
   ) as HTMLElement;
   const square = dropTarget?.closest(".square") as HTMLElement;

   const state = dragState;
   dragState = null;

   if (!square) {
      console.log(`[DRAG END] Invalid drop target`);
      clearAnnotations(state.boardID);
      updateUIBoard(state.boardID, isFlipped(state.boardID));
      return;
   }

   const targetBoardID = getBoardID(square);

   if (state.boardID !== targetBoardID) {
      console.warn(
         `[DRAG END] Cannot drop piece from board ${state.boardID} to board ${targetBoardID}`
      );
      clearAnnotations(state.boardID);
      updateUIBoard(state.boardID, isFlipped(state.boardID));
      return;
   }

   const flipped = isFlipped(state.boardID);
   const toRow = parseInt(square.dataset.row || "0");
   const toCol = parseInt(square.dataset.col || "0");
   const toLogicalRow = flipped ? 7 - toRow : toRow;
   const toLogicalCol = flipped ? 7 - toCol : toCol;
   const toPosition = createPosition(toLogicalRow, toLogicalCol);

   console.log(
      `[DRAG END] Attempting move from ${positionToString(
         state.position
      )} to ${positionToString(toPosition)} on board ${state.boardID}`
   );

   const move: Move = {
      from: state.position,
      to: toPosition,
   };

   const result = session.room!.game.tryApplyMove(state.boardID, move);

   if (result.success) {
      console.log(`[MOVE SUCCESS] Move succeeded`);
      session.socket.emit("move-board", state.boardID, state.piece.color, move);

      if (result.capturedPiece) {
         console.log(
            `[MOVE SUCCESS] Captured ${result.capturedPiece.color} ${result.capturedPiece.type}`
         );
      }
   } else {
      console.log(`[MOVE FAILED] Move is illegal`);
      clearAnnotations(state.boardID);
      updateUIBoard(state.boardID, flipped);
   }
}
