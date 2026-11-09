const AUTHOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SITE_ORIGIN = 'https://scc10.com.br';
const profileCache = new Map();

function absoluteUrl(value) {
  try {
    return new URL(value, SITE_ORIGIN).toString();
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function imageScore(image, authorName) {
  const text = normalizeText(`${image.alt} ${image.className} ${image.src}`);
  let score = 0;
  if (/author|autor|avatar|perfil|profile|user/.test(text)) score += 5;
  const authorTokens = normalizeText(authorName).split(/\s+/).filter(token => token.length > 3);
  score += authorTokens.filter(token => text.includes(token)).length;
  return score;
}

function extractImages(html) {
  const images = [];
  const pattern = /<img\b([^>]+)>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    const attrs = match[1];
    const src = attrs.match(/\b(?:src|data-src)=['"]([^'"]+)['"]/i)?.[1];
    if (!src) continue;
    images.push({
      src: absoluteUrl(src),
      alt: attrs.match(/\balt=['"]([^'"]*)['"]/i)?.[1] || '',
      className: attrs.match(/\bclass=['"]([^'"]*)['"]/i)?.[1] || ''
    });
  }
  return images.filter(image => image.src);
}

export function parseAuthorProfileHtml(html, authorName = '') {
  const source = String(html || '');
  const authorLink = source.match(/<a\b[^>]+href=['"]([^'"]*\/author\/[^'"]+)['"][^>]*>/i)?.[1];
  const profileUrl = authorLink ? absoluteUrl(authorLink) : null;
  const images = extractImages(source).sort((a, b) => imageScore(b, authorName) - imageScore(a, authorName));
  const image = images.find(candidate => imageScore(candidate, authorName) > 0) || null;
  return { profileUrl, imageUrl: image?.src || null };
}

async function fetchHtml(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'SCC10-GA4-Dashboard/1.0 (+author-profile-cache)' }
  });
  if (!response.ok) throw new Error(`Portal retornou HTTP ${response.status}.`);
  return response.text();
}

export async function resolveAuthorProfile(authorName, articlePath, fetchImpl = fetch) {
  const cacheKey = normalizeText(authorName);
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  if (!articlePath) return { profileUrl: null, imageUrl: null };
  const articleUrl = absoluteUrl(articlePath);
  if (!articleUrl) return { profileUrl: null, imageUrl: null };

  try {
    const articleHtml = await fetchHtml(articleUrl, fetchImpl);
    let profile = parseAuthorProfileHtml(articleHtml, authorName);
    if (profile.profileUrl) {
      try {
        const profileHtml = await fetchHtml(profile.profileUrl, fetchImpl);
        const profileData = parseAuthorProfileHtml(profileHtml, authorName);
        profile = { profileUrl: profile.profileUrl, imageUrl: profileData.imageUrl || profile.imageUrl };
      } catch {
        // A confirmed article link is still useful if the profile page is blocked.
      }
    }
    profileCache.set(cacheKey, { expiresAt: Date.now() + AUTHOR_CACHE_TTL_MS, value: profile });
    return profile;
  } catch (error) {
    console.warn(`Author profile lookup failed for ${authorName}: ${error.message}`);
    return { profileUrl: null, imageUrl: null };
  }
}
