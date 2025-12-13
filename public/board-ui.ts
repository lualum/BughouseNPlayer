import {
   type BoardPosition,
   type Chess,
   Color,
   createPosition,
   type Move,
   type Piece,
   PieceType,
   type Position,
   positionsEqual,
} from "../shared/chess";
import { RoomStatus } from "../shared/room";
import { visualFlipped } from "./match-ui";
import { gs } from "./session";

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

let selected: {
   boardID: number;
   pos: Position;
   piece: Piece;
   justSelected: boolean;
   dragElement: HTMLImageElement | null;
} | null = null;

// MARK: Utility Functions

function getBoard(id: number): Chess {
   return gs.room.game.matches[id].chess;
}

function isFlipped(id: number): boolean {
   return gs.room.game.matches[id].flipped !== visualFlipped;
}

function isMyPiece(boardID: number, piece: Piece): boolean {
   return (
      gs.room.status === RoomStatus.PLAYING &&
      gs.room.game.matches[boardID].getPlayer(piece.color)?.id === gs.player.id
   );
}

function getPieceImagePath(piece: Piece): string {
   /**
    * K, Q, R, B, N, P (excludes Q+).
    */
   const baseKey = piece.type.charAt(0);
   const key = piece.color ? baseKey.toUpperCase() : baseKey.toLowerCase();

   return PIECE_IMAGES[key as keyof typeof PIECE_IMAGES];
}

function setPositionToElement(element: HTMLElement, pos: Position, id: number) {
   element.dataset.id = id.toString();
   element.dataset.loc = pos.loc;
   if (pos.loc === "board") {
      element.dataset.row = pos.row.toString();
      element.dataset.col = pos.col.toString();
   } else {
      element.dataset.color = pos.color.toString();
      element.dataset.type = pos.type;
   }
}

function getPositionFromElement(element: HTMLElement): {
   pos: Position;
   id: number;
} {
   return {
      pos:
         element.dataset.loc === "board"
            ? createPosition(
                 Number.parseInt(element.dataset.row || "0"),
                 Number.parseInt(element.dataset.col || "0")
              )
            : createPosition(
                 Number.parseInt(element.dataset.color || "0"),
                 element.dataset.type as PieceType
              ),
      id: Number.parseInt(element.dataset.id || "0"),
   };
}

function getSquareElement(id: number, pos: BoardPosition): HTMLElement {
   return document.querySelector(
      `.square[data-id="${id}"][data-row="${pos.row}"][data-col="${pos.col}"]`
   ) as HTMLElement;
}

function getPieceElement(id: number, pos: Position): HTMLImageElement {
   if (pos.loc === "board") {
      const square = getSquareElement(id, pos);

      return square.querySelector("img") as HTMLImageElement;
   }

   return document.querySelector(
      `img[data-id="${id}"][data-loc="pocket"][data-type="${pos.type}"][data-color="${pos.color}"]`
   ) as HTMLImageElement;
}

// MARK: Element Creation

export function createBoardElement(id: number): HTMLDivElement {
   const board = document.createElement("div");

   board.className = "board";
   board.dataset.id = id.toString();

   for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
         const square = document.createElement("div");

         square.className = `square ${
            (row + col) % 2 === 0 ? "light" : "dark"
         }`;
         setPositionToElement(square, createPosition(row, col), id);

         square.addEventListener("mousedown", handleSquareMouseDown);
         square.addEventListener("mouseup", handleSquareMouseUp);

         board.append(square);
      }
   }

   return board;
}

export function createPocketElement(
   id: number,
   side: "top" | "bottom"
): HTMLDivElement {
   const pocket = document.createElement("div");

   pocket.className = "pocket";
   pocket.id = `${side}-pocket-${id}`;
   pocket.dataset.id = id.toString();

   return pocket;
}

// MARK: Piece Selection

function holdPiece(mouseEvent: MouseEvent): void {
   if (!selected) {
      return;
   }

   dropSelectedPiece();

   const pieceImg = getPieceElement(selected.boardID, selected.pos);

   const dragImg = document.createElement("img");

   dragImg.src = pieceImg.src;
   dragImg.className = "dragged-piece";
   dragImg.style.width = `${pieceImg.offsetWidth}px`;
   dragImg.style.height = `${pieceImg.offsetHeight}px`;

   const centerOffsetX = pieceImg.offsetWidth / 2;
   const centerOffsetY = pieceImg.offsetHeight / 2;

   dragImg.style.left = `${mouseEvent.clientX - centerOffsetX}px`;
   dragImg.style.top = `${mouseEvent.clientY - centerOffsetY}px`;

   document.body.append(dragImg);
   selected.dragElement = dragImg;

   document.addEventListener("mousemove", handleMouseMove);

   getPieceElement(selected.boardID, selected.pos).style.opacity = "0";
}

