# Testes locais

## Iniciar o servidor

Na raiz do projeto:

```powershell
npx serve . -l 3000
```

## Abrir o Chromium visualmente

Em outro terminal:

```powershell
npx --yes agent-browser --headed open http://localhost:3000
```

## Verificar a tela inicial

```powershell
npx --yes agent-browser snapshot -i
```

## Abrir o modo demonstração

Use a referência apresentada no snapshot para o botão `Explorar com Dados Simulados`:

```powershell
npx --yes agent-browser click @REF
npx --yes agent-browser wait 1000
npx --yes agent-browser snapshot -i
```

## Verificar erros

```powershell
npx --yes agent-browser console
npx --yes agent-browser errors
```

## Verificar sintaxe JavaScript

```powershell
node --check src/js/app.js
```

## Encerrar o navegador

```powershell
npx --yes agent-browser close --all
```
