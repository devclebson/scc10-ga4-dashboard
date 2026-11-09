from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

SITE_ORIGIN = 'https://scc10.com.br'


class AuthorPageParser(HTMLParser):
    def __init__(self, author_name):
        super().__init__()
        self.author_name = author_name.lower()
        self.profile_url = None
        self.images = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        href = attributes.get('href', '')
        if tag == 'a' and '/author/' in href and not self.profile_url:
            self.profile_url = urljoin(SITE_ORIGIN, href)
        if tag == 'img' and attributes.get('src'):
            text = ' '.join([
                attributes.get('alt', ''),
                attributes.get('class', ''),
                attributes.get('id', ''),
                attributes.get('src', ''),
            ]).lower()
            self.images.append((text, urljoin(SITE_ORIGIN, attributes['src'])))

    def image_url(self):
        tokens = [token for token in self.author_name.split() if len(token) > 3]
        candidates = [image for text, image in self.images if any(token in text for token in tokens) or any(marker in text for marker in ('author', 'autor', 'avatar', 'perfil', 'profile'))]
        return candidates[0] if candidates else None


def fetch_html(url, timeout=8):
    request = Request(url, headers={'User-Agent': 'SCC10-Analytics-Flask/1.0'})
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode('utf-8', errors='replace')


def resolve_author_profile(author_name, article_path):
    if not article_path:
        return {'profileUrl': None, 'imageUrl': None, 'status': 'missing-article-path'}
    article_url = urljoin(SITE_ORIGIN, article_path)
    try:
        article_parser = AuthorPageParser(author_name)
        article_parser.feed(fetch_html(article_url))
        profile_url = article_parser.profile_url
        if not profile_url:
            return {'profileUrl': None, 'imageUrl': article_parser.image_url(), 'status': 'profile-link-not-found'}
        profile_parser = AuthorPageParser(author_name)
        profile_parser.feed(fetch_html(profile_url))
        return {'profileUrl': profile_url, 'imageUrl': profile_parser.image_url() or article_parser.image_url(), 'status': 'ok'}
    except Exception as error:
        return {'profileUrl': None, 'imageUrl': None, 'status': f'fetch-failed:{type(error).__name__}'}
