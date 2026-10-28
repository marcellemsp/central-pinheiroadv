export default function AvisoConfiguracao() {
  return (
    <div className="border border-line bg-surface-200 rounded-md p-6 max-w-2xl">
      <p className="label mb-3">Configuração pendente</p>
      <h2 className="font-serif text-2xl font-semibold text-ink-heading mb-2">O banco de dados ainda não está ligado</h2>
      <p className="text-ink-muted leading-relaxed">
        Para a Central funcionar, crie o projeto no Supabase, rode o arquivo <code>sql/001_inicial.sql</code> no SQL
        Editor e preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> nas
        variáveis de ambiente.
      </p>
    </div>
  );
}
