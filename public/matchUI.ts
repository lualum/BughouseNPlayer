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
import { Match, RoomStatus } from "../shared/room";
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

interface SelectedPiece {
   boardID: number;
   piece: Piece;
   row: number;
   col: number;
   pocket: boolean;
}

interface DragElement {
   element: HTMLImageElement;
   originalElement: HTMLElement;
   startX: number;
   startY: number;
}

let selectedPiece: SelectedPiece | null = null;
let dragElement: DragElement | null = null;
let visualFlipped: boolean = false;
let intervalID: number;

// Utility Functions
export function setVisualFlipped(flipped: boolean): void {
   visualFlipped = flipped;
}

export function toggleVisualFlipped(): void {
   visualFlipped = !visualFlipped;
}

function getBoardInstance(boardID: number): Chess {
   return session.room?.game.matches[boardID].chess!;
}

function getMatchInstance(boardID: number): Match {
   return session.room?.game.matches[boardID]!;
}

function getBoardFlipState(boardID: number): boolean {
   const match = session.room?.game.matches[boardID];
   const matchFlipped = match?.flipped || false;
   // XOR: if both are flipped or both are not flipped, result is false (not flipped)
   // if one is flipped and the other is not, result is true (flipped)
   return matchFlipped !== visualFlipped;
}

function createPosition(row: number, col: number): BoardPosition {
   return { type: "board", row, col };
}

function getPieceImageKey(piece: Piece): string {
   const baseKey = piece.type;
   return piece.color === Color.WHITE
      ? baseKey.toUpperCase()
      : baseKey.toLowerCase();
}

