# Sofie Sound Board

A grid of tiles that play an audio message when tapped. Content is managed
through a password-protected admin page where you can add/delete tiles, set
text and images, and add audio by **uploading an mp3** or **recording live**
from the microphone.

## Tech

- Node.js + Express
- Sessions via `express-session`, file uploads via `multer`
- File-based storage (no database required):
  - Tile metadata: `data/cells.json`
  - Uploaded audio/images: `public/uploads/`

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

## Deploy on Combell (Node.js hosting)

Combell runs Node.js apps via cPanel + Phusion Passenger.

1. Push this repo to Git (already configured).
2. In the Combell control panel, open **Setup Node.js App** and create an app:
   - **Application root**: the folder where you upload/clone this repo
   - **Application startup file**: `server.js`
   - **Node version**: 18 or newer
3. Add the environment variables `ADMIN_PASSWORD` and `SESSION_SECRET`.
4. Click **Run NPM Install**, then **Start/Restart** the app.

The `data/` and `public/uploads/` folders are created automatically on first
run and persist on Combell's disk, so uploaded audio and tile content survive
restarts and deploys.

> Note: microphone recording requires HTTPS in the browser (localhost is
> exempt). Make sure your Combell domain is served over HTTPS.
