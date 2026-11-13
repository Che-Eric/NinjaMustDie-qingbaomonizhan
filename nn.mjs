// Tiny MLP inference in the browser (matches policy_v2.Policy forward).
let W = null, manifest = null;

export function setWeights(bin, man) {
  manifest = man;
  const all = bin instanceof Float32Array ? bin : new Float32Array(bin);
  const [I, H, O] = [man.input, man.hidden, man.output];
  let o = 0;
  const take = (n) => { const a = all.subarray(o, o + n); o += n; return a; };
  W = { w1: take(I * H), b1: take(H), w2: take(H * H), b2: take(H), w3: take(H * O), b3: take(O), I, H, O };
  return manifest;
}

export async function loadModel(base = '.') {
  const [bin, man] = await Promise.all([
    fetch(`${base}/weights.bin`).then(r => r.arrayBuffer()),
    fetch(`${base}/weights.json`).then(r => r.json()),
  ]);
  return setWeights(bin, man);
}

function layer(x, w, b, nIn, nOut, relu) {
  const out = new Float32Array(nOut);
  for (let j = 0; j < nOut; j++) {
    let s = b[j];
    const row = j * nIn;
    for (let i = 0; i < nIn; i++) s += w[row + i] * x[i];
    out[j] = relu && s < 0 ? 0 : s;
  }
  return out;
}

export function logits(vec, mask) {
  const h1 = layer(vec, W.w1, W.b1, W.I, W.H, true);
  const h2 = layer(h1, W.w2, W.b2, W.H, W.H, true);
  const lg = layer(h2, W.w3, W.b3, W.H, W.O, false);
  for (let i = 0; i < W.O; i++) if (!mask[i]) lg[i] = -Infinity;
  return lg;
}

export function choose(vec, mask, greedy = false) {
  const lg = logits(vec, mask);
  if (greedy) {
    let best = 0;
    for (let i = 1; i < lg.length; i++) if (lg[i] > lg[best]) best = i;
    return best;
  }
  let max = -Infinity;
  for (const v of lg) if (v > max) max = v;
  let sum = 0;
  const ex = new Float32Array(lg.length);
  for (let i = 0; i < lg.length; i++) { ex[i] = Math.exp(lg[i] - max); sum += ex[i]; }
  let r = Math.random() * sum;
  for (let i = 0; i < ex.length; i++) { r -= ex[i]; if (r <= 0) return i; }
  return ex.length - 1;
}