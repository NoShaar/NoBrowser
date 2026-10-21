# NoBrowser

NoBrowser é um navegador desktop em construção, feito com Tauri 2, Rust e TypeScript. A versão 0.3.0 adiciona abas, barra de endereço com pesquisa, navegação e abertura de páginas em webviews do sistema. A versão 0.3.1 corrige o redimensionamento das páginas ao restaurar a janela. No Windows, as páginas usam WebView2; outros sistemas usam o motor web nativo disponível.

## Usar

Digite um endereço ou uma busca na barra superior e pressione Enter. Use os controles para voltar, avançar e recarregar; crie abas pelo botão `+` e feche-as pelo `×`. Links que pedem uma nova janela abrem uma aba nova. Por segurança, a navegação aceita apenas HTTP e HTTPS.

As abas usam webviews filhas do Tauri, cuja API ainda está marcada como instável pelo projeto. Esta etapa valida a navegação básica; favoritos, downloads, extensões, histórico persistente e sincronização ainda não fazem parte do NoBrowser.

## Executar no Windows

Instale Rust (toolchain MSVC), Microsoft C++ Build Tools com a carga de trabalho **Desenvolvimento para desktop com C++**, Node.js e o WebView2 Runtime. Depois:

```powershell
npm install
npm run tauri dev
```

O Tauri usa WebView2 no Windows, WebKitGTK no Linux e WKWebView no macOS. O instalador inicial é criado pelo workflow de release do GitHub Actions quando uma tag `v*` é enviada.

## Publicar uma versão

1. Atualize a versão em `src-tauri/tauri.conf.json` e mantenha a mesma versão em `package.json` e `src-tauri/Cargo.toml`.
2. Crie `release-notes/v<VERSÃO>.md` com as notas que serão exibidas no aviso de atualização.
3. Envie o commit e a tag correspondente, por exemplo `v0.3.1`.

O workflow gera o instalador NSIS e os artefatos assinados do atualizador. A chave privada do atualizador fica fora do repositório e deve ser cadastrada como segredo `TAURI_SIGNING_PRIVATE_KEY` em `Settings > Secrets and variables > Actions`. Se a chave tiver senha, cadastre também `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. A chave pública correspondente fica em `src-tauri/tauri.conf.json`.

Não substitua a chave privada depois de publicar uma versão: os clientes instalados confiam na chave pública embutida nessa versão.
