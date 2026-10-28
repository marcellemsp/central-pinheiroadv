# Central PinheiroAdv — guia para quem mexe no código

Sistema interno do **Pinheiro Advogados**, escritório de direito tributário de Marcelle Pinheiro (dona do sistema e única usuária por enquanto). O assistente do sistema se chama **Neo**.

A v1 reproduz a arquitetura e todas as funcionalidades da Central Medinadv, que a Marcelle desenvolveu, com a identidade Pinheiro e sem nenhum dado da Medina. O esquema do banco foi reconstruído a partir do código (`sql/004` a `006`). A v0, feita do zero, está guardada na branch `v0-propria`, e as tabelas dela ficaram no esquema `legado`.

## Pilha

Next.js 14 (App Router), TypeScript, Tailwind, Supabase (banco, login, Storage e Realtime), lucide-react nos ícones. Deploy no Vercel a cada envio para `main`.

## Modelo

- **empresas** são os clientes (com grupo econômico em `grupos` e carteira em `banca`). **casos** pertencem a uma empresa e a uma área: `contencioso`, `consultoria`, `incentivo`, `transacao`, `fiscalizacao` (campos de cada área em `lib/areas.ts`; o que não é coluna vai em `casos.dados`).
- **caso_pendencias** é a tabela central de trabalho. `status`: `a_fazer`, `em_elaboracao`, `revisao_pendente`, `devolvida`, `pronta_protocolar`, `aguardando_cliente`, `aguardando` (espera a anterior, `depende_de`), `bloqueada`, `concluida`. Tipos em `TIPOS_PEND` (`components/CasoView.tsx`): peça, memorial, diligência, julgamento, despacho, rolante, rotina etc.
- Revisão de peças: o responsável envia ao revisor (`revisor`), que devolve, aprova ou sobe na cadeia de `COORDENADORES` (`lib/equipe.ts`). Toda ação grava em `pendencia_eventos`.
- Rotinas (pendências recorrentes): regra em `caso_pendencias.recorrencia`; o gatilho `privado.tg_pendencia_depois` cria a próxima ao concluir. Pendências encadeadas são liberadas pelo mesmo gatilho. Rolantes passam para o próximo dia útil com `pa_rolar_pendencias()`.
- Prazos: `pa_prazo()` no banco, com os dias não úteis de `dias_nao_uteis` (esferas: nacional, rj, rio, forense, tjrj, trf2, stj, stf, sefaz, pgfn). `pa_semear_feriados(ano)` grava os feriados fixos e móveis e a suspensão de 20/12 a 20/01. Atos de tribunal entram como `pendente` e só valem depois de confirmados.
- Publicações (tabela `alertes`): importadas por arquivo, recebem destinação e, na aprovação (`pa_alerte_aprovar`), viram andamento e, se for o caso, pendência.
- Também: acompanhamento de processos, certidões por cliente, acervo de documentos do processo, gastos de diligência com reembolso em lote, e exclusão com aprovação (`pa_solicitar_exclusao`).

Equipe e carteiras ficam em `lib/equipe.ts`. Hoje só a Marcelle, como coordenadora (`usuarios.papel = 'coordenador'`). Não espalhe nomes de pessoas pelo código.

## Identidade

As cores vêm do design system Pinheiro Advogados, como variáveis em `app/globals.css`, com tema claro e escuro automáticos e escolha manual (`data-tema` no `<html>`). As telas usam as variáveis semânticas (`--bg-page`, `--bg-surface`, `--text-primary`, `--border`, `--acao`, `--alerta`, `--ok`, `--atencao`, `--tag-*`) em `style={{}}`, ou as classes do `tailwind.config.ts` (`bg-petroleo`, `text-bordo`, `border-line`…). Nunca escreva hex nos componentes; a única exceção é `app/global-error.tsx`, que roda sem o CSS.

Regras de marca: o bordô entra em pequenas doses (faixa no topo, rótulos de grupo, contadores, prazos vencidos); tudo é reto (o Tailwind já limita `rounded-*` a 4px e 6px); nada de sombras (o Tailwind já zera `shadow-*`), emoji, degradês ou cartões com borda lateral colorida. Títulos de página em serifa (`main h1`). O símbolo Raiz fica em `components/RaizMark.tsx` e nunca é redesenhado à mão.

## Acesso

Duas travas independentes. Na aplicação, `middleware.ts` exige sessão e, se `ALLOWED_EMAIL` estiver definido, só deixa entrar esse e-mail. No banco, as políticas de RLS só liberam dados para e-mails em `usuarios_autorizados`, checados por `privado.usuario_autorizado()`; apagar exige `privado.eh_coordenador()`. Linhas com pedido de exclusão em aberto (`exclusao_id`) somem das telas até a decisão.

Sem abrir a Central por `INATIVIDADE_DIAS` dias (padrão 7), o middleware encerra a sessão; o último acesso fica no cookie `pa_ultimo_acesso`. Login por e-mail e senha; `/definir-senha` troca nome e senha de quem está logado e recebe os links de convite. O link mágico fica como alternativa.

## Neo (servidor MCP)

`app/api/mcp/route.ts` é o servidor MCP do Neo, fora do middleware. Ele exige a chave `NEO_CHAVE` (no Vercel, como variável sensível) na URL (`?k=`) ou no cabeçalho `Authorization: Bearer`, e passa a mesma chave às funções `public.neo_*` do banco, que conferem o hash SHA-256 em `privado.neo_chaves` e trabalham sobre `caso_pendencias`. Para trocar a chave, gere uma nova, grave o hash em `privado.neo_chaves`, apague o antigo e atualize a variável no Vercel e a URL do conector no Claude. A conversa dentro da Central (`app/api/neo`) usa as mesmas funções e precisa de `ANTHROPIC_API_KEY`.

Projeto Supabase: `central-pinheiroadv` (ref `goapbhplemhylhsbdred`, região São Paulo), na organização Pinheiro Advogados.

## Integrações desligadas

As rotas de ingestão da Medina (Outlook, OneDrive, e-mails, varredura do eproc, cópias integrais) não foram trazidas. A tabela `eventos_agenda` está pronta para a Google Agenda, e `caso_documentos` para o índice de cópias integrais, quando houver rotina que as alimente.

## Banco

O esquema está em `sql/`, em arquivos numerados. Mudança de banco é sempre um arquivo novo (`007_…sql`), nunca edição de um já rodado. Teste antes num Postgres local (há um roteiro de teste no histórico do projeto): as funções `pa_*` e os gatilhos têm regra de negócio.
