const SITEMAP_CACHE_TTL_MS = 15 * 60 * 1000;
const STOP_WORDS = new Set([
  'a', 'as', 'ao', 'aos', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'entre', 'mas', 'na', 'nas', 'no', 'nos', 'o', 'os', 'para', 'por', 'que',
  'se', 'sem', 'um', 'uma', 'veja'
]);

let sitemapCache = { expiresAt: 0, urls: [] };

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokens(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token));
}

export function parseSitemapEntries(xml) {
  const entries = [];
  const pattern = /<url>\s*<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = pattern.exec(String(xml || '')))) entries.push(match[1].trim());
  return entries;
}

export function parseSitemapIndexEntries(xml) {
  const entries = [];
  const pattern = /<sitemap>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/sitemap>/g;
  let match;
  while ((match = pattern.exec(String(xml || '')))) {
    entries.push({ loc: match[1].trim(), lastmod: match[2].trim() });
  }
  return entries;
}

function scoreUrl(title, url) {
  const titleTokens = [...new Set(tokens(title))];
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
  const urlTokens = [...new Set(tokens(slug))];
  if (titleTokens.length < 4 || urlTokens.length < 4) return 0;
  const urlTokenSet = new Set(urlTokens);
  const matched = titleTokens.filter(token => urlTokenSet.has(token)).length;
  const coverage = matched / titleTokens.length;
  const precision = matched / urlTokens.length;
  return coverage * 0.75 + precision * 0.25;
}

export function resolveSitemapPaths(titles, urls, minimumScore = 0.72) {
  return Object.fromEntries(
    titles.map(title => {
      const candidates = urls
        .map(url => ({ url, score: scoreUrl(title, url) }))
        .filter(candidate => candidate.score >= minimumScore)
        .sort((a, b) => b.score - a.score);
      return [title, candidates[0]?.url ? new URL(candidates[0].url).pathname : null];
    })
  );
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Sitemap retornou HTTP ${response.status}.`);
  return response.text();
}

async function getRecentSitemapUrls(fetchImpl) {
  if (Date.now() < sitemapCache.expiresAt) return sitemapCache.urls;

  const indexXml = await fetchText('https://scc10.com.br/sitemap_index.xml', fetchImpl);
  const sitemapEntries = parseSitemapIndexEntries(indexXml)
    .filter(entry => /post-sitemap\d*\.xml$/i.test(entry.loc))
    .sort((a, b) => Date.parse(b.lastmod) - Date.parse(a.lastmod))
    .slice(0, 3);
  const xmls = await Promise.all(sitemapEntries.map(entry => fetchText(entry.loc, fetchImpl)));
  sitemapCache = {
    expiresAt: Date.now() + SITEMAP_CACHE_TTL_MS,
    urls: xmls.flatMap(parseSitemapEntries)
  };
  return sitemapCache.urls;
}

export async function resolveArticlePathsFromSitemap(titles, fetchImpl = fetch) {
  const uniqueTitles = [...new Set(titles.map(title => String(title || '').trim()).filter(Boolean))];
  if (!uniqueTitles.length) return {};
  const urls = await getRecentSitemapUrls(fetchImpl);
  return resolveSitemapPaths(uniqueTitles, urls);
}
