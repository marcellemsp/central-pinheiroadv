import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { FERRAMENTAS_NEO, executarFerramenta } from "@/lib/neo/ferramentas";
import { hojeSP } from "@/lib/neo/situacoes";

// Conversa com o Neo dentro da Central (texto e voz).
// Precisa de ANTHROPIC_API_KEY no Vercel. Modelo em NEO_MODELO.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Mensagem = { role: "user" | "assistant"; content: string };

function sistema() {
  const hoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return `Você é o Neo, assistente da Central PinheiroAdv, o sistema interno do Pinheiro Advogados, escritório de direito tributário de Marcelle Pinheiro, no Rio de Janeiro. Você conversa com a Marcelle dentro da própria Central, por texto ou por voz.

Hoje é ${hoje} (${hojeSP()}), fuso de São Paulo.

Jeito de falar: português do Brasil, direto, sóbrio e eficiente, sem floreios e sem emoji. Respostas curtas, que funcionem lidas em voz alta: frases corridas, poucas listas, nada de tabelas. Nunca use "e/ou" nem plurais com "(s)".

Pendências andam pelas situações a_fazer, em_elaboracao, revisao_pendente, devolvida, pronta_protocolar, aguardando_cliente, aguardando (espera a anterior), bloqueada e concluida. Cada pendência pode estar ligada a um cliente e a um caso. Use as ferramentas para consultar e alterar as pendências da Central. Para concluir ou mudar algo citado pelo nome, primeiro ache o id com listar_pendencias usando busca; se houver mais de uma parecida, pergunte qual antes de alterar. Depois de alterar, confirme em uma frase o que foi feito.

Quando ela disser "bom dia" ou pedir o resumo, use resumo_do_dia e responda com vencidas e prazos de hoje primeiro, depois a semana e as sem prazo, e termine com uma sugestão de por onde começar se houver algo claramente mais urgente.

Você não tem acesso à agenda nem ao e-mail daqui de dentro da Central; se ela pedir isso, diga que por enquanto só o Neo do app do Claude enxerga a agenda.`;
}

export async function POST(request: Request) {
  const sb = createClient();
  if (!sb) return Response.json({ erro: "Banco de dados não configurado." }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  const permitido = process.env.ALLOWED_EMAIL?.toLowerCase();
  if (!user || (permitido && user.email?.toLowerCase() !== permitido)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { erro: "O Neo ainda não tem a chave da API do Claude (ANTHROPIC_API_KEY) configurada no Vercel." },
      { status: 503 },
    );
  }

  let mensagens: Mensagem[];
  try {
    const corpo = await request.json();
    mensagens = (corpo?.mensagens ?? [])
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
      .slice(-30);
  } catch {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  if (mensagens.length === 0 || mensagens[mensagens.length - 1].role !== "user") {
    return Response.json({ erro: "Mensagem vazia." }, { status: 400 });
  }

  const anthropic = new Anthropic();
  const modelo = process.env.NEO_MODELO || "claude-sonnet-5-5";
  const conversa: Anthropic.MessageParam[] = mensagens.map((m) => ({ role: m.role, content: m.content }));
  let alterou = false;

  try {
    for (let rodada = 0; rodada < 8; rodada++) {
      const resposta = await anthropic.messages.create({
        model: modelo,
        max_tokens: 1200,
        system: sistema(),
        tools: FERRAMENTAS_NEO as Anthropic.Tool[],
        messages: conversa,
      });

      if (resposta.stop_reason !== "tool_use") {
        const texto = resposta.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (alterou) {
          revalidatePath("/home");
          revalidatePath("/pendencias");
        }
        return Response.json({ resposta: texto || "Feito.", alterou });
      }

      conversa.push({ role: "assistant", content: resposta.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type !== "tool_use") continue;
        if (bloco.name !== "resumo_do_dia" && bloco.name !== "listar_pendencias") alterou = true;
        try {
          const dados = await executarFerramenta(bloco.name, bloco.input);
          resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(dados) });
        } catch (e) {
          resultados.push({
            type: "tool_result",
            tool_use_id: bloco.id,
            content: `Erro: ${(e as Error).message}`,
            is_error: true,
          });
        }
      }
      conversa.push({ role: "user", content: resultados });
    }
    return Response.json({ resposta: "Não consegui terminar agora. Pode repetir de outro jeito?", alterou });
  } catch (e) {
    console.error("Neo:", e);
    return Response.json({ erro: "O Neo não respondeu. Tente de novo em instantes." }, { status: 502 });
  }
}
