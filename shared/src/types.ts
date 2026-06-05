export type Point = [number, number];
export type Direction = [1, 0] | [-1, 0] | [0, 1] | [0, -1];

export interface Snake {
    body: Point[];
    spos: number;
    dir: Direction;
    deathStart?: number;
}

// Client → Server

export interface MsgCreate {
    type: "create";
}

export interface MsgJoin {
    type: "join";
    code: string;
}

export interface MsgMove {
    type: "move";
    dir: Direction;
    t: number;
}

// Sent by the dying player; server relays as MsgDied and schedules round_restart.
export interface MsgDiedRelay {
    type: "died_relay";
    pid: number;
    reason: string;
}

// Sent by the client that computed the match result; server relays as MsgResult.
export interface MsgResultRelay {
    type: "result_relay";
    winner: number | null;
    scores: [number, number];
}

export interface MsgRestart {
    type: "restart";
}

// Server → Client

export interface MsgCreated {
    type: "created";
    code: string;
}

export interface MsgStart {
    type: "start";
    pid: number;
    code: string;
    fruits: Point[];
}

export interface MsgError {
    type: "error";
    msg: string;
}

export interface MsgDied {
    type: "died";
    pid: number;
    reason: string;
    score: [number, number];
}

export interface MsgResult {
    type: "result";
    winner: number | null;
    scores: [number, number];
}

export interface MsgFruitEaten {
    type: "fruit_eaten";
    pid: number;
    fruitId: number;
    newFruit: Point | null;
    score: [number, number];
    combo: number;
}

// Sent to both clients after a mid-round death; carries fresh fruit positions.
export interface MsgRoundRestart {
    type: "round_restart";
    fruits: Point[];
}

// Sent to both clients after both press play again after a match result.
export interface MsgRestartAck {
    type: "restart_ack";
    fruits: Point[];
}

export interface MsgRestartWaiting {
    type: "restart_waiting";
}

export interface MsgOpponentRestart {
    type: "opponent_restart";
}

export interface MsgOpponentLeft {
    type: "opponent_left";
}

export type WsMessage =
    | MsgCreate
    | MsgJoin
    | MsgMove
    | MsgDiedRelay
    | MsgResultRelay
    | MsgRestart
    | MsgCreated
    | MsgStart
    | MsgError
    | MsgDied
    | MsgResult
    | MsgFruitEaten
    | MsgRoundRestart
    | MsgRestartAck
    | MsgRestartWaiting
    | MsgOpponentRestart
    | MsgOpponentLeft;
