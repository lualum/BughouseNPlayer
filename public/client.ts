import { initSession } from "./session";
import { initSocketEvents } from "./socket";
import { checkURLForRoom } from "./url";
import { initGameControls } from "./gameUI";
import { initMenuControls } from "./menuUI";

document.addEventListener("DOMContentLoaded", () => {
   (function () {
      initSession();
      initSocketEvents();
      initMenuControls();
      initGameControls();
      checkURLForRoom();
   })();
});
