# Instalar o SCC10 em container Ubuntu no Proxmox

Procedimento para um container **LXC Ubuntu Server 24.04** de teste. O runtime Flask usa Gunicorn na porta local `5000`; o Nginx termina HTTPS e encaminha toda a aplicação para o Flask. O Node permanece como rollback até a validação final.

## Migração de serviço Node para Flask

Os arquivos de preparação são:

- `deploy/scc10-flask.service` — Gunicorn para dashboard/API Flask;
- `deploy/scc10-flask-collector.service` — um ciclo realtime por execução;
- `deploy/scc10-flask-collector.timer` — agenda um ciclo por minuto;
- `deploy/scc10-flask.nginx.conf.example` — proxy HTTPS para `127.0.0.1:5000`;
- `deploy/scc10-flask.env.example` — ambiente Flask sem credenciais no repositório.

No container, após copiar o código e instalar dependências:

```bash
sudo python3 -m venv /opt/scc10/venv
sudo /opt/scc10/venv/bin/pip install --requirement /opt/scc10/app/requirements.txt
sudo install -o root -g scc10 -m 0640 deploy/scc10-flask.env.example /etc/scc10/scc10-flask.env
sudoedit /etc/scc10/scc10-flask.env
sudo install -o root -g root -m 0644 deploy/scc10-flask.service /etc/systemd/system/
sudo install -o root -g root -m 0644 deploy/scc10-flask-collector.service /etc/systemd/system/
sudo install -o root -g root -m 0644 deploy/scc10-flask-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now scc10-flask
sudo systemctl enable --now scc10-flask-collector.timer
sudo systemctl status scc10-flask --no-pager
sudo systemctl status scc10-flask-collector.timer --no-pager
curl -fsS http://127.0.0.1:5000/api/health
```

Antes de trocar o Nginx, validar o Flask localmente, fazer backup de `/var/lib/scc10/scc10.sqlite` e confirmar que o timer registrou um `collector_runs` com `success`. Só depois instalar `deploy/scc10-flask.nginx.conf.example`, executar `sudo nginx -t` e recarregar o Nginx. Não apagar o serviço Node até a validação HTTPS, login, dashboard, diagnóstico e rollback.


> A branch desta entrega é `feat/deploy-ubuntu-proxmox`. Até que seu PR seja integrado a `develop`, instale essa branch para testar. O cache de relatórios da PR #3 está em outra branch; este checkout não o inclui até a integração dos PRs em `develop`. `master` continua sendo produção e não deve ser usada para este teste.

## 1. Criar o container

No painel Proxmox, baixe um template Ubuntu 24.04, crie um CT **não privilegiado** com rede alcançável pelo navegador (DNS interno ou IP fixo), espaço para código/logs/banco e acesso de saída HTTPS para o Google. Como ponto de partida para testes: 2 vCPU, 2 GiB RAM, 12 GiB disco; ajuste conforme métricas do host. Não exponha o CT à internet para testes. Libere TCP 443 entre estações autorizadas e CT (TCP 80 apenas se usar redirecionamento/ACME). Não publique a porta 3001. Mantenha o relógio sincronizado: a autenticação JWT depende do horário. **O login administrativo protege a configuração, não os relatórios:** `/api/ga4/report` aceita consultas sem sessão. Restrinja a rede a clientes autorizados (firewall/VPN) e não trate este guia como uma publicação segura na internet.

Use um usuário Ubuntu com `sudo`; execute os comandos seguintes nesse CT.