function dropSelectedPiece(): void {
   if (!selected?.dragElement) {
      return;
   }

   selected.dragElement.remove();
   selected.dragElement = null;

   getPieceElement(selected.boardID, selected.pos).style.opacity = "1";

   document.removeEventListener("mousemove", handleMouseMove);
}

function selectPiece(id: number, pos: Position): void {
   const lastSelected = selected?.pos;
   const justSelected = lastSelected
      ? !positionsEqual(lastSelected, pos)
      : true;

   deselectPiece();

   const piece = getBoard(id).getPiece(pos);

   if (!piece) {
      return;
   }

   selected = {
      boardID: id,
      pos,
      piece,
      justSelected,
      dragElement: null,
   };

   updateAnnotations();
}

function deselectPiece(): void {
   if (!selected) {
      return;
   }

   dropSelectedPiece();

   const { boardID } = selected;

   selected = null;
   updateUIChess(boardID);
}

// MARK: UI Update Funcs

export function updateUIChess(id: number): void {
   const board = getBoard(id);
   if (!board) return;

   const squares = document.querySelectorAll(`.square[data-id="${id}"]`);
   const flipped = isFlipped(id);

   for (const [index, square] of squares.entries()) {
      const element = square as HTMLElement;

      const visualRow = Math.floor(index / 8);
      const visualCol = index % 8;

      const row = flipped ? 7 - visualRow : visualRow;
      const col = flipped ? 7 - visualCol : visualCol;
      const pos = createPosition(row, col);

      setPositionToElement(element, pos, id);

      element.innerHTML = "";

      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

      if (visualCol === 0) {
         const rankLabel = document.createElement("div");

         rankLabel.className = "rank-label";
         rankLabel.textContent = (row + 1).toString();
         element.append(rankLabel);
      }

      if (visualRow === 7) {
         const fileLabel = document.createElement("div");
         fileLabel.className = "file-label";
         fileLabel.textContent = files[col];
         element.append(fileLabel);
      }

      const piece = board.getPiece(pos);
      if (piece) {
         const img = document.createElement("img");

         img.src = getPieceImagePath(piece);
         img.className = "piece";

         const isMyTurn = board.turn === piece.color;
         const isMyPiece =
            gs.room.status === RoomStatus.PLAYING &&
            gs.room.game.matches[id].getPlayer(piece.color)?.id ===
               gs.player.id;

         element.style.cursor = isMyTurn && isMyPiece ? "grab" : "default";

         // Hide piece if it's currently selected and being held
         if (
            selected &&
            selected.dragElement &&
            selected.boardID === id &&
            positionsEqual(selected.pos, pos)
         ) {
            img.style.opacity = "0";
         }

         img.addEventListener("dragstart", () => false);
         element.append(img);
      } else {
         element.style.cursor = "default";
      }
   }

   const topColor = flipped ? Color.WHITE : Color.BLACK;
   const bottomColor = flipped ? Color.BLACK : Color.WHITE;

   updatePocket("top-pocket", board.getPocket(topColor), topColor, id);
   updatePocket("bottom-pocket", board.getPocket(bottomColor), bottomColor, id);

   updateAnnotations();
}

function updatePocket(
   id: string,
   pieces: Map<PieceType, number>,
   color: Color,
   boardID: number
): void {
   const pocket = document.querySelector(`#${id}-${boardID}`) as HTMLElement;
   if (!pocket) return;

   pocket.innerHTML = "";
   pocket.dataset.id = boardID.toString();

   const pieceOrder = [
      PieceType.PAWN,
      PieceType.KNIGHT,
      PieceType.BISHOP,
      PieceType.ROOK,
      PieceType.QUEEN,
   ];

   const isMyTurn = getBoard(boardID).turn === color;
   const isMyPiece =
      gs.room.status === RoomStatus.PLAYING &&
      gs.room.game.matches[boardID].getPlayer(color)?.id === gs.player.id;

   for (const pieceType of pieceOrder) {
      const count = pieces.get(pieceType);

      if (count && count > 0) {
         const pieceElement = document.createElement("div");

         pieceElement.className = "pocket-piece";
         pieceElement.dataset.id = boardID.toString();

         const img = document.createElement("img");

         img.src = getPieceImagePath({ type: pieceType, color });
         setPositionToElement(
            img,
            { loc: "pocket", type: pieceType, color },
            boardID
         );
         img.addEventListener("dragstart", () => false);

         if (isMyTurn && isMyPiece) {
            img.style.cursor = "grab";
            img.addEventListener("mousedown", handlePocketMouseDown);
            img.addEventListener("mouseup", handlePocketMouseUp);
         } else {
            img.style.cursor = "default";
         }

         pieceElement.append(img);

         if (count > 1) {
            const countBadge = document.createElement("div");

            countBadge.className = "pocket-count";
            countBadge.textContent = count.toString();
            pieceElement.append(countBadge);
         }

         pocket.append(pieceElement);
      }
   }
}

