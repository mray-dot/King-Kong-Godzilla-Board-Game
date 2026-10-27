export type Side = "kong" | "godzilla";
export type Point = number; // row * 5 + col
export type Board = (Side | null)[];
export type Move = { from?: Point; to: Point; capture?: Point };

export const BOARD_SIZE = 5;
export const TOTAL_GODZILLAS = 20;
export const CAPTURES_TO_WIN = 5;

export const point = (row: number, col: number): Point => row * BOARD_SIZE + col;
export const coords = (p: Point) => ({ row: Math.floor(p / BOARD_SIZE), col: p % BOARD_SIZE });
export const labelPoint = (p: Point) => {
  const { row, col } = coords(p);
  return `${String.fromCharCode(65 + row)}${col + 1}`;
};

/**
 * Graph edges:
 * - all horizontal/vertical adjacent intersections
 * - unit edges on the two corner-to-corner diagonals
 * - unit edges on the diamond formed by edge midpoints:
 *   top midpoint ↔ left/right midpoint ↔ bottom midpoint.
 */
const edgeSet = new Set<string>();
const addEdge = (a: Point, b: Point) => {
  if (a === b) return;
  edgeSet.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
};
for (let r = 0; r < BOARD_SIZE; r++) {
  for (let c = 0; c < BOARD_SIZE; c++) {
    const a = point(r, c);
    if (c < 4) addEdge(a, point(r, c + 1));
    if (r < 4) addEdge(a, point(r + 1, c));
    if (r < 4 && c < 4 && (r === c || r + c === 3 || r + c === 4)) {
      addEdge(a, point(r + 1, c + 1));
    }
    if (r < 4 && c > 0 && (r === c || r + c === 4 || r + c === 5)) {
      addEdge(a, point(r + 1, c - 1));
    }
  }
}
export const EDGES = [...edgeSet].map(e => e.split(":").map(Number) as [Point, Point]);
const adjacency: Point[][] = Array.from({ length: 25 }, () => []);
for (const [a, b] of EDGES) { adjacency[a].push(b); adjacency[b].push(a); }
export const neighbors = (p: Point) => adjacency[p];

export function initialBoard(): Board {
  const board: Board = Array(25).fill(null);
  board[point(0, 0)] = "kong";
  board[point(0, 4)] = "kong";
  board[point(4, 0)] = "kong";
  board[point(4, 4)] = "kong";
  return board;
}
export type GameState = {
  board: Board;
  turn: Side;
  phase: "placing" | "moving" | "finished";
  reserve: number;
  captures: number;
  winner: Side | null;
  lastMove: Move | null;
  message: string;
};
export function initialGame(): GameState {
  return {
    board: initialBoard(), turn: "godzilla", phase: "placing",
    reserve: TOTAL_GODZILLAS, captures: 0, winner: null, lastMove: null,
    message: "Godzilla places the first piece."
  };
}
export function legalMoves(state: GameState, side: Side = state.turn): Move[] {
  if (state.phase === "finished") return [];
  // During deployment, Godzilla's move is a placement (no `from` point).
  // Returning these moves here is important because applyMove validates against
  // legalMoves; without this branch every placement throws "That move is not legal.".
  if (state.phase === "placing" && side === "godzilla") {
    return state.board.flatMap((piece, to) => piece === null ? [{ to }] : []);
  }
  const moves: Move[] = [];
  for (let from = 0; from < 25; from++) {
    if (state.board[from] !== side) continue;
    for (const to of neighbors(from)) {
      if (state.board[to] !== null) continue;
      if (side === "godzilla") {
        if (state.phase === "moving") moves.push({ from, to });
      } else {
        moves.push({ from, to });
        // Capture is only possible along two consecutive edges on the same straight line.
        const a = coords(from), b = coords(to);
        const dr = b.row - a.row, dc = b.col - a.col;
        const beyondR = b.row + dr, beyondC = b.col + dc;
        if (beyondR < 0 || beyondR >= 5 || beyondC < 0 || beyondC >= 5) continue;
        const beyond = point(beyondR, beyondC);
        if (state.board[to] === null && state.board[beyond] === null) {
          // The jumped point must be occupied by Godzilla; check each possible adjacent point.
          // `to` here is the adjacent point, so a capture destination is calculated separately.
        }
      }
    }
  }
  if (side === "kong") {
    for (let from = 0; from < 25; from++) {
      if (state.board[from] !== "kong") continue;
      const a = coords(from);
      for (const middle of neighbors(from)) {
        if (state.board[middle] !== "godzilla") continue;
        const b = coords(middle);
        const dr = b.row - a.row, dc = b.col - a.col;
        const rr = b.row + dr, cc = b.col + dc;
        if (rr < 0 || rr > 4 || cc < 0 || cc > 4) continue;
        const to = point(rr, cc);
        if (state.board[to] !== null) continue;
        if (neighbors(middle).includes(to)) moves.push({ from, to, capture: middle });
      }
    }
  }
  return moves;
}
export function applyMove(state: GameState, move: Move): GameState {
  if (state.phase === "finished" || state.winner) throw new Error("This game has finished.");
  const legal = legalMoves(state);
  const found = legal.find(m => m.from === move.from && m.to === move.to && m.capture === move.capture);
  if (!found) throw new Error("That move is not legal.");
  const board = [...state.board];
  let reserve = state.reserve, captures = state.captures;
  if (state.turn === "godzilla" && state.phase === "placing") {
    if (board[found.to] !== null || reserve <= 0) throw new Error("Choose an empty intersection.");
    board[found.to] = "godzilla";
    reserve--;
  } else {
    if (found.from === undefined) throw new Error("A source point is required.");
    board[found.from] = null;
    board[found.to] = state.turn;
    if (found.capture !== undefined) { board[found.capture] = null; captures++; }
  }
  const phase = reserve === 0 && state.phase === "placing" ? "moving" : state.phase;
  const nextTurn: Side = state.turn === "kong" ? "godzilla" : "kong";
  let next: GameState = {
    board, turn: nextTurn, phase, reserve, captures, winner: null, lastMove: found,
    message: found.capture !== undefined
      ? `King Kong captured a Godzilla! ${captures} captured.`
      : state.turn === "godzilla" && state.phase === "placing"
        ? `Godzilla deployed. ${reserve} remaining in reserve.`
        : `${nextTurn === "kong" ? "King Kong" : "Godzilla"}'s turn.`
  };
  if (captures >= CAPTURES_TO_WIN) {
    next = { ...next, phase: "finished", winner: "kong", message: "King Kong wins by capturing five Godzillas!" };
  } else if (legalMoves(next, nextTurn).length === 0) {
    // Placement is always available if there are empty points and reserve pieces.
    if (!(nextTurn === "godzilla" && phase === "placing" && reserve > 0 && board.some(x => x === null))) {
      next = { ...next, phase: "finished", winner: nextTurn === "kong" ? "godzilla" : "kong",
        message: nextTurn === "kong" ? "Godzilla wins: every Kong is trapped!" : "King Kong wins: no legal Godzilla move remains." };
    }
  }
  return next;
}
export function placementMoves(state: GameState): Move[] {
  if (state.turn !== "godzilla" || state.phase !== "placing") return [];
  return state.board.flatMap((piece, to) => piece === null ? [{ to }] : []);
}
export function allLegalForTurn(state: GameState): Move[] {
  return state.phase === "placing" ? placementMoves(state) : legalMoves(state);
}
