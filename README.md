# Sankalp Digital Pathshala Enterprise Upgrade

Upgraded educational institute platform with public pages, admin dashboard, secure result ERP, dynamic gallery management, branding settings, AI assistant APIs, deployment artifacts, and a PostgreSQL Prisma target schema.

## What Changed

- Official Sankalp logo is used through a dynamic branding layer.
- Home page now includes the upgraded academic foundation, mission, and founder sections.
- Results now support category-wise dynamic marksheets, PDF marksheets, and external digital result links.
- Admin dashboard now manages result categories, results, CSV import, gallery categories, gallery images, branding, students, chatbot overview, settings, and activity logs.
- Gallery is now dynamic with categories, search, metadata, masonry layout, and lightbox controls.
- Backend includes richer Mongoose runtime models, public/admin REST APIs, result lookup rate limiting, upload tracking, soft deletes, and audit logging.
- `prisma/schema.prisma` contains the requested PostgreSQL ERP database design.
- Docker, Docker Compose, `.env.example`, API docs, deployment docs, and security notes are included.

## Quick Start

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

If `MONGODB_URI` is not set, public pages use demo data where possible so the UI can still be reviewed.

## Admin

Set these values before logging in:

```env
ADMIN_EMAIL=admin@sankalpdigitalpathshala.online
ADMIN_PASSWORD=change-this-before-deploy
JWT_SECRET=replace-with-a-long-random-secret
```

Then visit `/admin-login`.

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/DEPLOYMENT.md`
- `docs/SECURITY.md`
- `prisma/schema.prisma`

## Verification

```bash
npm run check
```
