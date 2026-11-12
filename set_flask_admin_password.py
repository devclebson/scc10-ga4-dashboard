"""Define uma senha fixa para o login administrativo Flask."""

import secrets
from getpass import getpass
from pathlib import Path

from werkzeug.security import generate_password_hash


ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / '.env'


def _set_value(lines, key, value):
    prefix = f'{key}='
    for index, line in enumerate(lines):
        if line.startswith(prefix):
            lines[index] = f'{prefix}{value}'
            return
    lines.append(f'{prefix}{value}')


def main():
    password = getpass('Senha administrativa fixa (mínimo 16 caracteres): ')
    confirmation = getpass('Confirme a senha: ')
    if password != confirmation:
        raise SystemExit('As senhas não coincidem. Nada foi alterado.')
    if len(password) < 16:
        raise SystemExit('A senha deve ter pelo menos 16 caracteres. Nada foi alterado.')

    lines = ENV_PATH.read_text(encoding='utf-8').splitlines() if ENV_PATH.exists() else []
    _set_value(lines, 'FLASK_ADMIN_PASSWORD_HASH', generate_password_hash(password))
    _set_value(lines, 'FLASK_SECRET_KEY', secrets.token_urlsafe(32))
    ENV_PATH.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('Senha Flask gravada no .env. Reinicie o projeto para aplicar.')


if __name__ == '__main__':
    main()