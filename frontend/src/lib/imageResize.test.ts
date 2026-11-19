import { describe, expect, it } from 'vitest';
import { ImageError, MAX_UPLOAD_BYTES, fitWithin, prepareImage } from './imageResize';

describe('fitWithin', () => {
  it('reduz mantendo a proporção', () => {
    expect(fitWithin(3200, 1400, 1600, 600)).toEqual({ width: 1371, height: 600 });
    expect(fitWithin(2000, 1000, 512, 512)).toEqual({ width: 512, height: 256 });
  });

  it('nunca amplia imagem pequena', () => {
    expect(fitWithin(200, 100, 512, 512)).toEqual({ width: 200, height: 100 });
  });

  it('nunca devolve dimensão zero', () => {
    expect(fitWithin(10000, 1, 100, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe('prepareImage (validações antes de processar)', () => {
  it('recusa arquivo que não é imagem aceita', async () => {
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await expect(prepareImage(pdf, 512, 512)).rejects.toThrow(ImageError);
    await expect(prepareImage(pdf, 512, 512)).rejects.toThrow(/PNG, JPG, WebP ou GIF/);
  });

  it('recusa imagem acima de 5 MB', async () => {
    const big = new File(['x'], 'grande.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    await expect(prepareImage(big, 512, 512)).rejects.toThrow(/5 MB/);
  });
});
