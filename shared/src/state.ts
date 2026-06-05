import { Point, Direction, Snake } from "./types";
import {
    COLS,
    ROWS,
    INITIAL_LENGTH,
    FRUIT_COUNT,
    BLINK_DURATION,
} from "./config";

export interface GameHooks {
    onMove: (pid: number, dir: Direction) => void;
    onFruitEaten: (pid: number, id: number, point: Point | null) => void;
    onDied: (pid: number, reason: string) => void;
    onResult: (winner: number | null, scores: [number, number]) => void;
    startLoop: () => void;
    showGame: () => void;
}

export class State {
    gameRunning: boolean = false;
    snakes: (Snake | null)[] = [null, null];
    fruits: Map<number, Point> = new Map();
    score: [number, number] = [0, 0];
    combo: [number, number] = [0, 0];
    lastUpdated: number = 0;
    blinkStart: number = 0;
    hooks!: GameHooks;

    setHooks(hooks: GameHooks) {
        this.hooks = hooks;
    }

    startRound(begin?: boolean, initialFruits?: Point[]): void {
        if (begin) this.score = [0, 0];
        this.combo = [0, 0];
        this.hooks.showGame();
        this.startSnakes();

        this.fruits.clear();
        if (initialFruits && initialFruits.length > 0) {
            for (let i = 0; i < initialFruits.length; i++)
                this.fruits.set(i, initialFruits[i]);
        } else {
            for (let i = 0; i < FRUIT_COUNT; i++) {
                const loc = this.getFruitLoc(i);
                if (loc) this.fruits.set(i, loc);
            }
        }

        this.gameRunning = false;
        this.blinkStart = performance.now();
        setTimeout(() => {
            this.blinkStart = 0;
            this.gameRunning = true;
            this.lastUpdated = performance.now();
        }, BLINK_DURATION);

        this.hooks.startLoop();
    }

    private startSnakes(): void {
        this.startSnake(0);
        this.startSnake(1);
    }

    private startSnake(pid: number): void {
        const headX = pid === 0 ? INITIAL_LENGTH : COLS - INITIAL_LENGTH - 1;
        const headY = Math.floor(ROWS / 2);
        const dir: Direction = pid === 0 ? [1, 0] : [-1, 0];
        const tailDx = pid === 0 ? -1 : 1;

        const body: Point[] = [];
        for (let i = 0; i < INITIAL_LENGTH; i++) {
            body.push([headX + tailDx * i, headY]);
        }

        this.snakes[pid] = { body, dir, spos: 0, deathStart: undefined };
    }

    getFruitLoc(id: number): Point | null {
        const candidates: boolean[][] = Array.from({ length: COLS }, () =>
            new Array(ROWS).fill(true),
        );

        for (const s of this.snakes) {
            if (!s) continue;
            for (const [bx, by] of s.body) candidates[bx][by] = false;
        }

        for (const [fx, fy] of this.fruits.values()) {
            candidates[fx][fy] = false;
        }

        const openCells: Point[] = [];
        for (let x = 0; x < COLS; x++)
            for (let y = 0; y < ROWS; y++)
                if (candidates[x][y]) openCells.push([x, y]);

        if (openCells.length === 0) return null;

        const choice = openCells[Math.floor(Math.random() * openCells.length)];
        return choice;
    }

    moveSnake(pid: number, dir: Direction, force = false): void {
        const s = this.snakes[pid];

        if (!s) return;
        if (!force && s.spos < 1) return;

        s.spos = Math.max(0, s.spos - 1);
        s.dir = dir;

        const nx = s.body[0][0] + dir[0];
        const ny = s.body[0][1] + dir[1];
        s.body.unshift([nx, ny]);

        // Collision detection (wall, self, opponent) is intentionally absent here.
        // The server is the sole authority on deaths and will broadcast a "died"
        // message to both clients when a collision is detected. Clients only
        // apply visual movement; calling kill() locally causes the desync where
        // one client shows a death the other never received.

        let fruitEaten = false;

        for (const [fid, [fx, fy]] of this.fruits) {
            if (fx === nx && fy === ny) {
                // Remove the eaten fruit locally; the server is the sole authority
                // on where the replacement spawns. The new position arrives via
                // the "fruit_eaten" broadcast and is applied in network.ts.
                this.fruits.delete(fid);
                fruitEaten = true;
                this.hooks.onFruitEaten(pid, fid, null);
                break;
            }
        }

        if (!fruitEaten) s.body.pop();

        this.hooks.onMove(pid, dir);
    }

    kill(pid: number, reason: string): void {
        this.gameRunning = false;
        this.blinkStart = 0;
        const s = this.snakes[pid];
        if (s) s.deathStart = performance.now();
        this.hooks.onDied(pid, reason);
    }

    handleResult(winner: number | null, scores: [number, number]): void {
        this.gameRunning = false;
        this.blinkStart = 0;
        this.hooks.onResult(winner, scores);
    }
}
