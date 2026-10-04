import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __schemaOk: Promise<void> | undefined;
}

function conn() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL não configurada (conecte o Neon no projeto da Vercel).");
  return url;
}

export function pool(): Pool {
  if (!global.__pool) {
    const url = conn();
    const local = /localhost|127\.0\.0\.1/.test(url);
    global.__pool = new Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return global.__pool;
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  await garantirSchema();
  const r = await pool().query(text, params as any[]);
  return r.rows as T[];
}

export async function q1<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const r = await q<T>(text, params);
  return r[0] ?? null;
}

const SCHEMA = `
create table if not exists usinas (
  id serial primary key,
  nome text not null unique,
  ordem int not null default 0,
  tipo text not null default 'completa' check (tipo in ('completa','simples')),
  heat_rate_texto text,
  chave_arquivo text,           -- trecho esperado no nome do arquivo (ex.: MAUA 3)
  ativo boolean not null default true
);

create table if not exists usuarios (
  id serial primary key,
  nome text not null,
  email text not null unique,
  senha_hash text not null,
  papel text not null check (papel in ('admin','gerente','usina')),
  usina_id int references usinas(id),
  ativo boolean not null default true,
  trocar_senha boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists envios (
  id serial primary key,
  usina_id int not null references usinas(id),
  ano int not null,
  mes int not null,
  arquivo_nome text not null,
  arquivo_url text not null,
  arquivo_tamanho int,
  enviado_por int references usuarios(id),
  enviado_em timestamptz not null default now(),
  dias_preenchidos int[] not null default '{}',
  avisos jsonb not null default '[]'
);
create index if not exists envios_usina_mes on envios(usina_id, ano, mes, enviado_em desc);

create table if not exists leituras (
  usina_id int not null references usinas(id),
  data date not null,
  envio_id int references envios(id),
  inflex_mwh double precision,
  disp_mw double precision,
  prog_mwh double precision,
  prog_mw double precision,
  verif_mwh double precision,
  verif_mw double precision,
  flex_mwh double precision,
  pv double precision,
  pf double precision,
  receita double precision,
  desp double precision,
  preco double precision,
  heat_rate double precision,
  atualizado_em timestamptz not null default now(),
  primary key (usina_id, data)
);

create table if not exists consolidacoes (
  id serial primary key,
  data_ref date not null,
  enviado_por int references usuarios(id),
  enviado_em timestamptz not null default now(),
  para text,
  cc text,
  assunto text,
  html text,
  snapshot jsonb,
  status text not null default 'enviado',
  detalhe text
);

create table if not exists config (
  chave text primary key,
  valor jsonb not null
);
`;

const USINAS_INICIAIS: [string, string, string, string][] = [
  // nome, tipo, heat rate (texto), chave no nome do arquivo
  ["UTE Mauá 3", "completa", "6,5 MMBTU/MWh", "MAUA 3"],
  ["UTE Aparecida", "completa", "9,24 MMBTU/MWh", "APARECIDA"],
  ["UTE Poraquê", "completa", "8 MMBTU/MWh", "PORAQUE"],
  ["UTE Pirarucu", "completa", "7,98 MMBTU/MWh", "PIRARUCU"],
  ["UTE Tucunaré", "completa", "7,92 MMBTU/MWh", "TUCUNARE"],
  ["UTE Tambaqui", "completa", "8,66 MMBTU/MWh", "TAMBAQUI"],
  ["UTE Jaraqui", "completa", "8,7 MMBTU/MWh", "JARAQUI"],
  ["UTE Anamã", "simples", "11,9 MMBTU/MWh", "ANAMA"],
  ["UTE Anori", "simples", "11,5 MMBTU/MWh", "ANORI"],
  ["UTE Caapiranga", "simples", "11,9 MMBTU/MWh", "CAAPIRANGA"],
  ["UTE Codajás", "simples", "11,5 MMBTU/MWh", "CODAJAS"],
  ["UTE Manacapuru", "simples", "283 L/MWh", "MANACAPURU"],
];

export const CONFIG_PADRAO = {
  email: {
    para: "",
    cc: "",
    remetente_nome: "RPRDV Amazonas",
    saudacao: "Fabio, bom dia.",
    heat_rate_rotulo: "Heat Rate Realizado até 30/09/26",
    anexar_arquivos: true,
  },
};

export function garantirSchema(): Promise<void> {
  if (!global.__schemaOk) {
    global.__schemaOk = (async () => {
      const c = await pool().connect();
      try {
        await c.query("select pg_advisory_lock(424242)");
        await c.query(SCHEMA);
        const { rows } = await c.query("select count(*)::int n from usinas");
        if (rows[0].n === 0) {
          for (const [i, [nome, tipo, hr, chave]] of USINAS_INICIAIS.entries()) {
            await c.query(
              "insert into usinas(nome, ordem, tipo, heat_rate_texto, chave_arquivo) values ($1,$2,$3,$4,$5)",
              [nome, i + 1, tipo, hr, chave],
            );
          }
        }
        await c.query(
          "insert into config(chave, valor) values ('email', $1) on conflict (chave) do nothing",
          [JSON.stringify(CONFIG_PADRAO.email)],
        );
      } finally {
        await c.query("select pg_advisory_unlock(424242)").catch(() => {});
        c.release();
      }
    })().catch((e) => {
      global.__schemaOk = undefined;
      throw e;
    });
  }
  return global.__schemaOk;
}

export type ConfigEmail = typeof CONFIG_PADRAO.email;

export async function lerConfigEmail(): Promise<ConfigEmail> {
  const r = await q1<{ valor: ConfigEmail }>("select valor from config where chave='email'");
  return { ...CONFIG_PADRAO.email, ...(r?.valor ?? {}) };
}
