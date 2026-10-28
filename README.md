# Central PinheiroAdv

Sistema interno do Pinheiro Advogados: clientes, casos por área, pendências com revisão, prazos, publicações, acompanhamentos, certidões e gastos de diligência, com o Neo como assistente.

## O que existe

- **Início**: o que espera revisão, prazos de hoje e da semana, publicações do dia e consultas atrasadas
- **Clientes e grupos**: dados, contatos, documentos, certidões, rotinas recorrentes e casos de cada cliente
- **Casos** nas áreas Contencioso, Consultoria, Incentivos, Transação e Fiscalização, cada uma com seus campos e etapas, andamentos, pendências e acervo de documentos
- **Pendências**: peças com cadeia de revisão e versões, memoriais, diligências, julgamentos, despachos, rolantes, encadeadas e recorrentes
- **Prazos e calendário**, com calculadora no banco (CPC em dias úteis, DJEN, dias corridos e Decreto 70.235) usando feriados e suspensões confirmados
- **Publicações**: importação, destinação, aprovação e geração de andamento e pendência
- **Acompanhamentos** diários ou semanais de processos, **Certidões** com aviso de vencimento, **Gastos** com reembolso em lote
- **Configurações**: feriados e suspensões, providências e prazos; exclusão com aprovação
- **Neo** como conector MCP (`/api/mcp`); voz e conversa dentro da Central ficam para depois

## Configuração

1. Projeto Supabase `central-pinheiroadv` (São Paulo) com `sql/001` a `sql/006` aplicados, em ordem.
2. No Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ALLOWED_EMAIL`, `NEO_CHAVE` (sensível) e, quando o Neo falar dentro da Central, `ANTHROPIC_API_KEY`.
3. Os feriados de 2026 a 2028 já foram gravados. Para outro ano, rode `select pa_semear_feriados(AAAA)` logado, ou importe o arquivo da rotina em Configurações › Feriados e suspensões.

`npm install` e `npm run dev` para rodar localmente, com `.env.local` copiado de `.env.local.example`.
