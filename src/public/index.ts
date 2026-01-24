import { initSession, sn } from "./models/session";
import { initGameSocket } from "./screens/game/game-socket";
import { initGameControls } from "./screens/game/game-ui";
import { initMenuSocket } from "./screens/menu/menu-socket";
import {
  checkAndPromptForName,
  initMenuControls,
} from "./screens/menu/menu-ui";

// Load screen HTML dynamically
async function loadScreen(
  screenPath: string,
  containerId: string = "app",
): Promise<void> {
  try {
    const response = await fetch(screenPath);
    
    if (!response.ok) {
      console.error(`Failed to load ${screenPath}: HTTP ${response.status}`);
      return;
    }
    
    const html = await response.text();
    // Fix: Add # prefix for ID selector
    const container = document.querySelector(`#${containerId}`);
    
    if (!container) {
      console.error(`Container "#${containerId}" not found in DOM`);
      return;
    }
    
    container.insertAdjacentHTML("beforeend", html);
    console.log(`Successfully loaded ${screenPath}`);
  } catch (error) {
    console.error(`Error loading ${screenPath}:`, error);
  }
}


// Show/hide screens
export function showScreen(screenId: string): void {
  // Hide all screens
  document.querySelectorAll('[data-screen]').forEach(screen => {
    (screen as HTMLElement).style.display = 'none';
  });
  
  // Show requested screen
  const targetScreen = document.querySelector(`[data-screen="${screenId}"]`);
  if (targetScreen) {
    (targetScreen as HTMLElement).style.display = 'block';
    console.log(`Showing screen: ${screenId}`);
  } else {
    console.error(`Screen with data-screen="${screenId}" not found in DOM`);
  }
}

// Check URL for room code and auto-join
function checkURLForRoom(): void {
  const pathParts = globalThis.location.pathname.split("/");
  const roomCode = pathParts[2];
  
  if (
    roomCode &&
    roomCode.length === 4 &&
    checkAndPromptForName(() => {
      globalThis.history.replaceState({}, "", "/");
      sn.socket.emit("join-room", roomCode);
    })
  ) {
    globalThis.history.replaceState({}, "", "/");
    sn.socket.emit("join-room", roomCode);
  }
}

// Update URL with room code
export function updateURL(roomCode: string): void {
  const newPath = `/games/${roomCode}`;
  globalThis.history.replaceState({}, "", newPath);
}

// Initialize application
async function init(): Promise<void> {
  console.log("Initializing application...");
  
  // Load all screens
  await loadScreen("/screens/menu/menu.html");
  await loadScreen("/screens/game/game.html");

  // Initialize session and sockets
  initSession();
  initMenuSocket();
  initMenuControls();
  initGameSocket();
  initGameControls();
  
  // Show menu screen by default
  showScreen('menu');
  
  // Check if URL contains a room code to auto-join
  checkURLForRoom();
  
  console.log("Application initialized");
}

// Start app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  init();
});