function formatTime(time: number): string {
   const milliseconds = Math.max(time, 0);
   const totalSeconds = Math.floor(milliseconds / 1000);
   const minutes = Math.floor(totalSeconds / 60);
   const seconds = totalSeconds % 60;
   return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

function createPocketRowElements(
   boardID: number,
   position: "top" | "bottom"
): HTMLDivElement {
   const row = document.createElement("div");
   row.className = "pocket-row";

   const info = document.createElement("div");
   info.className = "player-info";
   info.id = `${position}-info-${boardID}`;

   const name = document.createElement("div");
   name.className = "player-name-display";

   const time = document.createElement("div");
   time.className = "player-time-display";

   info.appendChild(name);
   info.appendChild(time);

   const playerSlot = document.createElement("div");
   playerSlot.className = "player-slot";
   playerSlot.id = `${position}-player-slot-${boardID}`;

   const pocket = createPocketElement(boardID, position);

   row.appendChild(playerSlot);
   row.appendChild(info);
   row.appendChild(pocket);

   return row;
}

// Match Element Creation
export function createMatchElements(boardID: number): void {
   const boardsArea = document.getElementById("game-area");
   if (!boardsArea) return;

   const boardContainer = document.createElement("div");
   boardContainer.className = "board-container";
   boardContainer.dataset.boardId = boardID.toString();

   const topRow = createPocketRowElements(boardID, "top");
   boardContainer.appendChild(topRow);

   const board = createBoardElement(boardID);
   boardContainer.appendChild(board);

   const bottomRow = createPocketRowElements(boardID, "bottom");
   boardContainer.appendChild(bottomRow);

   boardsArea.appendChild(boardContainer);
}

export function deleteBoard(boardID: number): void {
   const boardContainer = document.querySelector(
      `.board-container[data-board-id="${boardID}"]`
   );
   if (boardContainer && boardContainer.parentNode) {
      boardContainer.parentNode.removeChild(boardContainer);
   }
}

// UI Update Functions - Boards
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

   clearAnnotations(boardID);

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
         const imageKey = getPieceImageKey(piece);
         img.src = PIECE_IMAGES[imageKey as keyof typeof PIECE_IMAGES];
         img.className = "piece";

         const isMyTurn = boardInstance.turn === piece.color;

         img.dataset.boardId = boardID.toString();
         img.dataset.pieceType = piece.type;
         img.dataset.pieceColor = piece.color;
         img.dataset.row = displayRow.toString();
         img.dataset.col = displayCol.toString();
         img.dataset.pocket = "false";

         if (
            isMyTurn &&
            session.room?.status === RoomStatus.PLAYING &&
            session.room?.game.matches[boardID].getPlayer(piece.color)?.id ===
               session.player?.id
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

   pieceOrder.forEach((pieceType) => {
      const count = pieces.get(pieceType);
      if (count && count > 0) {
         const pieceEl = document.createElement("div");
         pieceEl.className = "pocket-piece";
         const isMyTurn = getBoardInstance(boardID).turn === color;
         const img = document.createElement("img");
         img.dataset.boardId = boardID.toString();
         img.dataset.pieceType = pieceType;
         img.dataset.pieceColor = color;
         img.dataset.row = "NaN";
         img.dataset.col = "NaN";
         img.dataset.pocket = "true";
         img.ondragstart = () => false;
         const imageKey = getPieceImageKey({ type: pieceType, color });
         img.src = PIECE_IMAGES[imageKey as keyof typeof PIECE_IMAGES];
         pieceEl.appendChild(img);
         if (count > 1) {
            const countBadge = document.createElement("div");
            countBadge.className = "pocket-count";
            countBadge.textContent = count.toString();
            pieceEl.appendChild(countBadge);
         }
         if (
            isMyTurn &&
            session.room?.status === RoomStatus.PLAYING &&
            session.room?.game.matches[boardID].getPlayer(color)?.id ===
               session.player?.id
         ) {
            img.style.cursor = "grab";
            img.addEventListener("mousedown", handleMouseDown);
         } else {
            pieceEl.style.cursor = "default";
         }
         pocket.appendChild(pieceEl);
      }
   });
}

// UI Update Functions - Players
export function updateUIAllPlayers(): void {
   for (let i = 0; i < session.room!.game.matches.length; i++) {
      updateUIPlayers(i);
   }
}

export function updateUIPlayers(boardID: number): void {
   const matchInstance = getMatchInstance(boardID);
   if (!matchInstance) return;

   const isFlipped = getBoardFlipState(boardID);
   const { topPlayer, bottomPlayer, topColor, bottomColor } =
      getPlayerPositions(matchInstance, isFlipped);

   updatePlayerSlot(boardID, "top", topPlayer, topColor);
   updatePlayerSlot(boardID, "bottom", bottomPlayer, bottomColor);
}

function getPlayerPositions(matchInstance: any, isFlipped: boolean) {
   return {
      topPlayer: isFlipped
         ? matchInstance.whitePlayer
         : matchInstance.blackPlayer,
      bottomPlayer: isFlipped
         ? matchInstance.blackPlayer
         : matchInstance.whitePlayer,
      topColor: isFlipped ? Color.WHITE : Color.BLACK,
      bottomColor: isFlipped ? Color.BLACK : Color.WHITE,
   };
}

function updatePlayerSlot(
   boardID: number,
   position: "top" | "bottom",
   player: any,
   color: Color
): void {
   const playerSlot = document.querySelector(
      `#${position}-player-slot-${boardID}`
   ) as HTMLElement;
   const playerInfo = document.querySelector(
      `#${position}-info-${boardID}`
   ) as HTMLElement;

   if (playerSlot) {
      playerSlot.innerHTML = "";
      const slotContent = player
         ? createPlayerIcon(boardID, player, color, position)
         : createEmptySlot(boardID, color);
      playerSlot.appendChild(slotContent);
   }

   if (playerInfo) {
      updatePlayerName(playerInfo, player);
   }
}

function createEmptySlot(boardID: number, color: Color): HTMLElement {
   if (session.room!.status === RoomStatus.LOBBY) {
      const slot = document.createElement("button");
      slot.className = "join-board-btn";
      slot.textContent = "[+]";
      slot.addEventListener("click", () => {
         session.socket.emit("join-board", boardID, color);
      });
      return slot;
   } else {
      const slot = document.createElement("img");
      slot.className = "player-icon";
      slot.src = "/img/default-icon.png";
      return slot;
   }
}

function createPlayerIcon(
   boardID: number,
   player: any,
   color: Color,
   position: "top" | "bottom"
): HTMLElement {
   const iconContainer = document.createElement("div");
   iconContainer.style.position = "relative";
   iconContainer.style.display = "inline-block";

   const slot = document.createElement("img");
   slot.className = "player-icon";
   slot.src = "/img/default-icon.png";
   iconContainer.appendChild(slot);

   const shouldShowLeaveBtn =
      session.room!.status === RoomStatus.LOBBY &&
      player.id === session.player!.id;

   if (shouldShowLeaveBtn) {
      const leaveBtn = createLeaveButton(boardID, color);
      iconContainer.appendChild(leaveBtn);
   }

   return iconContainer;
}

function createLeaveButton(boardID: number, color: Color): HTMLButtonElement {
   const leaveBtn = document.createElement("button");
   leaveBtn.className = "leave-board-btn";
   leaveBtn.textContent = "×";
   leaveBtn.addEventListener("click", () => {
      session.socket.emit("leave-board", boardID, color);
   });
   return leaveBtn;
}

function updatePlayerName(playerInfo: HTMLElement, player: any): void {
   const name = playerInfo.querySelector(".player-name-display");
   if (name) {
      name.textContent = player ? player.name : "";
      (name as HTMLElement).style.fontWeight =
         player && player.id === session.player!.id ? "bold" : "normal";
   }
}

// UI Update Functions - Time
export function updateUITime(): void {
   for (let i = 0; i < session.room!.game.matches.length; i++) {
      const matchInstance = getMatchInstance(i);
      if (!matchInstance) continue;

      const isFlipped = getBoardFlipState(i);

      const whiteTime = formatTime(matchInstance.whiteTime);
      const blackTime = formatTime(matchInstance.blackTime);

      const topTime = isFlipped ? whiteTime : blackTime;
      const bottomTime = isFlipped ? blackTime : whiteTime;

      updateTimeDisplay(i, "top", topTime);
      updateTimeDisplay(i, "bottom", bottomTime);
   }
}

function updateTimeDisplay(
   boardID: number,
   position: "top" | "bottom",
   timeString: string
): void {
   const playerInfo = document.querySelector(
      `#${position}-info-${boardID}`
   ) as HTMLElement;

   if (playerInfo) {
      const timeDisplay = playerInfo.querySelector(".player-time-display");
      if (timeDisplay) {
         timeDisplay.textContent = timeString;

         const color =
            (position === "top") === getBoardFlipState(boardID)
               ? Color.BLACK
               : Color.WHITE;
         if (
            session.room!.status === RoomStatus.PLAYING &&
            color === getMatchInstance(boardID)?.activeColor
         ) {
            (timeDisplay as HTMLElement).style.color =
               "rgba(255, 255, 255, 0.5)"; // half transparent white
         } else {
            (timeDisplay as HTMLElement).style.color = "#FFFFFF";
         }
      }
   }
}

export function updateTimeLeft(currentTime: number = Date.now()): void {
   for (let i = 0; i < session.room!.game.matches.length; i++) {
      const matchInstance = getMatchInstance(i);
      if (!matchInstance) continue;

      matchInstance.updateTime(currentTime);
   }
}

export function startTimeUpdates(): void {
   stopTimeUpdates();

   intervalID = window.setInterval(() => {
      updateTimeLeft();
      updateUITime();
   }, 100); // Update every 100ms for smooth display
}

export function stopTimeUpdates(): void {
   clearInterval(intervalID);
}

// Global Flip Control
export function updateUIAllGame(): void {
   updateUIAllBoards();
   updateUIAllPlayers();
   updateUITime();
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

function showAnnotations(
   boardID: number,
   row: number,
   col: number,
   isPocket: boolean,
   piece: Piece
): void {
   const boardInstance = getBoardInstance(boardID);
   if (!boardInstance) return;

   const isFlipped = getBoardFlipState(boardID);

   clearAnnotations(boardID);

   // Highlight source square
   if (!isPocket && !isNaN(row) && !isNaN(col)) {
      const highlightRow = isFlipped ? 7 - row : row;
      const highlightCol = isFlipped ? 7 - col : col;
      annotateSquare(boardID, highlightRow, highlightCol, ["highlight"]);
   }

   // Show legal moves
   if (isPocket) {
      for (let r = 0; r < 8; r++) {
         for (let c = 0; c < 8; c++) {
            const pos = createPosition(r, c);
            if (boardInstance.isLegalDrop(pos, piece.type, piece.color)) {
               const displayRow = isFlipped ? 7 - r : r;
               const displayCol = isFlipped ? 7 - c : c;
               annotateSquare(boardID, displayRow, displayCol, ["legal-move"]);
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
               annotateSquare(boardID, displayRow, displayCol, ["legal-move"]);
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
   const pieceType = target.dataset.pieceType as PieceType;
   const pieceColor = target.dataset.pieceColor as Color;
   const piece: Piece = { type: pieceType, color: pieceColor };
   const row = parseInt(target.dataset.row || "0");
   const col = parseInt(target.dataset.col || "0");
   const isPocket = target.dataset.pocket === "true";

   selectedPiece = {
      boardID,
      piece,
      row,
      col,
      pocket: isPocket,
   };

   showAnnotations(boardID, row, col, isPocket, piece);

   const dragImg = target.cloneNode(true) as HTMLImageElement;

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
   target.style.visibility = "hidden";

   dragElement = {
      element: dragImg,
      originalElement: target,
      startX: centerOffsetX,
      startY: centerOffsetY,
   };

   document.addEventListener("mousemove", handleMouseMove);
   document.addEventListener("mouseup", handleMouseUp);
}

function handleMouseMove(e: MouseEvent): void {
   if (!dragElement) return;
   e.preventDefault();

   const { element, startX, startY } = dragElement;

   element.style.left = e.clientX - startX + "px";
   element.style.top = e.clientY - startY + "px";
}

function handleMouseUp(e: MouseEvent): void {
   if (!selectedPiece || !dragElement) return;

   document.removeEventListener("mousemove", handleMouseMove);
   document.removeEventListener("mouseup", handleMouseUp);

   const { element, originalElement } = dragElement;

   if (element.parentNode) {
      element.parentNode.removeChild(element);
   }

   originalElement.style.visibility = "visible";

   const dropTarget = document.elementFromPoint(
      e.clientX,
      e.clientY
   ) as HTMLElement;

   const pieceSnapshot = selectedPiece;
   selectedPiece = null;
   dragElement = null;

   if (!dropTarget) {
      clearAnnotations(pieceSnapshot.boardID);
      return;
   }

   const square = dropTarget.closest(".square") as HTMLElement;
   if (!square) {
      clearAnnotations(pieceSnapshot.boardID);
      return;
   }

   const targetBoardID = parseInt(square.dataset.boardId || "0");

   if (pieceSnapshot.boardID !== targetBoardID) {
      console.warn("Cannot drop piece from different board instance");
      clearAnnotations(pieceSnapshot.boardID);
      return;
   }

   const toRow = parseInt(square.dataset.row || "0");
   const toCol = parseInt(square.dataset.col || "0");

   const boardInstance = getBoardInstance(pieceSnapshot.boardID);
   if (!boardInstance) {
      console.error("Board instance not found:", pieceSnapshot.boardID);
      clearAnnotations(pieceSnapshot.boardID);
      return;
   }

   const isFlipped = getBoardFlipState(pieceSnapshot.boardID);

   const toLogicalRow = isFlipped ? 7 - toRow : toRow;
   const toLogicalCol = isFlipped ? 7 - toCol : toCol;
   const toPosition: Position = createPosition(toLogicalRow, toLogicalCol);

   let move: Move;
   let result;

   if (pieceSnapshot.pocket) {
      const fromPosition: PocketPosition = {
         type: "pocket",
         color: pieceSnapshot.piece.color,
         pieceType: pieceSnapshot.piece.type,
      };
      move = {
         from: fromPosition,
         to: toPosition,
      };
   } else {
      const fromPosition: Position = createPosition(
         pieceSnapshot.row,
         pieceSnapshot.col
      );
      move = {
         from: fromPosition,
         to: toPosition,
      };
   }

   result = session.room!.game.tryApplyMove(pieceSnapshot.boardID, move);

   if (result.success) {
      session.socket.emit(
         "move-board",
         pieceSnapshot.boardID,
         pieceSnapshot.piece.color,
         move
      );
      if (result.capturedPiece) {
         updateUIAllBoards();
      } else {
         updateUIBoard(pieceSnapshot.boardID);
      }
   } else {
      clearAnnotations(pieceSnapshot.boardID);
   }
}
