import { computePositions, type GraphInput, type Positions } from './graph-layout.ts';

// A module worker's global is a DedicatedWorkerGlobalScope, but that lib type
// isn't in the app's tsconfig. Narrow `self` to just the bits we use, which
// also avoids clashing with Window's differently-typed postMessage.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<GraphInput>) => void) | null;
  postMessage: (message: Positions) => void;
};

ctx.onmessage = (event) => {
  ctx.postMessage(computePositions(event.data));
};
