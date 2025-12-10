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
import { visualFlipped } from "./matchUI";
import { sn } from "./session";

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

interface SelectionState {
   boardID: number;
   position: Position;
   piece: Piece;
   justSelected: boolean;
   dragElement: HTMLImageElement | null;
}

let selectedState: SelectionState | null = null;

// Utility Functions
function getBoardInstance(boardID: number): Chess {
   return sn.room!.game.matches[boardID].chess;
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
   const baseKey = piece.type.charAt(0); // K, Q, R, B, N, P (excludes Q+)
   return piece.color === Color.WHITE
      ? baseKey.toUpperCase()
      : baseKey.toLowerCase();
}

function positionsEqual(pos1: Position, pos2: Position): boolean {
   if (pos1.type !== pos2.type) return false;

   if (pos1.type === "board" && pos2.type === "board") {
      return pos1.row === pos2.row && pos1.col === pos2.col;
   }

   if (pos1.type === "pocket" && pos2.type === "pocket") {
      return pos1.color === pos2.color && pos1.pieceType === pos2.pieceType;
   }

   return false;
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
   return sn.room!.game.matches[boardID].flipped !== visualFlipped;
}

function getSquareElement(
   boardID: number,
   position: BoardPosition
): HTMLElement | null {
   return document.querySelector(
      `.square[data-board-id="${boardID}"][data-row="${position.row}"][data-col="${position.col}"]`
   ) as HTMLElement;
}

