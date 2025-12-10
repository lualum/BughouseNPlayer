import { io, Socket } from "socket.io-client";
import { Player } from "../shared/player";
import { Room } from "../shared/room";
import { Settings } from "./settings";

export class Session {
   socket: Socket;
   room: Room | null;
   player: Player | null;
   auth: string;
   settings: Settings;

   constructor(id?: string, auth?: string) {
      if (id && auth) {
         this.socket = io({
            auth: {
               playerID: id,
               token: auth,
            },
         });
      } else {
         this.socket = io();
      }

      this.room = null;
      this.player = id ? new Player(id) : null;
      this.auth = auth || "";
      this.settings = new Settings();

      if (this.settings.logSocket) {
         // Log all incoming socket events
         this.socket.onAny((event, ...args) => {
            console.log(
               `%c⬇ [RECEIVE] ${event}`,
               "color: #2196F3; font-weight: bold",
               args
            );
         });

         // Log all outgoing socket events
         const originalEmit = this.socket.emit.bind(this.socket);
         this.socket.emit = function (event: string, ...args: unknown[]) {
            console.log(
               `%c⬆ [EMIT] ${event}`,
               "color: #4CAF50; font-weight: bold",
               args
            );
            return originalEmit(event, ...args);
         };
      }
   }

   resetSession(): void {
      this.room = null;
      this.player = null;
      this.auth = "";
   }
}

export function initSession() {
   // const id = sessionStorage.getItem("id");
   // const auth = sessionStorage.getItem("auth");

   // if (id && auth) {
   //    session = new Session(id, auth);
   // } else {
   //    session = new Session();
   // }
   sn = new Session();
   return sn;
}

export let sn: Session;
