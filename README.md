# Portal RPRDV Amazonas

As usinas sobem o próprio RPRDV (o mesmo Excel de hoje). O portal lê a aba **RESUMO**, valida os dados, consolida as 12 usinas e o gerente aprova e envia o e-mail ao Diretor, com a tabela no corpo, o Excel consolidado ("arquivo 0") e os 12 arquivos anexados.

Stack: Next.js 15 · Postgres (Neon) · Vercel Blob (arquivos) · Resend (e-mail).

---

## Como publicar (uma vez só, ~20 min)

### 1. Subir o código no GitHub
1. Entre em github.com e clique em **New repository**. Nome: `rprdv-amazonas`, **Private**, e clique em **Create**.
2. Na página do repositório vazio, clique em **uploading an existing file**.
3. Descompacte o zip no seu computador e arraste **o conteúdo da pasta `rprdv-portal`** (as pastas `app`, `lib`, etc. e o `package.json`). Não arraste a pasta em si.
4. Clique em **Commit changes**.

### 2. Criar o projeto na Vercel
1. Entre em vercel.com, no time **Âmbar Norte**, e vá em **Add New… → Project**.
2. Importe o repositório `rprdv-amazonas` (framework: Next.js, já detectado).
3. **Antes de clicar em Deploy**, abra **Environment Variables** e crie:
   - `AUTH_SECRET` = uma frase aleatória com 40 caracteres ou mais (ex.: gere em https://generate-secret.vercel.app/64)
4. Clique em **Deploy**. O primeiro deploy vai abrir com erro de banco; é normal, o passo 3 resolve.

### 3. Banco de dados (Neon) e arquivos (Blob), sem criar conta em outro lugar
No projeto, vá na aba **Storage**:
1. **Create Database → Neon (Serverless Postgres)**. Região: **São Paulo (gru1)** se houver, senão a mais próxima. Plano Free. Conecte ao projeto.
   Isso cria sozinho a variável `DATABASE_URL`.
2. **Create → Blob**. Conecte ao projeto. Isso cria sozinho o `BLOB_READ_WRITE_TOKEN`.
3. Vá em **Deployments**, clique nos três pontinhos do último deploy e escolha **Redeploy**.

As tabelas e as 12 usinas são criadas automaticamente no primeiro acesso.

### 4. Primeiro acesso
Abra a URL do projeto (ex.: `rprdv-amazonas.vercel.app`). Aparece a tela **Primeiro acesso**: crie o seu usuário administrador.
Em **Administração**:
- crie o usuário do gerente (perfil *Gerente*) e um usuário por usina (perfil *Usina*). O portal mostra uma senha temporária para você repassar;
- em **E-mail ao Diretor**, preencha Para, Cc e a saudação;
- em **Usinas**, atualize o texto do heat rate quando mudar o mês.

### 5. Envio automático de e-mail (Resend)
Enquanto isso não estiver feito, o painel funciona normalmente e o botão **Copiar e-mail** gera o e-mail pronto para colar no Outlook.
1. Crie conta grátis em resend.com (até 3.000 e-mails/mês).
2. **Domains → Add domain**. Para sair de um endereço da empresa (ex.: `rprdv@ambarenergia.com.br`), a TI precisa cadastrar os registros DNS que o Resend mostra. Sem domínio validado, o Resend só deixa enviar para o seu próprio e-mail (serve para teste).
3. **API Keys → Create API Key**.
4. Na Vercel, em **Settings → Environment Variables**, crie:
   - `RESEND_API_KEY` = a chave criada
   - `EMAIL_FROM` = o remetente, ex.: `rprdv@ambarenergia.com.br`
5. Faça **Redeploy**.

---

## Como funciona

| Perfil | O que faz |
|---|---|
| Usina | Sobe o Excel da própria usina, vê o que foi lido e os alertas, e confirma o envio |
| Gerente | Painel do dia: quem enviou, alertas, tabela consolidada, Excel "0", **Aprovar e enviar** |
| Administrador | Tudo o que o gerente faz, mais usuários e usinas |

**Regras de leitura**
- Lê a aba RESUMO pelo texto dos cabeçalhos, então funciona com os 4 layouts atuais.
- O dia é a **posição da linha** (1ª linha = dia 1), igual ao consolidado em Excel. Se as datas da planilha estiverem em outro mês, aparece um alerta.
- O arquivo mais recente da usina no mês substitui o anterior. Se valores de dias já enviados mudarem, aparece um aviso para o gerente.

**Validações automáticas:** arquivo de outra usina (bloqueia o envio), nome sem o mês, datas de outro mês, dia de ontem não preenchido, dias faltando, dias futuros preenchidos, valores negativos, despacho acima de 120%, variação maior que 40% em relação à média do mês, e alteração de dias já enviados.

**Cálculos (corrigidos em relação à planilha antiga)**
- MW/hora acumulado = média **dos dias com dado**. O Excel dividia por 31 dias, inclusive os futuros.
- Despacho do Total = soma da geração verificada (MW) ÷ soma da disponibilidade (MW).
- Geração/PDPW do Total = só as usinas com programação. O Excel somava no numerador a geração das pequenas.
- Usinas *simples* (Anamã, Anori, Caapiranga, Codajás, Manacapuru) aparecem só com geração verificada e receita, como hoje.

## Rodar localmente (opcional, para desenvolvedor)
```
npm install
# .env.local com DATABASE_URL=postgres://... e AUTH_SECRET=...
npm run dev
```
Sem `BLOB_READ_WRITE_TOKEN`, os arquivos são guardados em `/var/tmp/rprdv-arquivos`.
