import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';
import type { ArticleImage } from '../app/posts/markdown-utils';

// Read only local image headers at build time; remote images use a stable fallback frame.
export function withImageSize(image: ArticleImage, publicDir = path.join(process.cwd(), 'public')): ArticleImage {
  if (!image.src.startsWith('/') || image.src.startsWith('//')) return image;
  try {
    const pathname = decodeURIComponent(image.src.split(/[?#]/)[0]);
    const root = path.resolve(publicDir);
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) return image;
    const size = imageSize(fs.readFileSync(file));
    return size.width && size.height ? { ...image, width: size.width, height: size.height } : image;
  } catch { return image; }
}
