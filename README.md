# Audiology Onboarding Resources

Internal Cherry reference tool for the audiology team — Node.js + Express backend,
PostgreSQL database, static frontend served from `public/`.

## Stack

| Layer     | Choice                                   |
|-----------|-------------------------------------------|
| Runtime   | Node.js 18+ (Express)                    |
| Database  | PostgreSQL (AWS RDS)                      |
| Port      | `8080` (via `PORT` env var)                |
| Frontend  | Single static HTML/JS file in `public/`   |
| Media     | Photos/docs stored as base64 in a `jsonb` column (fine for an internal tool; see "Scaling media storage" below if it grows) |

## Repo structure

```
.
├── server.js            # Express app + REST API
├── package.json
├── apprunner.yaml        # AWS App Runner build/run config
├── .env.example           # Env vars needed (copy to .env locally)
├── .gitignore
├── db/
│   ├── schema.sql        # Table definitions
│   └── migrate.js        # Applies schema.sql to DATABASE_URL
└── public/
    └── index.html        # Frontend (calls the API instead of localStorage)
```

## Environment variables

| Variable        | Required | Notes                                                            |
|-----------------|----------|--------------------------------------------------------------------|
| `DATABASE_URL`   | Yes      | `postgresql://user:password@host:5432/dbname` — your RDS endpoint |
| `PORT`           | No       | Defaults to `8080`. App Runner expects the app to listen on this.  |
| `NODE_ENV`       | No       | Set to `production` in AWS.                                       |
| `PGSSLMODE`      | No       | Leave unset for RDS (SSL used by default). Set to `disable` only for a local Postgres without SSL. |

## Local development

```bash
cp .env.example .env       # fill in a real DATABASE_URL
npm install
npm run migrate            # creates the tables
npm start                  # listens on PORT (default 8080)
```

Visit `http://localhost:8080`.

---

## Deploying on AWS

This is built to deploy with **AWS App Runner**, which is the AWS "import from
GitHub" tool — it connects directly to a GitHub repo, rebuilds on push, and
handles the runtime/port/env var config through `apprunner.yaml` plus the
service's environment variable settings.

### 1. Create the database (AWS RDS)

1. RDS Console → **Create database** → PostgreSQL (15 or 16 is fine).
2. Choose an instance size (a small `db.t4g.micro`/`db.t4g.small` is plenty for
   an internal tool like this).
3. Set a master username/password, and note the **endpoint** it gives you once created.
4. Under **Connectivity**, put it in the same VPC you'll use for App Runner,
   and make sure its security group allows inbound Postgres (port `5432`)
   from App Runner's VPC connector (or from your office IP if you're
   connecting from a bastion/VPN to run the migration manually).
5. Create a database inside the instance, e.g. `audiology_resources`.

Your `DATABASE_URL` will look like:
```
postgresql://audiology_app:<password>@<rds-endpoint>:5432/audiology_resources
```

### 2. Push this repo to GitHub

Create a new repo (can be a private internal repo) and push these files to it.

### 3. Create the App Runner service

1. AWS Console → **App Runner** → **Create service**.
2. Source: **Source code repository** → connect your GitHub account/org →
   select this repo and branch.
3. Deployment trigger: **Automatic** (redeploys on every push to the branch).
4. Build settings: App Runner will detect `apprunner.yaml` in the repo root —
   confirm it's using it (runtime `nodejs18`, build command `npm install
   --omit=dev`, start command `npm start`, port `8080`).
5. Under **Environment variables**, add:
   - `DATABASE_URL` → your RDS connection string (mark as a **secret** value)
   - `NODE_ENV` → `production`
6. Under **Networking**, if your RDS instance is in a private VPC (recommended),
   add a **VPC connector** pointing at that VPC/subnets so App Runner can reach
   the database.
7. Create the service. App Runner will build and deploy; you'll get a URL like
   `https://xxxxx.us-east-1.awsapprunner.com`.

Since this is for internal use only, put the App Runner service behind your
existing internal access controls — e.g. restrict it to your VPC and put it
behind an internal ALB, or front it with your SSO/VPN setup rather than
exposing the App Runner default URL publicly.

### 4. Run the migration once

The schema needs to be created once against the new database. Easiest ways:

- **From your machine** (if you can reach the RDS endpoint, e.g. via VPN/bastion):
  ```bash
  DATABASE_URL="postgresql://..." npm run migrate
  ```
- **From within AWS**: run it as a one-off ECS task, a Lambda, or temporarily
  SSH/SSM into any box inside the VPC with Node installed and run the same command.

After that, the six tables (`internal_resources`, `knowledge_cards`,
`talk_tracks`, `provider_contacts`, `implementation_examples`) exist and the
app is ready to use.

### 5. Redeploying

Any push to the connected branch triggers an automatic rebuild/redeploy in
App Runner — no extra steps needed. Schema changes (editing `db/schema.sql`)
are **not** auto-applied; run `npm run migrate` again after schema changes
(the SQL uses `CREATE TABLE IF NOT EXISTS`, so it's safe to re-run).

---

## API reference

All endpoints are under `/api/resources/:section`, where `:section` is one of
`internal`, `industry`, `product`, `talktrack`, `contacts`, `examples`.

| Method | Path                                      | Notes                          |
|--------|--------------------------------------------|----------------------------------|
| GET    | `/api/resources/:section`                  | List all items                  |
| POST   | `/api/resources/:section`                  | Create an item                  |
| PUT    | `/api/resources/:section/:id`               | Update an item                  |
| DELETE | `/api/resources/:section/:id`               | Delete an item                  |
| POST   | `/api/resources/:section/:id/validate`      | `industry`/`product` only — stamps `dateValidated` to today |
| GET    | `/api/health`                              | Simple DB connectivity check    |

## Scaling media storage

Photos/docs on Industry Knowledge, Product Knowledge, and Example
Implementation cards are stored inline as base64 in a Postgres `jsonb`
column. That's simple and works fine for a small internal team, but if
uploads get heavy (a lot of large PDFs/photos), the better long-term move is
an S3 bucket: upload the file to S3, store just the S3 key/URL in the
`media` column instead of the base64 blob. Happy to wire that up later if it
becomes a problem — it doesn't require any frontend changes to the data
model, just swapping what `dataUrl` points to.
