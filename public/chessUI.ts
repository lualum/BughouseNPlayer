import { session } from "./session";
import {
   Chess,
   Color,
   Move,
   Piece,
   Position,
   createPosition,
} from "../shared/state";
import { RoomStatus } from "../shared/room";
import { updateUITime } from "./matchUI";

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
   boardId: number;
   piece: Piece;
   row: number;
   col: number;
   pocket: boolean;
   originalElement: HTMLElement;
   dragElement: HTMLImageElement;
   startX: number;
   startY: number;
   lastMouseX: number;
   velocity: number;
}

let currentDragState: DragState | null = null;

// Utility Functions
function getBoardInstance(boardID: number): Chess {
   return session.room?.game.matches[boardID].chess!;
}

function getBoardFlipState(boardID: number): boolean {
   const match = session.room?.game.matches[boardID];
   return match?.flipped || false;
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
         square.dataset.pocket = "false";
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

// UI Update Functions
export function updateUIAllBoards(): void {
   for (let i = 0; i < session.room!.game.matches.length; i++) {
      updateUIBoard(i);
   }
}

export function updateUIBoard(boardID: number): void {
   const boardInstance = getBoardInstance(boardID);
   if (!boardInstance) {
      console.error("Board instance not found:", boardID);
      return;
   }

   clearHighlights(boardID);

   const isFlipped = getBoardFlipState(boardID);

   const squares = document.querySelectorAll(
      `.square[data-board-id="${boardID}"]`
   );

   squares.forEach((square) => {
      const element = square as HTMLElement;
      const row = parseInt(element.dataset.row || "0");
      const col = parseInt(element.dataset.col || "0");

      const displayRow = isFlipped ? 7 - row : row;
      const displayCol = isFlipped ? 7 - col : col;
      const position: Position = createPosition(displayRow, displayCol);
      const piece = boardInstance.getPiece(position);

      element.innerHTML = "";

      if (piece) {
         const img = document.createElement("img");
         img.src = PIECE_IMAGES[piece as keyof typeof PIECE_IMAGES];
         img.className = "piece";

         const isMyTurn =
            boardInstance.turn === boardInstance.getPieceColor(piece);

         img.dataset.boardId = boardID.toString();
         img.dataset.piece = piece;
         img.dataset.row = displayRow.toString();
         img.dataset.col = displayCol.toString();
         img.dataset.pocket = "false";

         if (
            isMyTurn &&
            session.room!.status === RoomStatus.PLAYING &&
            session.room!.game.matches[boardID].samePlayer(
               session.player!,
               boardInstance.getPieceColor(piece)!
            )
         ) {
            img.style.cursor = "grab";
            img.addEventListener("mousedown", handleMouseDown);
         } else {
            img.style.cursor = "default";
         }

         img.ondragstart = () => false;

         element.appendChild(img);
      }
   });

   const topColor = isFlipped ? Color.WHITE : Color.BLACK;
   const bottomColor = isFlipped ? Color.BLACK : Color.WHITE;

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
   pieces: string[],
   color: Color,
   boardID: number
): void {
   const pocket = document.getElementById(`${id}-${boardID}`);
   if (!pocket) return;

   pocket.innerHTML = "";
   pocket.dataset.boardId = boardID.toString();

   const pieceCounts: Record<string, number> = {};
   pieces.forEach((p) => {
      pieceCounts[p] = (pieceCounts[p] || 0) + 1;
   });

   Object.entries(pieceCounts).forEach(([piece, count]) => {
      const pieceEl = document.createElement("div");
      pieceEl.className = "pocket-piece";

      const isMyTurn =
         getBoardInstance(boardID).turn ===
         getBoardInstance(boardID).getPieceColor(piece as Piece);

      const img = document.createElement("img");
      img.dataset.boardId = boardID.toString();
      img.dataset.piece = piece;
      img.dataset.row = "NaN";
      img.dataset.col = "NaN";
      img.dataset.pocket = "true";

      img.ondragstart = () => false;

      const displayPiece =
         color === Color.WHITE ? piece.toUpperCase() : piece.toLowerCase();
      img.src = PIECE_IMAGES[displayPiece as keyof typeof PIECE_IMAGES];
      pieceEl.appendChild(img);

      if (count > 1) {
         const countBadge = document.createElement("div");
         countBadge.className = "pocket-count";
         countBadge.textContent = count.toString();
         pieceEl.appendChild(countBadge);
      }

      if (
         isMyTurn &&
         session.room!.status === RoomStatus.PLAYING &&
         session.room!.game.matches[boardID].samePlayer(session.player!, color)
      ) {
         img.style.cursor = "grab";
         img.addEventListener("mousedown", handleMouseDown);
      } else {
         pieceEl.style.cursor = "default";
      }

      pocket.appendChild(pieceEl);
   });
}

// Highlight Functions
function clearHighlights(boardID: number): void {
   const squares = document.querySelectorAll(
      `.square[data-board-id="${boardID}"]`
   );
   squares.forEach((square) => {
      const element = square as HTMLElement;
      element.classList.remove("highlight");
   });
}

function highlightSquare(boardID: number, row: number, col: number): void {
   const square = document.querySelector(
      `.square[data-board-id="${boardID}"][data-row="${row}"][data-col="${col}"]`
   ) as HTMLElement;
   if (square) {
      square.classList.add("highlight");
   }
}

function clearLegalMoves(boardID: number): void {
   const squares = document.querySelectorAll(
      `.square[data-board-id="${boardID}"]`
   );
   squares.forEach((square) => {
      square.classList.remove("legal-move", "has-piece");
   });
}

function highlightLegalMove(boardID: number, row: number, col: number): void {
   const square = document.querySelector(
      `.square[data-board-id="${boardID}"][data-row="${row}"][data-col="${col}"]`
   ) as HTMLElement;
   if (square) {
      square.classList.add("legal-move");
      if (square.querySelector(".piece")) {
         square.classList.add("has-piece");
      }
   }
}

function showLegalMoves(
   boardID: number,
   row: number,
   col: number,
   isPocket: boolean,
   piece: Piece
): void {
   const boardInstance = getBoardInstance(boardID);
   if (!boardInstance) return;

   const isFlipped = getBoardFlipState(boardID);

   clearLegalMoves(boardID);

   if (isPocket) {
      for (let r = 0; r < 8; r++) {
         for (let c = 0; c < 8; c++) {
            const pos = createPosition(r, c);
            if (boardInstance.isLegalDrop(pos, piece)) {
               const displayRow = isFlipped ? 7 - r : r;
               const displayCol = isFlipped ? 7 - c : c;
               highlightLegalMove(boardID, displayRow, displayCol);
            }
         }
      }
   } else {
      const fromPosition = createPosition(row, col);

      for (let r = 0; r < 8; r++) {
         for (let c = 0; c < 8; c++) {
            const toPosition = createPosition(r, c);
            if (boardInstance.isLegalMove(fromPosition, toPosition)) {
               const displayRow = isFlipped ? 7 - r : r;
               const displayCol = isFlipped ? 7 - c : c;
               highlightLegalMove(boardID, displayRow, displayCol);
            }
         }
      }
   }
}

// Drag and Drop Handlers

function handleMouseDown(e: MouseEvent): void {
   const target = e.target as HTMLElement;
   if (!target) return;

   e.preventDefault();

   const boardID = parseInt(target.dataset.boardId || "0");
   const piece = target.dataset.piece as Piece;
   const row = parseInt(target.dataset.row || "0");
   const col = parseInt(target.dataset.col || "0");
   const isPocket = target.dataset.pocket === "true";

   clearHighlights(boardID);

   const isFlipped = getBoardFlipState(boardID);

   if (!isPocket && !isNaN(row) && !isNaN(col)) {
      const highlightRow = isFlipped ? 7 - row : row;
      const highlightCol = isFlipped ? 7 - col : col;
      highlightSquare(boardID, highlightRow, highlightCol);
   }

   showLegalMoves(boardID, row, col, isPocket, piece);

   const dragElement = target.cloneNode(true) as HTMLImageElement;

   dragElement.style.position = "fixed";
   dragElement.style.zIndex = "9999";
   dragElement.style.pointerEvents = "none";
   dragElement.style.width = target.offsetWidth + "px";
   dragElement.style.height = target.offsetHeight + "px";
   dragElement.style.opacity = "1";
   dragElement.style.cursor = "grabbing";
   dragElement.style.transition = "transform 0.1s ease-out";
   dragElement.style.transformOrigin = "center bottom";

   const centerOffsetX = target.offsetWidth / 2;
   const centerOffsetY = target.offsetHeight / 2;

   dragElement.style.left = e.clientX - centerOffsetX + "px";
   dragElement.style.top = e.clientY - centerOffsetY + "px";

   document.body.appendChild(dragElement);
   target.style.visibility = "hidden";

   currentDragState = {
      boardId: boardID,
      piece,
      row,
      col,
      pocket: isPocket,
      originalElement: target,
      dragElement: dragElement,
      startX: centerOffsetX,
      startY: centerOffsetY,
      lastMouseX: e.clientX,
      velocity: 0,
   };

   document.addEventListener("mousemove", handleMouseMove);
   document.addEventListener("mouseup", handleMouseUp);

   requestAnimationFrame(dragLoop);
}

function handleMouseMove(e: MouseEvent): void {
   if (!currentDragState) return;
   e.preventDefault();

   const { dragElement, startX, startY, lastMouseX } = currentDragState;

   dragElement.style.left = e.clientX - startX + "px";
   dragElement.style.top = e.clientY - startY + "px";

   const deltaX = e.clientX - lastMouseX;

   currentDragState.velocity = deltaX;

   currentDragState.lastMouseX = e.clientX;
}

function handleMouseUp(e: MouseEvent): void {
   if (!currentDragState) return;

   document.removeEventListener("mousemove", handleMouseMove);
   document.removeEventListener("mouseup", handleMouseUp);

   const { dragElement, originalElement, boardId } = currentDragState;

   if (dragElement.parentNode) {
      dragElement.parentNode.removeChild(dragElement);
   }

   originalElement.style.visibility = "visible";

   const dropTarget = document.elementFromPoint(
      e.clientX,
      e.clientY
   ) as HTMLElement;

   const stateSnapshot = currentDragState;
   currentDragState = null;

   if (!dropTarget) {
      clearHighlights(boardId);
      clearLegalMoves(boardId);
      return;
   }

   const square = dropTarget.closest(".square") as HTMLElement;
   if (!square) {
      clearHighlights(boardId);
      clearLegalMoves(boardId);
      return;
   }

   const targetBoardID = parseInt(square.dataset.boardId || "0");

   if (boardId !== targetBoardID) {
      console.warn("Cannot drop piece from different board instance");
      clearHighlights(boardId);
      clearLegalMoves(boardId);
      return;
   }

   const toRow = parseInt(square.dataset.row || "0");
   const toCol = parseInt(square.dataset.col || "0");

   const boardInstance = getBoardInstance(boardId);
   if (!boardInstance) {
      console.error("Board instance not found:", boardId);
      clearHighlights(boardId);
      clearLegalMoves(boardId);
      return;
   }

   const isFlipped = getBoardFlipState(boardId);

   const toLogicalRow = isFlipped ? 7 - toRow : toRow;
   const toLogicalCol = isFlipped ? 7 - toCol : toCol;
   const toPosition: Position = createPosition(toLogicalRow, toLogicalCol);

   let move: Move;
   let result;

   if (stateSnapshot.pocket) {
      move = {
         type: "drop",
         piece: stateSnapshot.piece,
         to: toPosition,
      };
      result = session.room!.game.applyMove(boardId, move);
   } else {
      const fromPosition: Position = createPosition(
         stateSnapshot.row,
         stateSnapshot.col
      );
      move = {
         type: "move",
         from: fromPosition,
         to: toPosition,
      };
      result = session.room!.game.applyMove(boardId, move);
   }

   if (result.success) {
      session.socket.emit(
         "move-board",
         boardId,
         boardInstance.getPieceColor(stateSnapshot.piece),
         move
      );
      if (result.capturedPiece) {
         updateUIAllBoards();
      } else {
         updateUIBoard(boardId);
      }
      clearLegalMoves(boardId);
   } else {
      console.log("Invalid move attempted");
      clearHighlights(boardId);
      clearLegalMoves(boardId);
   }
}

function dragLoop() {
   if (!currentDragState) return;

   const { dragElement, velocity } = currentDragState;

   const maxTilt = 25;
   const sensitivity = 1.5;
   const decay = 0.85;

   let rotation = velocity * sensitivity;

   if (rotation > maxTilt) rotation = maxTilt;
   if (rotation < -maxTilt) rotation = -maxTilt;

   dragElement.style.transform = `rotate(${rotation}deg)`;

   if (Math.abs(velocity) > 0.1) {
      currentDragState.velocity *= decay;
   } else {
      currentDragState.velocity = 0;
   }

   requestAnimationFrame(dragLoop);
}
