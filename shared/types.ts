import { ChatMessage } from "./chat";
import { Player } from "./player";

export interface RoomData {
   roomCode: string;
   players: Player[];
   chatMessages: ChatMessage[];
}

