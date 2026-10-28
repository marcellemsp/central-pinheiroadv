# Central PinheiroAdv

Sistema interno do Pinheiro Advogados: pendências, prazos, clientes e casos, com o Neo como assistente.

## Primeira configuração

1. Projeto Supabase já criado (`central-pinheiroadv`, região São Paulo), com `sql/001_inicial.sql` e `sql/002_funcao_privada.sql` aplicados.
2. Em Authentication > URL Configuration, cadastre o endereço da Central (e `http://localhost:3000` para testes) como Site URL e Redirect URL, com `/auth/callback`.
3. Copie `.env.local.example` para `.env.local` e preencha com a URL e a chave anônima do projeto (Project Settings > API).
4. `npm install` e `npm run dev`.

Publicada no Vercel (projeto `central-pinheiroadv`), com deploy automático a cada envio para a branch `main`. As três variáveis já estão em Settings > Environment Variables.

## O que já existe

- Início com os prazos de hoje, os vencidos e os da semana
- Pendências em tabela e em quadro, com criação, mudança de situação e conclusão
- Prazos com calculadora judicial (CPC, dias úteis, suspensão de 20/12 a 20/01, DJe, feriados do TJRJ e da Justiça Federal) e administrativa (Decreto 70.235/1972)
- Clientes e casos, cada um com sua página, pendências ligadas e dados editáveis
- Login por e-mail e senha, com link por e-mail como alternativa
- Neo como conector MCP (`/api/mcp`); conversa por voz dentro da Central fica para depois

## Próximos passos

Neo por voz (Siri no iPhone e escuta da palavra "Neo" no Mac Mini, com modelo local), calendário e relatórios.
