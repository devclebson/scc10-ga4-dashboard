# Análise da navegação para equipes de conteúdo

## Objetivo

Organizar as telas pela jornada de análise editorial, mantendo as telas técnicas ocultas para usuários não autenticados. Nenhuma tela foi removida nesta etapa.

## Ordem adotada

1. Visão Geral — ponto de entrada executivo; mostra audiência atual, ritmo dos snapshots, canais e conteúdos em destaque.
2. Conteúdo — análise histórica das matérias, com período, categoria, autor, busca e acesso à análise individual.
3. Autores — central editorial para produção, alcance, principais matérias e comparação entre autores.
4. Ranking ao vivo — lista detalhada das matérias mais lidas no snapshot realtime.
5. Monitor realtime — acompanhamento operacional/editorial contínuo, canais do dia e leitores por minuto.
6. Aquisição — origem da audiência e evolução diária por canal, consultada sob demanda no GA4.
7. Redes sociais — cards e detalhamento de Facebook, Instagram, WhatsApp, YouTube e outras redes identificadas pelo `sessionSourceMedium`.
8. Público — localização, dispositivos, sistemas operacionais e navegadores da audiência.

## Telas que não entram no menu editorial

- Análise individual de matéria: permanece acessível a partir de Conteúdo e não precisa ocupar espaço no menu principal.
- Operação: tela administrativa, protegida por login.
- Administração: configurações e diagnósticos administrativos, protegidos por login.

## Sobre possíveis duplicidades

### Dashboard e Ranking

Não são idênticos:

- Monitor realtime combina KPIs, canais, série por minuto e histórico opcional.
- Ranking ao vivo é uma tabela focada nas matérias, com limite configurável.

Por isso, ambos foram mantidos e apenas renomeados para deixar a diferença explícita.

### Visão Geral e Monitor realtime

Também possuem alguma sobreposição de KPIs, mas têm papéis diferentes:

- Visão Geral é o resumo executivo e histórico de snapshots.
- Monitor realtime é a tela de acompanhamento contínuo.

A recomendação é manter os dois até observar o uso real da equipe.

## Regras para próximas remoções

Nenhuma tela deve ser removida automaticamente. Antes de remover, deve ser apresentada uma comparação de uso, dados exibidos e alternativa de destino para aprovação do responsável pelo projeto.
