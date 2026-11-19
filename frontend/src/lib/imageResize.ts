/**
 * Prepara imagens de logo/banner para salvar: redimensiona e comprime no navegador. A imagem original de um
 * celular tem vários MB; o painel guarda a imagem como data URL e o portal público a baixa a cada visita, então ela
 * precisa ficar leve (algumas dezenas de KB). O backend recusa mais de ~1,5 MB (TenantDtos.MAX_IMAGE_CHARS).
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // o que a tela promete ("máx. 5 MB")
export const MAX_RESULT_CHARS = 1_900_000;       // abaixo do limite do backend (2.000.000)

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export class ImageError extends Error {}

/** Cabe em maxW×maxH mantendo a proporção; nunca amplia. */
export function fitWithin(w: number, h: number, maxW: number, maxH: number): { width: number; height: number } {
  const scale = Math.min(1, maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ImageError('Não foi possível ler essa imagem. Tente outro arquivo.')); };
    img.src = url;
  });
}

/** Valida, redimensiona e devolve a imagem como data URL (WebP; JPEG se o navegador não gera WebP). */
export async function prepareImage(file: File, maxW: number, maxH: number): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new ImageError('Use uma imagem PNG, JPG, WebP ou GIF.');
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageError('A imagem passa de 5 MB. Escolha uma menor.');

  const img = await loadImage(file);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxW, maxH);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Seu navegador não conseguiu processar a imagem.');
  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    let out = canvas.toDataURL('image/webp', quality);
    if (!out.startsWith('data:image/webp')) {
      // Navegador sem WebP: JPEG sobre fundo branco (JPEG não tem transparência).
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      out = canvas.toDataURL('image/jpeg', quality);
    }
    if (out.length <= MAX_RESULT_CHARS) return out;
  }
  throw new ImageError('Mesmo reduzida, a imagem ficou grande demais. Escolha outra.');
}
