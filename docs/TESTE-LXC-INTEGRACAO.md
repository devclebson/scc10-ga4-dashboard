# Testar alterações do PC no container LXC

Branch temporária: `test/lxc-ultimas-alteracoes`. Ela integra a branch de deploy, o cache histórico do PR #3 e uma cópia do ranking ainda em desenvolvimento; não substitui `develop` nem `master`. As branches originais não devem ser apagadas. O diretório local de trabalho é `GA4-Analytics-LXC-Test`; o diretório original do ranking permanece com as alterações preparadas.

Este CT usa Ubuntu 22.04 e HTTP por IP **somente no laboratório interno**, por decisão do operador. O guia geral de deploy descreve o alvo futuro com HTTPS e não representa o Nginx atualmente configurado no CT. A restrição de clientes na API não foi comprovada: qualquer estação que alcance o CT pode chamar `/api/ga4/report` sem login, consumir quota e ler respostas sem criptografia. Restrinja o acesso no firewall da rede/Proxmox e não exponha o CT à internet; não use login administrativo por HTTP. Este teste não equivale a homologação de segurança para produção.

## Fluxo para cada melhoria

1. Editar no PC na branch de teste (ou integrar nela uma melhoria verificada de outra branch), executar `npm test`, `npm run test:syntax` e `npm run build:static`.
2. Fazer commit e push da branch de teste; conferir o SHA remoto antes de atualizar o CT.
3. No CT, registrar o SHA anterior e fazer backup consistente do SQLite antes do checkout. Não copiar nem modificar credenciais; o serviço systemd já possui sua configuração privada.
4. Fazer checkout do commit remoto de teste, instalar as dependências do lockfile, testar e gerar `dist/` **antes** de trocar os arquivos públicos ou reiniciar a API. Se falhar, parar: a versão em execução não precisa ser alterada.
5. Publicar `dist/`, reiniciar somente `scc10-api` e validar health/config, coleta recente e páginas visíveis. Nunca iniciar um segundo backend/coletor na estação.

Comandos no CT (executar apenas após confirmar que o push da branch de teste terminou):

```bash
cd /opt/scc10/app
# Primeiro confira se não há alterações locais; se houver, não troque o checkout.
git status --short
git rev-parse HEAD  # anote para rollback
# Backup SQLite consistente, com o serviço em funcionamento. Guarde cópia protegida fora do CT.
BACKUP="/var/lib/scc10/scc10-backup-$(date +%F-%H%M).sqlite"
runuser -u scc10 -- sqlite3 /var/lib/scc10/scc10.sqlite ".backup '$BACKUP'"
test -s "$BACKUP" || exit 1
install -o root -g root -m 0600 "$BACKUP" /root/
rm -f "$BACKUP"

git fetch origin test/lxc-ultimas-alteracoes
git switch --detach origin/test/lxc-ultimas-alteracoes
npm ci --ignore-scripts
npm test && npm run test:syntax && npm run build:static
# Prosseguir só após os testes passarem:
rsync -a --delete dist/ /var/www/scc10/
systemctl restart scc10-api
curl --retry 3 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/config
# Teste negativo obrigatório: corpo vazio, nunca envie senha em HTTP.
curl -s -o /dev/null -w 'Login HTTP bloqueado: %{http_code}\n' \
  -X POST http://192.168.0.71/api/auth/login \
  -H 'Content-Type: application/json' -d '{}'
```

O teste negativo deve retornar `403` antes de abrir a página. Se for diferente, interrompa a homologação e não digite a senha. No navegador, testar o dashboard e `http://192.168.0.71/ranking.html`. O ranking lê snapshots existentes; não deve gerar consulta GA4 por conta própria. Conferir o horário da coleta, ordenação, percentual e links. O ranking “Agora” mostra visualizações dos últimos 30 minutos **entre as até 60 páginas escolhidas originalmente por leitores**; não é um ranking exaustivo de todas as páginas. O percentual usa o total de visualizações do portal na janela, e a interface sinaliza o recorte. A abertura do dashboard ainda faz consultas históricas (o cache reduz repetições, mas não substitui a primeira leitura); evite F5 repetidos.

Rollback de código: `git switch --detach <SHA_ANTERIOR>`, `npm ci --ignore-scripts`, `npm run build:static`, `rsync -a --delete dist/ /var/www/scc10/`, `systemctl restart scc10-api`. Não substitua o SQLite por padrão; restaure o backup apenas se necessário, com o serviço parado e preservando o estado atual. O login administrativo continua indisponível em HTTP sem TLS confiável. A API é acessível na rede interna: não expor o CT à internet.
