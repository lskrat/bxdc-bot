import twemoji from 'twemoji';

/** Fixed-version CDN assets (task: CSP allow `img-src` for cdn.jsdelivr.net if needed). */
export const TWEMOJI_ASSETS_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/';

function buildTwemojiUrl(emoji: string, folder: 'svg' | '72x72', ext: string): string | null {
  if (!emoji || emoji.startsWith('http') || emoji.startsWith('data:')) {
    return null;
  }
  try {
    const code = twemoji.convert.toCodePoint(emoji);
    if (!code) return null;
    return `${TWEMOJI_ASSETS_BASE}${folder}/${code}${ext}`;
  } catch {
    return null;
  }
}

/**
 * Twemoji SVG URL（用 codepoint 直链，避免 parse+正则 在部分构建/环境下取不到 src）。
 */
export function emojiToTwemojiSvgUrl(emoji: string): string | null {
  return buildTwemojiUrl(emoji, 'svg', '.svg');
}

/** PNG 备选（SVG 加载失败时降级）。 */
export function emojiToTwemojiPngUrl(emoji: string): string | null {
  return buildTwemojiUrl(emoji, '72x72', '.png');
}

/** 无 emoji 字形的占位图（避免 SVG 里写字符导致显示成系统彩色 emoji） */
export function neutralAvatarPlaceholderDataUri(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="#e8e8e8" rx="8"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/**
 * 头像展示 URL：优先 Twemoji SVG，失败路径由 img @error 再试 PNG / 占位。
 */
export function avatarDisplayUrl(emoji: string): string {
  const safe = emoji || '👤';
  if (safe.startsWith('http') || safe.startsWith('data:')) {
    return safe;
  }
  const tw = emojiToTwemojiSvgUrl(safe);
  if (tw) return tw;
  return neutralAvatarPlaceholderDataUri();
}
