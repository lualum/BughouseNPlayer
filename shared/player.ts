import { Team } from "./room";

export enum PlayerStatus {
   READY = "ready",
   NOT_READY = "not-ready",
   DISCONNECTED = "disconnected",
}

export class Player {
   id: string;
   name: string;

   status: PlayerStatus;
   team: Team | undefined;

   constructor(
      id: string,
      name: string = "Player",
      status: PlayerStatus = PlayerStatus.NOT_READY
   ) {
      this.id = id;
      this.name = name;
      this.status = status;
   }
}