function annotateSquare(
   boardID: number,
   row: number,
   col: number,
   classes: string[]
): void {
   const square = getSquareElement(boardID, { loc: "board", row, col });

   for (const cls of classes) {
      square.classList.add(cls);
   }
   if (classes.includes("legal-move") && square.querySelector(".piece")) {
      square.classList.add("has-piece");
   }
}

function updateAnnotations(): void {
   // Clear board highlights
   const squares = document.querySelectorAll(`.square`);

   for (const square of squares) {
      const element = square as HTMLElement;

      element.classList.remove("highlight", "legal-move", "has-piece");
   }

   // Clear pocket highlights
   const pocketPieces = document.querySelectorAll(`.pocket-piece`);

   for (const piece of pocketPieces) {
      const element = piece as HTMLElement;

      element.classList.remove("highlight");
   }

   if (!selected) {
      return;
   }
   const { boardID, pos } = selected;
   const board = getBoard(boardID);

   if (!board) {
      return;
   }

   if (pos.loc === "board") {
      annotateSquare(boardID, pos.row, pos.col, ["highlight"]);
   } else {
      const pocketImg = getPieceElement(boardID, pos);

      const pocketPiece = pocketImg.closest(".pocket-piece") as HTMLElement;

      pocketPiece.classList.add("highlight");
   }

   // Show legal moves
   for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
         const toPosition = createPosition(r, c);
         const isLegal =
            pos.loc === "pocket"
               ? board.isLegalDrop(toPosition, pos.type, pos.color)
               : board.isLegalMove(pos, toPosition);

         if (isLegal) {
            annotateSquare(boardID, r, c, ["legal-move"]);
         }
      }
   }
}

// MARK: Mouse Handlers

function handleMouseMove(event: MouseEvent): void {
   if (!selected?.dragElement) {
      return;
   }
   event.preventDefault();

   const centerOffsetX = selected.dragElement.offsetWidth / 2;
   const centerOffsetY = selected.dragElement.offsetHeight / 2;

   selected.dragElement.style.left = `${event.clientX - centerOffsetX}px`;
   selected.dragElement.style.top = `${event.clientY - centerOffsetY}px`;
}

function handleSquareMouseDown(event: MouseEvent): void {
   const square = event.currentTarget as HTMLElement;

   const { pos, id } = getPositionFromElement(square);

   const board = getBoard(id);
   const pieceAtTarget = board.getPiece(pos);

   event.preventDefault();

   if (selected?.boardID === id) {
      const move: Move = {
         from: selected.pos,
         to: pos,
      };
      const result = gs.room.game.tryApplyMove(id, move);

      if (result.success) {
         gs.socket.emit("move-board", id, selected.piece.color, move);
         deselectPiece();
      } else if (!pieceAtTarget || !isMyPiece(id, pieceAtTarget)) {
         deselectPiece();
      } else if (
         isMyPiece(id, pieceAtTarget) &&
         board.turn === pieceAtTarget.color
      ) {
         selectPiece(id, pos);
         holdPiece(event);
      }
   } else if (
      pieceAtTarget &&
      isMyPiece(id, pieceAtTarget) &&
      board.turn === pieceAtTarget.color
   ) {
      selectPiece(id, pos);
      holdPiece(event);
   }
}

function handleSquareMouseUp(event: MouseEvent): void {
   const square = event.currentTarget as HTMLElement;

   if (!selected) {
      return;
   }

   const { pos, id } = getPositionFromElement(square);

   if (selected.boardID !== id) {
      return;
   }

   event.preventDefault();

   const move: Move = {
      from: selected.pos,
      to: pos,
   };

   const result = gs.room.game.tryApplyMove(id, move);

   if (result.success) {
      gs.socket.emit("move-board", id, selected.piece.color, move);
      deselectPiece();
   } else if (!selected.justSelected && positionsEqual(selected.pos, pos)) {
      deselectPiece();
   } else {
      dropSelectedPiece();
   }
}

function handlePocketMouseDown(event: MouseEvent): void {
   const target = event.target as HTMLElement;

   const { pos, id } = getPositionFromElement(target);

   event.preventDefault();

   selectPiece(id, pos);
   holdPiece(event);
}

function handlePocketMouseUp(event: MouseEvent): void {
   const target = event.target as HTMLElement;

   if (!selected) {
      return;
   }

   const { pos, id } = getPositionFromElement(target);

   if (selected.boardID !== id) {
      return;
   }

   event.preventDefault();

   if (!selected.justSelected && positionsEqual(selected.pos, pos)) {
      deselectPiece();
   } else {
      dropSelectedPiece();
   }
}