## 2. Instalar dependências

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx rsync openssl sqlite3 python3-venv
# Repositório NodeSource para Node.js 24 (verifique o script antes de executá-lo):
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource-setup.sh
less /tmp/nodesource-setup.sh
sudo bash /tmp/nodesource-setup.sh
sudo apt install -y nodejs
node --version   # precisa mostrar v24.x; node:sqlite exige versão recente
npm --version
```

Referências oficiais: [Proxmox LXC](https://pve.proxmox.com/pve-docs/chapter-pct.html), [Node.js](https://nodejs.org/en/download), [NodeSource distributions](https://github.com/nodesource/distributions), [Nginx no Ubuntu](https://ubuntu.com/server/docs/how-to/web-services/install-nginx).

## 3. Usuário e diretórios

```bash
sudo useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin scc10
sudo install -d -o root -g root -m 0755 /opt/scc10 /var/www/scc10
sudo install -d -o scc10 -g scc10 -m 0700 /var/lib/scc10
sudo install -d -o root -g scc10 -m 0750 /etc/scc10 /etc/scc10/credentials
sudo install -d -o root -g root -m 0700 /etc/scc10/tls
sudo git clone --branch feat/deploy-ubuntu-proxmox https://github.com/devclebson/scc10-ga4-dashboard.git /opt/scc10/app
cd /opt/scc10/app
sudo npm ci --ignore-scripts
sudo npm run build:static
sudo rsync -a --delete dist/ /var/www/scc10/
```

O `dist/` contém somente páginas HTML, JS/CSS, imagens e três bibliotecas de visualização em lista explícita (`scripts/build-static.mjs`); arquivos ocultos/novos e links simbólicos não são publicados. Ao adicionar uma página ou recurso público, atualize essa lista e os testes antes do deploy. O código do servidor, `.git`, arquivos de ambiente e `data/` não são publicados pelo Nginx. Não aponte o `root` do Nginx para `/opt/scc10/app`.

## 4. Credencial do Google e configuração

Use uma **chave JSON de Service Account**, não um OAuth Web Client. Cadastre o e-mail da Service Account com permissão de leitura na propriedade GA4. Se já tem uma chave em local privado na estação, transfira-a por SSH para uma conta administrativa no CT e mova-a imediatamente para `/etc/scc10/credentials/ga4.json`:

```bash
# Na estação, em um terminal próprio (substitua os marcadores, sem colar o JSON):
scp '<ARQUIVO_JSON_LOCAL>' '<USUARIO>@<IP_DO_CT>:~/ga4-upload.json'
# No CT:
sudo install -o root -g scc10 -m 0640 ~/ga4-upload.json /etc/scc10/credentials/ga4.json
rm -f ~/ga4-upload.json
sudo -u scc10 test -r /etc/scc10/credentials/ga4.json
```

Se a chave transitou por um local compartilhado ou foi exposta, revogue-a e crie outra. Nunca grave JSON, senha ou token no Git, no frontend, na página de configuração, em logs ou no chat. O usuário de serviço `scc10` só tem leitura do arquivo protegido; o banco fica em `/var/lib/scc10/scc10.sqlite` (inclui sessões administrativas), fora da pasta pública.

```bash
sudo install -o root -g scc10 -m 0640 deploy/scc10.env.example /etc/scc10/scc10.env
sudoedit /etc/scc10/scc10.env
```

Substitua `SCC10_PROPERTY_ID` pela propriedade real e `SCC10_PUBLIC_ORIGIN` pela URL **exata** acessada no navegador, por exemplo `https://scc10.exemplo.interno` (sem barra final, caminho ou porta se for 443). `GOOGLE_SERVICE_ACCOUNT_FILE` deve apontar para `/etc/scc10/credentials/ga4.json`; `SCC10_DB_PATH` para `/var/lib/scc10/scc10.sqlite`; mantenha `HOST=127.0.0.1` e `NODE_ENV=production`. A aplicação lê esse arquivo através do systemd; não basta criar um `.env` na raiz. Não defina `SCC10_ADMIN_PASSWORD` nem `SCC10_ADMIN_TOKEN` no serviço.

Crie o primeiro administrador uma única vez, com senha digitada sem eco e nunca armazenada no ambiente:

```bash
cd /opt/scc10/app
sudo -u scc10 env SCC10_DB_PATH=/var/lib/scc10/scc10.sqlite /usr/bin/node server/bootstrap-admin.js admin
```

A senha deve ter ao menos 16 caracteres. Se já existe usuário no banco, o comando recusa; para alterá-la use, no mesmo terminal, `sudo -u scc10 env SCC10_DB_PATH=/var/lib/scc10/scc10.sqlite /usr/bin/node server/rotate-admin-password.js admin`. Guarde cópia segura da chave separada do backup do banco. Não substitua o banco ao atualizar o código.

## 5. Serviço e HTTPS

```bash
sudo install -o root -g root -m 0644 deploy/scc10-api.service /etc/systemd/system/scc10-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now scc10-api
sudo systemctl status scc10-api --no-pager
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/config
```

O health deve ter `authMode: service-account`, e config `configured: true` com a propriedade correta. Isto **não comprova** acesso GA4 nem frescor do coletor. Se houver erro: `sudo journalctl -u scc10-api -n 60 --no-pager` (não cole logs com dados sensíveis publicamente).

Para HTTPS, prefira certificado emitido por uma CA interna confiável nas estações ou por ACME em um DNS válido. Coloque certificado e chave em `/etc/scc10/tls/fullchain.pem` e `/etc/scc10/tls/privkey.pem` (chave `root:root`, modo `0600`). Para um laboratório isolado com DNS interno, você pode gerar um certificado autoassinado temporário e **conferir o fingerprint e confiar nele na estação antes de digitar senha**:

