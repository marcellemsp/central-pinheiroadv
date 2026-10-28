# Central PinheiroAdv — guia para quem mexe no código

Sistema interno do **Pinheiro Advogados**, escritório de direito tributário de Marcelle Pinheiro (dona do sistema e única usuária por enquanto). O assistente do sistema se chama **Neo**.

Código escrito do zero. A Central Medinadv serviu de referência de arquitetura e de fluxo, mas nenhum arquivo dela é copiado para cá.

## Pilha

Next.js 14 (App Router), TypeScript, Tailwind, Supabase (banco e login por link mágico), dnd-kit no quadro. Deploy no Vercel.

## Modelo

Sem bancas e sem revisores. Toda pendência tem `responsavel = 'marcelle'`; o campo existe para quando houver equipe.

A pendência anda por cinco buckets, definidos em `lib/buckets.ts` e no `check` da tabela:

| bucket | significado |
|---|---|
| `triagem` | chegou e ainda não foi analisada |
| `producao` | peça, pesquisa ou diligência em andamento |
| `aguardando` | depende do cliente, de terceiro ou do órgão |
| `protocolar` | pronta, falta protocolar ou enviar |
| `concluido` | feita |

O trigger `tg_pendencias_datas` cuida de `atualizado_em` e `concluido_em`. Não grave essas datas pela aplicação.

## Identidade

As cores vêm do design system Pinheiro Advogados, como variáveis CSS em `app/globals.css`, com tema claro e escuro automáticos, e viram classes no `tailwind.config.ts` (`bg-petroleo`, `text-bordo`, `border-line`…). Nunca escreva hex nos componentes.

Regras de marca que valem no código: o bordô entra em pequenas doses (faixa fina no topo, rótulos `.label`, numeração, prazos urgentes); tudo é reto, com `rounded-sm` só em botões e campos e `rounded-md` só em painéis; nada de sombras, emoji ou cartões com borda lateral colorida. O símbolo Raiz fica em `components/RaizMark.tsx` e nunca é redesenhado à mão.

## Acesso

`middleware.ts` exige sessão e, se `ALLOWED_EMAIL` estiver definido, só deixa entrar esse e-mail. A rota `/api/mcp` (do Neo, ainda por fazer) fica fora do middleware e terá autenticação própria.

## Banco

O esquema está em `sql/`, em arquivos numerados. Mudança de banco é sempre um arquivo novo (`002_…sql`), nunca edição de um já rodado.
