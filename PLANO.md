# Plano inicial do navegador pessoal

## Objetivo

Criar o NoBrowser, começando pelo Windows, com identidade visual própria e uma interface que possa evoluir para Linux e macOS.

## Base técnica proposta

Usar Tauri 2 com Rust para a parte nativa e HTML, CSS e TypeScript para desenhar a interface. Isso combina uma base multiplataforma em Rust com liberdade para criar uma barra de título e animações próprias. O Tauri usa WebView2 no Windows, WKWebView no macOS e WebKitGTK no Linux.

Esta primeira etapa de navegação usa webviews nativas do Tauri para abrir páginas em abas. No Windows, o motor é o WebView2; Linux e macOS usam seus motores nativos. Isso permite validar a interface e os fluxos sem incorporar um Chromium próprio. A criação de webviews filhas do Tauri ainda depende de uma API marcada como instável e pode exigir ajustes quando o Tauri evoluir.

## Direção visual inicial

- Tema escuro, superfícies grafite e detalhe verde-azulado discreto.
- Barra própria, com a marca centralizada e controles à direita; o menu Opções divide espaço com as abas em uma faixa independente.
- Controles geométricos sem círculos coloridos ou cartões, com estados de foco e hover discretos.
- Janela restaurada com cantos arredondados; maximizada encostada às bordas.
- Transições curtas e discretas, respeitando a preferência do sistema por movimento reduzido.

## Primeira versão

- Primeiro marco concluído: janela do NoBrowser, controles próprios, estados restaurado/maximizado e ícone original.
- Segundo marco: abas, barra de endereço, pesquisa e navegação básica.
- Depois: temas configuráveis, favoritos, histórico persistente e downloads.

## Atualizações automáticas

- O fluxo começa com uma tela pequena de verificação e depois abre a janela principal.
- A verificação mostra um estado de carregamento sem inventar percentual; o progresso real aparece durante o download.
- Quando houver uma versão nova, a janela principal apresenta as notas da versão e oferece atualizar agora ou depois.
- O updater consulta releases públicas no GitHub e instala artefatos assinados. A chave privada e sua senha permanecem fora do repositório, guardadas como segredos do GitHub Actions.
- A versão publicada precisa trazer notas de versão e ser assinada pela mesma chave privada correspondente à chave pública incluída no aplicativo.
- A versão 0.3.1 reaplica os limites das páginas ao restaurar a janela e ignora redimensionamentos emitidos enquanto ela está minimizada.
- A versão 0.4.0 adiciona histórico local, sugestões baseadas nos sites mantidos no histórico, restauração opcional de sessão, busca pelo Google, atalhos e páginas internas de histórico/configurações.

Senhas sincronizadas, loja de extensões, contas, sincronização entre dispositivos e recursos avançados de privacidade ficam para depois do protótipo.

## Uso do REA e limites

- O REA pode ajudar a entender o comportamento de programas que possuímos ou temos autorização para analisar; não fornece um motor de navegador nem reduz automaticamente o uso de tokens.
- Para este navegador, começaremos pelas fontes, documentação e licenças do CEF/CefSharp. Engenharia reversa só será usada se surgir uma pergunta concreta sobre um programa autorizado.
- Podemos estudar funções e comportamentos gerais de outros navegadores. Não vamos copiar código, marcas, ícones, textos ou recursos proprietários, contornar licenças, DRM, autenticação ou controles de acesso.
- Cada dependência terá sua licença e avisos preservados. Se o projeto for compartilhado ou distribuído, revisaremos as obrigações antes da publicação.
- Páginas da internet são conteúdo não confiável: o navegador não deve expor acesso ao sistema ou segredos locais para código de sites.
