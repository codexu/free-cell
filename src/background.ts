export const BACKGROUND_STORAGE_KEY = 'freecell-table-photo-v1';
const KEY = BACKGROUND_STORAGE_KEY;
export function loadBackground(): string | null {
  try {
    const photo = localStorage.getItem(KEY);
    return photo?.startsWith('data:image/jpeg;base64,') && photo.length <= 1500000 ? photo : null;
  } catch { return null; }
}
export function saveBackground(photo: string | null) {
  if (photo) localStorage.setItem(KEY, photo);
  else localStorage.removeItem(KEY);
}
export async function prepareBackground(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('请选择 JPG、PNG、WebP 或 AVIF 图片');
  if (file.size > 20 * 1024 * 1024) throw new Error('图片请小于 20 MB');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('无法读取图片，请尝试 JPG 或 PNG')); image.src = url; });
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前设备无法处理图片');
    context.fillStyle = '#163e32'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL('image/jpeg', .75);
    if (result.length > 1500000) result = canvas.toDataURL('image/jpeg', .45);
    if (!result.startsWith('data:image/jpeg;') || result.length > 1500000) throw new Error('图片过大，请换一张更小的照片');
    return result;
  } finally { URL.revokeObjectURL(url); }
}
