import { stdin, stdout, stderr } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { rotateAdminPassword } from './services/admin-auth.js';

function promptHidden(label) {
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();

    function finish(error) {
      stdin.off('keypress', onKeypress);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    }

    function onKeypress(character, key) {
      if (key.ctrl && key.name === 'c') return finish(new Error('Operação cancelada.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = [...value].slice(0, -1).join('');
        return;
      }
      if (!key.ctrl && !key.meta && character) value += character;
    }

    stdin.on('keypress', onKeypress);
  });
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Execute em um terminal interativo para informar a senha sem eco.');
  const username = process.argv[2];
  if (!username) throw new Error('Informe o usuário: npm run admin:rotate-password -- admin');

  emitKeypressEvents(stdin);
  const password = await promptHidden('Nova senha (mínimo 16 caracteres): ');
  const confirmation = await promptHidden('Confirme a nova senha: ');
  if (password !== confirmation) throw new Error('As senhas não coincidem. Nada foi alterado.');

  rotateAdminPassword(username, password);
  stdout.write('Senha alterada; sessões anteriores revogadas. Faça login novamente.\n');
}

main().catch(error => {
  stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
