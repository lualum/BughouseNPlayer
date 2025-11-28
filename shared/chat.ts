export interface ChatMessage {
   id: string;
   message: string;
}

export class Chat {
   messages: ChatMessage[];

   constructor() {
      this.messages = [];
   }

   serialize(): any {
      return {
         messages: this.messages,
      };
   }

   static deserialize(data: any): Chat {
      const chat = new Chat();
      chat.messages = data.messages || [];
      return chat;
   }

   push(id: string, message: string): void {
      this.messages.push({ id: id, message: message });
      if (this.messages.length > 100) {
         this.messages.shift();
      }
   }
}