function getPieceImageElement(
   boardID: number,
   position: Position
): HTMLImageElement | null {
   if (position.type === "board") {
      const square = getSquareElement(boardID, position);
      return square?.querySelector("img") as HTMLImageElement | null;
   } else {
      return document.querySelector(
         `img[data-board-id="${boardID}"][data-pocket="true"][data-piece-type="${position.pieceType}"][data-piece-color="${position.color}"]`
      ) as HTMLImageElement | null;
   }
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
         square.addEventListener("mouseup", handleSquareMouseUp);

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

function holdPiece(mouseEvent: MouseEvent): void {
   if (!selectedState) return;

   // Drop the selected piece (if there is one)
   dropSelectedPiece();

   // Get the piece image element
   const pieceImg = getPieceImageElement(
      selectedState.boardID,
      selectedState.position
   );
   if (!pieceImg) return;

   // Create drag element
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
   dragImg.style.left = mouseEvent.clientX - centerOffsetX + "px";
   dragImg.style.top = mouseEvent.clientY - centerOffsetY + "px";

   document.body.appendChild(dragImg);
   selectedState.dragElement = dragImg;

   // Add mouse move listener
   document.addEventListener("mousemove", handleMouseMove);

   // Hide original piece on board
   if (selectedState.position.type === "board") {
      const square = getSquareElement(
         selectedState.boardID,
         selectedState.position
      );
      if (square) {
         const img = square.querySelector("img");
         if (img) {
            img.style.opacity = "0";
         }
      }
   }
}

function dropSelectedPiece(): void {
   if (!selectedState) return;

   // Remove drag element
   if (selectedState.dragElement) {
      selectedState.dragElement.remove();
      selectedState.dragElement = null;
   }

   // Show original piece on board
   if (selectedState.position.type === "board") {
      const square = getSquareElement(
         selectedState.boardID,
         selectedState.position
      );
      if (square) {
         const img = square.querySelector("img");
         if (img) {
            img.style.opacity = "1";
         }
      }
   }

   // Remove mouse move listener
   document.removeEventListener("mousemove", handleMouseMove);
}

// Selection Functions
function selectPiece(boardID: number, position: Position, piece: Piece): void {
   const previousSelected = selectedState?.position;
   const justSelected = previousSelected
      ? !positionsEqual(previousSelected, position)
      : true;

   deselectPiece();

   selectedState = {
      boardID,
      position,
      piece,
      justSelected,
      dragElement: null,
   };

   updateAnnotations();
}

function deselectPiece(): void {
   if (!selectedState) return;

   // Drop piece if holding
   dropSelectedPiece();

   // Remove drag element if it still exists
   selectedState.dragElement?.remove();

   // Remove mouse move listener
   document.removeEventListener("mousemove", handleMouseMove);

   const boardID = selectedState.boardID;
   selectedState = null;
   updateUIBoard(boardID);
}

// UI Update Functions - Boards
export function updateUIBoard(boardID: number): void {
   const boardInstance = getBoardInstance(boardID);
   if (!boardInstance) {
      console.error("Board instance not found:", boardID);
      return;
   }

   const squares = document.querySelectorAll(
      `.square[data-board-id="${boardID}"]`
   );

   const flipped = isFlipped(boardID);

   squares.forEach((square, index) => {
      const element = square as HTMLElement;

      const visualRow = Math.floor(index / 8);
      const visualCol = index % 8;

      const row = flipped ? 7 - visualRow : visualRow;
      const col = flipped ? 7 - visualCol : visualCol;

      // Update dataset to reflect display coordinates
      element.dataset.row = row.toString();
      element.dataset.col = col.toString();

      const position = createPosition(row, col);
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
         img.dataset.row = row.toString();
         img.dataset.col = col.toString();
         img.dataset.pocket = "false";

         const isMyTurn = boardInstance.turn === piece.color;
         const isMyPiece =
            sn.room?.status === RoomStatus.PLAYING &&
            sn.room?.game.matches[boardID].getPlayer(piece.color)?.id ===
               sn.player?.id;

         if (isMyTurn && isMyPiece) {
            element.style.cursor = "grab";
         } else {
            element.style.cursor = "default";
         }

         // Hide piece if it's currently selected and being held
         if (
            selectedState &&
            selectedState.dragElement &&
            selectedState.boardID === boardID &&
            selectedState.position.type === "board" &&
            position.type === "board" &&
            selectedState.position.row === row &&
            selectedState.position.col === col
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

   updateAnnotations();
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
      sn.room?.status === RoomStatus.PLAYING &&
      sn.room?.game.matches[boardID].getPlayer(color)?.id === sn.player?.id;

   pieceOrder.forEach((pieceType) => {
      const count = pieces.get(pieceType);
      if (count && count > 0) {
         const pieceEl = document.createElement("div");
         pieceEl.className = "pocket-piece";
         pieceEl.dataset.boardId = boardID.toString();

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
            img.addEventListener("mouseup", handlePocketMouseUp);
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

function updateAnnotations(): void {
   // Clear board highlights
   const squares = document.querySelectorAll(`.square`);
   squares.forEach((square) => {
      const element = square as HTMLElement;
      element.classList.remove("highlight", "legal-move", "has-piece");
   });

   // Clear pocket highlights
   const pocketPieces = document.querySelectorAll(`.pocket-piece`);
   pocketPieces.forEach((piece) => {
      const element = piece as HTMLElement;
      element.classList.remove("highlight");
   });

   if (!selectedState) return;
   const { boardID, position } = selectedState;
   const boardInstance = getBoardInstance(boardID);
   if (!boardInstance) return;

   // Highlight source square if it's a board position
   if (position.type === "board") {
      annotateSquare(boardID, position.row, position.col, ["highlight"]);
   }

   // Highlight source pocket piece if it's a pocket position
   if (position.type === "pocket") {
      const pocketImg = document.querySelector(
         `img[data-board-id="${boardID}"][data-pocket="true"][data-piece-type="${position.pieceType}"][data-piece-color="${position.color}"]`
      );
      if (pocketImg) {
         const pocketPiece = pocketImg.closest(".pocket-piece") as HTMLElement;
         if (pocketPiece) {
            pocketPiece.classList.add("highlight");
         }
      }
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
            annotateSquare(boardID, r, c, ["legal-move"]);
         }
      }
   }
}

// Mouse Move Handler
function handleMouseMove(e: MouseEvent): void {
   if (!selectedState || !selectedState.dragElement) return;
   e.preventDefault();

   const centerOffsetX = selectedState.dragElement.offsetWidth / 2;
   const centerOffsetY = selectedState.dragElement.offsetHeight / 2;

   selectedState.dragElement.style.left = e.clientX - centerOffsetX + "px";
   selectedState.dragElement.style.top = e.clientY - centerOffsetY + "px";
}

// Mouse Event Handlers
function handleSquareMouseDown(e: MouseEvent): void {
   const square = e.currentTarget as HTMLElement;
   if (!square) return;

   const boardID = getBoardID(square);
   const row = parseInt(square.dataset.row || "0");
   const col = parseInt(square.dataset.col || "0");
   const targetPosition = createPosition(row, col);

   const boardInstance = getBoardInstance(boardID);
   const pieceAtTarget = boardInstance?.getPiece(targetPosition);

   e.preventDefault();

   if (selectedState && selectedState.boardID === boardID) {
      // Try to apply move
      const move: Move = {
         from: selectedState.position,
         to: targetPosition,
      };
      const result = sn.room!.game.tryApplyMove(boardID, move);

      if (result.success) {
         sn.socket.emit("move-board", boardID, selectedState.piece.color, move);
         deselectPiece();
      } else if (!pieceAtTarget || !isMyPiece(boardID, pieceAtTarget)) {
         deselectPiece();
      } else if (
         isMyPiece(boardID, pieceAtTarget) &&
         boardInstance.turn === pieceAtTarget.color
      ) {
         selectPiece(boardID, targetPosition, pieceAtTarget);
         holdPiece(e);
      }
   } else if (
      pieceAtTarget &&
      isMyPiece(boardID, pieceAtTarget) &&
      boardInstance.turn === pieceAtTarget.color
   ) {
      selectPiece(boardID, targetPosition, pieceAtTarget);
      holdPiece(e);
   }
}

function handleSquareMouseUp(e: MouseEvent): void {
   const square = e.currentTarget as HTMLElement;
   if (!square || !selectedState) return;

   const boardID = getBoardID(square);
   if (selectedState.boardID !== boardID) return;

   const row = parseInt(square.dataset.row || "0");
   const col = parseInt(square.dataset.col || "0");
   const targetPosition = createPosition(row, col);

   e.preventDefault();

   // Try to apply move
   const move: Move = {
      from: selectedState.position,
      to: targetPosition,
   };

   const result = sn.room!.game.tryApplyMove(boardID, move);

   if (result.success) {
      sn.socket.emit("move-board", boardID, selectedState.piece.color, move);

      deselectPiece();
   } else if (
      !selectedState.justSelected &&
      positionsEqual(selectedState.position, targetPosition)
   ) {
      deselectPiece();
   } else {
      // Move failed, drop the piece back
      dropSelectedPiece();
   }
}

function handlePocketMouseDown(e: MouseEvent): void {
   const target = e.target as HTMLElement;
   if (!target) return;

   const boardID = getBoardID(target);
   const targetPosition = getPositionFromElement(target);

   const piece: Piece = {
      type: target.dataset.pieceType as PieceType,
      color: target.dataset.pieceColor as Color,
   };

   e.preventDefault();

   selectPiece(boardID, targetPosition, piece);
   holdPiece(e);
}

function handlePocketMouseUp(e: MouseEvent): void {
   const target = e.target as HTMLElement;
   if (!target || !selectedState) return;

   const boardID = getBoardID(target);
   if (selectedState.boardID !== boardID) return;

   const targetPosition = getPositionFromElement(target);

   e.preventDefault();

   if (
      !selectedState.justSelected &&
      positionsEqual(selectedState.position, targetPosition)
   ) {
      deselectPiece();
   } else {
      // Move failed, drop the piece back
      dropSelectedPiece();
   }
}

function isMyPiece(boardID: number, piece: Piece): boolean {
   return (
      sn.room?.status === RoomStatus.PLAYING &&
      sn.room?.game.matches[boardID].getPlayer(piece.color)?.id ===
         sn.player?.id
   );
}
