/**
 * Fotos das notas: reduz no próprio celular antes de enviar
 * (uma foto de 4 MB vira ~250 KB), o que deixa o envio rápido mesmo com sinal fraco na estrada.
 */
export interface PhotoPayload {
  data: string;
  thumb: string;
}

const FULL_MAX = 1600;
const THUMB_MAX = 320;

async function decode(file: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; close: () => void }> {
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return { img: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      /* cai no <img> abaixo */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Não foi possível abrir esta imagem. Tire a foto de novo.");
  }
}

function draw(src: { img: CanvasImageSource; w: number; h: number }, max: number, quality: number) {
  const scale = Math.min(1, max / Math.max(src.w, src.h));
  const w = Math.max(1, Math.round(src.w * scale));
  const h = Math.max(1, Math.round(src.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src.img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function compressPhoto(file: Blob): Promise<PhotoPayload> {
  const src = await decode(file);
  try {
    return { data: draw(src, FULL_MAX, 0.72), thumb: draw(src, THUMB_MAX, 0.6) };
  } finally {
    src.close();
  }
}
