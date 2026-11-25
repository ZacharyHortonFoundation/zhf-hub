# ZHF Hub

Donations, events and volunteer management for the **Zachary Horton Foundation** — replacing the
AHA Apps "Aha Impact" system (Dynamics 365 + Power Pages).

| Folder | What's in it |
|---|---|
| [`zhf-hub/`](zhf-hub/) | The application (Next.js + Prisma). Start with [`zhf-hub/README.md`](zhf-hub/README.md). |
| [`docs/01-discovery.md`](docs/01-discovery.md) | What AHA provides today (portal, Dynamics modules, data volumes) |
| [`docs/02-solution-overview.md`](docs/02-solution-overview.md) | Architecture, AHA feature-parity map, costs, roadmap |
| [`docs/03-migration-plan.md`](docs/03-migration-plan.md) | Moving data out of Dynamics and cutting over |
| [`docs/04-deployment.md`](docs/04-deployment.md) | Step-by-step hosting setup (Vercel + Supabase, or Azure) and go-live checklist |

Quick start:

```powershell
cd zhf-hub
npm install
copy .env.example .env   # set AUTH_SECRET
npm run setup            # local database + sample data
npm run dev              # http://localhost:3000
```
