# Central PinheiroAdv

Sistema interno do Pinheiro Advogados: pendências, prazos, clientes e casos, com o Neo como assistente.

## Primeira configuração

1. Projeto Supabase já criado (`central-pinheiroadv`, região São Paulo), com `sql/001_inicial.sql` e `sql/002_funcao_privada.sql` aplicados.
2. Em Authentication > URL Configuration, cadastre o endereço da Central (e `http://localhost:3000` para testes) como Site URL e Redirect URL, com `/auth/callback`.
3. Copie `.env.local.example` para `.env.local` e preencha com a URL e a chave anônima do projeto (Project Settings > API).
4. `npm install` e `npm run dev`.

No Vercel, as mesmas três variáveis vão em Settings > Environment Variables.

## O que já existe

- Início com os prazos de hoje, os vencidos e os da semana
- Pendências em tabela e em quadro, com criação, mudança de situação e conclusão
- Login por link mágico, restrito a um e-mail

## Próximos passos

Prazos com calculadora, calendário, clientes, casos e processos, e o servidor MCP do Neo.
