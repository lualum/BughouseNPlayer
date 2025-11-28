export enum PlayerStatus {
   READY = "ready",
   NOT_READY = "not-ready",
   DISCONNECTED = "disconnected",
}

export class Player {
   id: string;
   name: string;
   status: PlayerStatus;

   constructor(
      id: string,
      name: string = "Player",
      status: PlayerStatus = PlayerStatus.NOT_READY
   ) {
      this.id = id;
      this.name = name;
      this.status = status;
   }

   serialize(): any {
      return {
         id: this.id,
         name: this.name,
         ready: this.status,
      };
   }

   static deserialize(data: any): Player {
      return new Player(data.id, data.name, data.ready);
   }
}
