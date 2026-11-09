from flask_app.services.author_profile import AuthorPageParser


def test_author_html_parser_extracts_profile_and_image():
    parser = AuthorPageParser('Olga Helena de Paula')
    parser.feed('''
      <a href="/author/olgahelena/">Olga Helena de Paula</a>
      <img class="author-avatar" alt="Olga Helena de Paula" src="/uploads/olga.webp">
    ''')
    assert parser.profile_url == 'https://scc10.com.br/author/olgahelena/'
    assert parser.image_url() == 'https://scc10.com.br/uploads/olga.webp'
