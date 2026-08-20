# Sofie Sound Board

A grid of tiles that play an audio message when tapped. Content is managed
through a password-protected admin page where you can add/delete tiles, set
text and images, and add audio by **uploading an mp3** or **recording live**
from the microphone.

## Tech

- Node.js + Express
- Sessions via `express-session`, file uploads via `multer`
- Storage (auto-selected):
  - **MySQL** when database env vars are set (persists across container
    rebuilds/redeploys). Tiles, settings, and the audio/image files are all
    stored in the database.
  - **Local files** as a fallback for development (`data/*.json` +
    `public/uploads/`) when no database is configured.

## Run locally

```bash
npm install
ADMIN_PASSWORD="your-password" SESSION_SECRET="long-random-string" npm start
```

Then open http://localhost:3000 (admin at `/admin.html`).

## Environment variables

See `.env.example`:

| Variable         | Purpose                                                        |
|------------------|---------------------------------------------------------------|
| `ADMIN_PASSWORD` | Password for the admin login page                             |
| `SESSION_SECRET` | Signs session cookies; set a fixed random value in production |
| `PORT`           | Port to listen on (provided automatically on Combell)         |
| `DB_HOST`        | MySQL host (from Combell "Databases")                         |
| `DB_PORT`        | MySQL port (usually `3306`)                                   |
| `DB_NAME`        | MySQL database name                                           |
| `DB_USER`        | MySQL user                                                    |
| `DB_PASSWORD`    | MySQL password                                                |

The database tables (`cells`, `settings`, `media`) are created automatically
on first run.

## Deploy on Combell (Node.js hosting)

Combell rebuilds the app into a fresh container on each deploy, so **a database
is required** for content to survive rebuilds (local files are wiped).

1. In the Combell panel, open **Databases** and create a **MySQL** database;
   note the host, database name, user, and password.
2. In the Node.js app settings, set the environment variables:
   `ADMIN_PASSWORD`, `SESSION_SECRET`, and `DB_HOST` / `DB_PORT` / `DB_NAME` /
   `DB_USER` / `DB_PASSWORD`.
3. Make sure the Git repository is connected and run the pipeline (it installs
   dependencies and starts the app).

> Note: microphone recording requires HTTPS in the browser (localhost is
> exempt). Make sure your Combell domain is served over HTTPS.
