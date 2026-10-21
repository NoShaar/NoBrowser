# Plano inicial do navegador pessoal

## Objetivo

Criar o NoBrowser, começando pelo Windows, com identidade visual própria e uma interface que possa evoluir para Linux e macOS.

## Base técnica proposta

Usar Tauri 2 com Rust para a parte nativa e HTML, CSS e TypeScript para desenhar a interface. Isso combina uma base multiplataforma em Rust com liberdade para criar uma barra de título e animações próprias. O Tauri usa WebView2 no Windows, WKWebView no macOS e WebKitGTK no Linux.

Esta base atende ao primeiro objetivo: a janela e sua identidade visual. Antes de implementar a navegação real, vamos decidir se motores de renderização diferentes entre sistemas atendem ao produto ou se precisamos incorporar Chromium/CEF para ter maior consistência. Um navegador completo também exige atualizar o motor de renderização com frequência.

## Direção visual inicial

- Tema escuro, superfícies grafite e detalhe verde-azulado discreto.
- Barra própria, com opções à esquerda, marca NoBrowser centralizada e controles à direita.
- Controles geométricos sem círculos coloridos ou cartões, com estados de foco e hover discretos.
- Janela restaurada com cantos arredondados; maximizada encostada às bordas.
- Transições curtas e discretas, respeitando a preferência do sistema por movimento reduzido.

## Primeira versão

- Primeiro marco concluído: janela do NoBrowser, controles próprios, estados restaurado/maximizado e ícone original.
- Próximo marco: barra de endereço, busca, navegação e abas.
- Depois: temas configuráveis, favoritos, histórico e downloads.

## Atualizações automáticas

- O fluxo planejado começa com uma tela pequena de verificação e depois abre a janela principal.
- A verificação mostra um estado de carregamento sem inventar percentual; o progresso real aparece durante o download.
- Quando houver uma versão nova, a janela principal apresenta as notas da versão e oferece atualizar agora ou depois.
- Antes de ligar o updater ao GitHub, criar o repositório e definir se as releases serão públicas. O Tauri exige artefatos assinados: a chave pública pode ficar na configuração, mas a chave privada e sua senha devem permanecer fora do repositório, guardadas como segredos do GitHub Actions.
- Sem repositório e chave de assinatura definidos, não configurar URL ou chave provisória que torne a checagem de atualização inválida.

Senhas sincronizadas, loja de extensões, contas, sincronização entre dispositivos e recursos avançados de privacidade ficam para depois do protótipo.

## Uso do REA e limites

- O REA pode ajudar a entender o comportamento de programas que possuímos ou temos autorização para analisar; não fornece um motor de navegador nem reduz automaticamente o uso de tokens.
- Para este navegador, começaremos pelas fontes, documentação e licenças do CEF/CefSharp. Engenharia reversa só será usada se surgir uma pergunta concreta sobre um programa autorizado.
- Podemos estudar funções e comportamentos gerais de outros navegadores. Não vamos copiar código, marcas, ícones, textos ou recursos proprietários, contornar licenças, DRM, autenticação ou controles de acesso.
- Cada dependência terá sua licença e avisos preservados. Se o projeto for compartilhado ou distribuído, revisaremos as obrigações antes da publicação.
- Páginas da internet são conteúdo não confiável: o navegador não deve expor acesso ao sistema ou segredos locais para código de sites.
