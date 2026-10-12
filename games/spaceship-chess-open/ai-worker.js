/* AI in a Web Worker so the UI keeps 60fps while the computer thinks. */
importScripts('rules.js');
self.onmessage = (e) => {
  const { id, board, turn, ms } = e.data;
  const st = self.RULES.fromBoard(board, turn);
  const r = self.RULES.search(st, { ms: ms || 900 });
  self.postMessage({ id, move: r.move, depth: r.depth, ms: r.ms, nodes: r.nodes });
};
