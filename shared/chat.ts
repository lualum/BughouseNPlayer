export interface ChatMessage {
   id: string;
   message: string;
}

export class Chat {
   messages: ChatMessage[];

   constructor() {
      this.messages = [];
   }

   push(id: string, message: string): void {
      this.messages.push({ id: id, message: message });
      if (this.messages.length > 100) {
         this.messages.shift();
      }
   }
}
