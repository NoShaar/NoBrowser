# NoBrowser

Janela desktop inicial do NoBrowser, feita com Tauri 2, Rust e TypeScript. A versão atual inclui o menu Sobre, a verificação manual e automática de atualizações e a instalação de versões assinadas pelo GitHub Releases. A navegação por sites será adicionada em uma etapa futura.

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
3. Envie o commit e a tag correspondente, por exemplo `v0.2.0`.

O workflow gera o instalador NSIS e os artefatos assinados do atualizador. A chave privada do atualizador fica fora do repositório e deve ser cadastrada como segredo `TAURI_SIGNING_PRIVATE_KEY` em `Settings > Secrets and variables > Actions`. Se a chave tiver senha, cadastre também `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. A chave pública correspondente fica em `src-tauri/tauri.conf.json`.

Não substitua a chave privada depois de publicar uma versão: os clientes instalados confiam na chave pública embutida nessa versão.