```bash
sudo openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 30 \
  -keyout /etc/scc10/tls/privkey.pem -out /etc/scc10/tls/fullchain.pem \
  -subj '/CN=scc10.exemplo.interno' -addext 'subjectAltName=DNS:scc10.exemplo.interno'
sudo chmod 0600 /etc/scc10/tls/privkey.pem
sudo openssl x509 -in /etc/scc10/tls/fullchain.pem -noout -fingerprint -sha256
```

Se for acessar por **IP**, use o IP no `server_name`, em `SCC10_PUBLIC_ORIGIN` e no SAN do certificado (`subjectAltName=IP:<IP_DO_CT>`). Não desative a verificação TLS nem use HTTP para login: `NODE_ENV=production` marca o cookie de sessão como `Secure`.

O certificado autoassinado de laboratório vence em 30 dias: antes de substituí-lo guarde cópia protegida do certificado, da chave e da configuração Nginx; gere outro antes do vencimento, confira o novo fingerprint, distribua a confiança às estações e rode `sudo nginx -t && sudo systemctl reload nginx`. Para uso permanente, use uma CA interna com rotina de renovação. Se optar por ACME, o DNS precisa apontar para o CT e o método HTTP-01 exige que a porta 80 seja acessível pelo emissor; configure o Nginx com os caminhos de certificado entregues pelo cliente ACME e teste a renovação antes de depender dela.

```bash
sudo install -o root -g root -m 0644 deploy/scc10.nginx.conf.example /etc/nginx/sites-available/scc10
sudoedit /etc/nginx/sites-available/scc10  # ajuste server_name e caminhos do TLS
sudo ln -s /etc/nginx/sites-available/scc10 /etc/nginx/sites-enabled/scc10
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Abra `https://scc10.exemplo.interno/` e verifique login, dashboard, hora da última coleta e uma matéria. A primeira entrada faz um preflight GA4 e pode demorar; não reinicie repetidamente ao enfrentar limite de quota. Confirme uma única consulta real read-only sem token de navegador quando houver quota:

```bash
curl -fsS -X POST http://127.0.0.1:3001/api/ga4/report \
  -H 'Content-Type: application/json' \
  -d '{"propertyId":"309943616","reportType":"standard","payload":{"dateRanges":[{"startDate":"today","endDate":"today"}],"metrics":[{"name":"activeUsers"}],"limit":1}}'
```

Substitua o ID do exemplo; `403` indica falta de acesso à propriedade. O navegador acessa `/api/` pelo mesmo host HTTPS e a API só escuta no loopback do CT.

## 6. Atualizações, backup e diagnóstico

Antes de qualquer atualização, faça um backup consistente do SQLite com o serviço **em funcionamento**: `sqlite3 .backup` inclui o estado do banco mesmo quando WAL está ativo; não copie apenas o arquivo `.sqlite` em execução. O backup contém hashes de senha, sessões e configurações — mantenha fora do Git, transfira uma cópia protegida para fora do CT e ensaie a restauração num CT de teste.

```bash
BACKUP="/var/lib/scc10/scc10-backup-$(date +%F-%H%M).sqlite"
sudo -u scc10 sqlite3 /var/lib/scc10/scc10.sqlite ".backup '$BACKUP'"
sudo install -o root -g root -m 0600 "$BACKUP" /root/
sudo rm -f "$BACKUP"
sudo git -C /opt/scc10/app rev-parse HEAD  # anote este SHA para rollback
```

Só prossiga se o backup tiver sido criado e copiado. Faça backup separado do JSON em armazenamento restrito. Depois que o PR desta branch for integrado, atualize via `develop` (não use `master` sem homologação):

```bash
cd /opt/scc10/app
sudo git fetch origin
sudo git switch develop
sudo git pull --ff-only origin develop
sudo npm ci --ignore-scripts
sudo npm test && sudo npm run test:syntax && sudo npm run build:static
sudo rsync -a --delete dist/ /var/www/scc10/
sudo systemctl restart scc10-api
sudo nginx -t && sudo systemctl reload nginx
```

Se a nova versão falhar, restaure o código pelo SHA anotado e mantenha o mesmo banco; restaure o banco de backup somente se uma migração de esquema ou alteração de dados tornar necessário, sempre com o serviço parado e cópia do estado atual. Exemplo de rollback do código:

```bash
cd /opt/scc10/app
sudo git switch --detach <SHA_ANTERIOR>
sudo npm ci --ignore-scripts
sudo npm run build:static
sudo rsync -a --delete dist/ /var/www/scc10/
sudo systemctl restart scc10-api
```

Nunca coloque o banco, o backup ou o JSON no repositório. Para diagnóstico: `sudo journalctl -u scc10-api -f`, `curl -fsS http://127.0.0.1:3001/api/health`, `sudo nginx -t`, `sudo systemctl status nginx scc10-api`. Se o collector estiver pausado por quota, health online não significa dados recentes; confira o horário da coleta no painel.
