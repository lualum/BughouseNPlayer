import { initGameControls } from "./gameUI";
import { initMenuControls } from "./menuUI";
import { initSession } from "./session";
import { initSocketEvents } from "./socket";
import { checkURLForRoom } from "./url";

document.addEventListener("DOMContentLoaded", () => {
   (function () {
      initSession();
      initSocketEvents();
      initMenuControls();
      initGameControls();
      checkURLForRoom();
   })();
});
