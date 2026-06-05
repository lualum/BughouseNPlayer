# Snake MP

A real-time two-player snake game played in the browser. Two players connect to a shared room and race to eat fruit, outscore each other, and force their opponent into a wall or their own body. The server is the sole authority on collisions, scores, and round progression — the client handles only rendering and input.

## How to Play

Two players are needed. One player creates a room and shares the room code; the other enters it to join. The match starts automatically once both are connected.

Each player controls their snake with arrow keys or WASD. The goal is to eat as many fruits as possible while avoiding walls, your own body, and your opponent's body. Eating fruits in quick succession builds a combo multiplier that increases your score gain. Running into anything kills your snake and ends the round.

A match runs for multiple rounds. After each death the round restarts automatically. When the match ends, either player can press "play again" — once both confirm, a new match begins from zero.

## Scoring

Fruit pickups are scored server-side the moment the server processes the eating snake's move. A combo counter increments each time the same player eats consecutive fruits without dying. The opponent's combo resets to zero whenever you eat. Dying resets both combos.

The HUD shows both players' live scores and the current combo state. Final scores are displayed on the result screen.
