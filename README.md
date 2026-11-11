# Convite Único

Plataforma web para criar convites digitais em PDF/JPG com QR Code individual, validar entradas à porta e consultar relatórios.

## Funcionalidades
- Painel de administrador com resumo, criação de eventos e emissão em lote de convites.
- Cada convite tem um token aleatório e um QR Code individual.
- Validação de entrada por câmara ou introdução manual do código.
- **Regra de utilização única:** a primeira validação válida altera o estado do convite de `unused` para `used`. Uma segunda leitura, mesmo de uma cópia do mesmo QR, é recusada.
- Registo de data/hora e operador de cada tentativa aceite.
- Pesquisa, listagem, exportação CSV e relatório por evento.
- Contas de administrador e operador de porta.
- Sessões protegidas, limitação de tentativas, validação de dados e cabeçalhos de segurança.

## Requisitos
- Node.js 20 ou superior e npm.
- Câmara e HTTPS para leitura de QR em dispositivos móveis (localhost também é permitido pelos browsers).

## Instalação
1. Descompacte o projecto.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Copie `.env.example` para `.env` e defina `SESSION_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
4. Inicialize a base de dados e o utilizador administrador:
   ```bash
   npm run db:init
   ```
5. Inicie:
   ```bash
   npm run dev
   ```
6. Abra `http://localhost:3000`.

O utilizador administrador é criado apenas se ainda não existir. Para produção, use uma palavra-passe forte e única.

## Utilização
1. Entre com o email e palavra-passe do administrador.
2. Crie um evento, definindo nome, local, data e capacidade (opcional).
3. Emita os convites em lote. Pode indicar nome do convidado e observação; deixe em branco para criar convites genéricos.
4. Descarregue os convites individualmente em PDF ou JPG.
5. Crie uma conta `Operador` na área **Utilizadores** para quem fará a leitura à entrada.
6. O operador entra na plataforma, abre **Leitor**, autoriza a câmara e lê o QR Code.
7. O resultado indica se a entrada foi aceite, se o convite já foi utilizado ou se é inválido.

## Regra técnica contra duplicação
A validação é executada no servidor numa transacção SQLite `BEGIN IMMEDIATE`. O servidor consulta e altera o estado na mesma transacção. Assim, duas leituras simultâneas não conseguem aceitar o mesmo convite. O QR não contém dados pessoais: contém apenas um token aleatório de alta entropia. Uma cópia física/digital mantém o mesmo token e, por isso, fica inutilizada depois da primeira entrada aceite.

> Importante: o sistema garante que apenas a primeira leitura é aceite. Não consegue determinar se a pessoa que apresenta primeiro o QR é o titular legítimo; para eventos de maior risco, confirme também a identidade do convidado.

## Segurança e produção
- Configure `PUBLIC_BASE_URL` com o domínio HTTPS real.
- Use HTTPS em produção; a câmara dos telemóveis exige contexto seguro.
- Defina `NODE_ENV=production`, `SESSION_SECRET` forte e credenciais fortes.
- Faça cópias de segurança regulares da pasta `data/`.
- Não exponha a porta da base de dados nem publique o `.env`.
- Recomenda-se executar atrás de um proxy HTTPS (Nginx/Caddy) e configurar `trust proxy` adequadamente.
- O SQLite é adequado para instalações pequenas/médias num único servidor. Para múltiplas instâncias/alto volume, migre para PostgreSQL e mantenha a validação atómica.

## Estrutura
```text
convite-unico/
├── public/                 # interface web
├── server/
│   ├── index.js            # servidor e API
│   ├── db.js               # base de dados e transacções
│   ├── init-db.js          # inicialização/admin inicial
│   ├── auth.js             # autenticação e permissões
│   └── documents.js        # PDF e PNG
├── data/                   # base de dados criada localmente
├── .env.example
├── config.js
├── index.html
├── package.json
└── README.md
```

## Resolução de problemas
- **A câmara não abre:** use HTTPS ou `localhost`, permita acesso à câmara e verifique se outra aplicação não a está a utilizar.
- **Sessão termina:** confirme que `SESSION_SECRET` não muda entre reinícios.
- **QR inválido:** confirme que o convite pertence a um evento activo e que o código não foi revogado.
- **Não consigo entrar:** confirme as credenciais definidas no `.env` e execute `npm run db:init`.
