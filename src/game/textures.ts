import * as THREE from "three";

/**
 * Procedural canvas textures. These are the performant fallback while AI
 * textures are generated in a later phase — they guarantee the city looks
 * good from day one without any network assets.
 */

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function asphaltTexture(repeat = 1): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = "#2b2d31";
  ctx.fillRect(0, 0, 512, 512);
  // Aggregate speckle
  for (let i = 0; i < 22000; i++) {
    const g = 30 + Math.random() * 40;
    const a = Math.random() * 0.25;
    ctx.fillStyle = `rgba(${g},${g},${g + 2},${a})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  noise(ctx, 512, 512, 14);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function sidewalkTexture(repeat = 1): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#8a8d93";
  ctx.fillRect(0, 0, 256, 256);
  // Concrete tiles
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  const s = 64;
  for (let x = 0; x <= 256; x += s) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  for (let y = 0; y <= 256; y += s) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  noise(ctx, 256, 256, 18);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function roadMarkingTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = "#e8e4d8";
  // dashed center line
  ctx.fillRect(124, 0, 8, 96);
  ctx.fillRect(124, 160, 8, 96);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function facadeTexture(seed = 0): THREE.CanvasTexture {
  const rnd = mulberry32(seed);
  const { c, ctx } = makeCanvas(256, 512);
  const base = 70 + rnd() * 50;
  ctx.fillStyle = `rgb(${base},${base + 8},${base + 16})`;
  ctx.fillRect(0, 0, 256, 512);
  // window grid
  const cols = 4, rows = 10;
  const mw = 256 / cols, mh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const wx = col * mw + 12 + rnd() * 8;
      const wy = r * mh + 12 + rnd() * 8;
      const ww = mw - 26, wh = mh - 26;
      // lit or dark window
      const lit = rnd() > 0.55;
      ctx.fillStyle = lit ? "rgba(255,214,140,0.9)" : "rgba(20,30,45,0.95)";
      ctx.fillRect(wx, wy, ww, wh);
      // window frame
      ctx.strokeStyle = "rgba(15,15,20,0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(wx, wy, ww, wh);
    }
  }
  noise(ctx, 256, 512, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// AI texture loading (with procedural fallback + derived normal maps)
// ---------------------------------------------------------------------------

export interface TextureSet {
  asphalt: THREE.Texture;
  sidewalk: THREE.Texture;
  grass: THREE.Texture;
  facades: THREE.Texture[];
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function toTexture(img: HTMLImageElement, repeat: number, srgb = true): THREE.Texture {
  const t = new THREE.Texture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Derive a tangent-space normal map from an albedo's luminance (cheap
 * height-field bump). Returns null if the image can't be read.
 */
function deriveNormalMap(texture: THREE.Texture, strength = 2.0): THREE.Texture | null {
  try {
    const img = texture.image as HTMLImageElement;
    if (!img || !img.width) return null;
    const w = img.width;
    const h = img.height;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const height = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const j = i * 4;
      height[i] = (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114) / 255;
    }
    const out = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xl = height[y * w + Math.max(0, x - 1)];
        const xr = height[y * w + Math.min(w - 1, x + 1)];
        const yu = height[Math.max(0, y - 1) * w + x];
        const yd = height[Math.min(h - 1, y + 1) * w + x];
        let nx = (xl - xr) * strength;
        let ny = (yu - yd) * strength;
        const nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        const o = (y * w + x) * 4;
        out.data[o] = (nx * 0.5 + 0.5) * 255;
        out.data[o + 1] = (ny * 0.5 + 0.5) * 255;
        out.data[o + 2] = (1 * 0.5 + 0.5) * 255;
        out.data[o + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    const nt = new THREE.CanvasTexture(c);
    nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
    nt.repeat.copy(texture.repeat);
    nt.colorSpace = THREE.NoColorSpace;
    nt.needsUpdate = true;
    return nt;
  } catch {
    return null;
  }
}

export async function loadTextureSet(): Promise<TextureSet> {
  const files: [keyof TextureSet | string, string, number, () => THREE.CanvasTexture][] = [
    ["asphalt", "/textures/asphalt_color.jpg", 1, () => asphaltTexture(1)],
    ["sidewalk", "/textures/sidewalk_color.jpg", 1, () => sidewalkTexture(1)],
    ["grass", "/textures/grass_color.jpg", 1, () => grassTexture()],
    ["facade0", "/textures/facade_glass.jpg", 1, () => facadeTexture(0)],
    ["facade1", "/textures/facade_brick.jpg", 1, () => facadeTexture(1)],
    ["facade2", "/textures/facade_concrete.jpg", 1, () => facadeTexture(2)],
    ["facade3", "/textures/facade_stone.jpg", 1, () => facadeTexture(3)],
  ];

  const results = await Promise.all(
    files.map(async ([key, url, repeat, fallback]) => {
      const img = await loadImage(url);
      if (img) {
        const tex = toTexture(img, repeat);
        return [key as string, tex] as const;
      }
      return [key as string, fallback()] as const;
    }),
  );

  const get = (k: string) => results.find(([key]) => key === k)![1];

  return {
    asphalt: get("asphalt"),
    sidewalk: get("sidewalk"),
    grass: get("grass"),
    facades: [get("facade0"), get("facade1"), get("facade2"), get("facade3")],
  };
}

/** Attach derived normal maps to bumpy surfaces for extra realism. */
export function enhanceWithNormals(set: TextureSet) {
  const apply = (tex: THREE.Texture, scale: number) => {
    const n = deriveNormalMap(tex, scale);
    return n;
  };
  return {
    asphaltNormal: apply(set.asphalt, 3.5),
    sidewalkNormal: apply(set.sidewalk, 2.0),
    facadesNormal: set.facades.map((f) => apply(f, 1.6)),
  };
}

export function grassTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#3e4a2f";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8000; i++) {
    const g = 50 + Math.random() * 50;
    ctx.fillStyle = `rgba(${g * 0.7},${g},${g * 0.5},${Math.random()})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 2 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
