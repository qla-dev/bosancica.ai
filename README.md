<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/895c7394-7595-4784-ab25-2114d91c8f5a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run with Docker

Build the production image:

```bash
docker build -t kulasinn/bosancica-frontend:latest .
```

Run it locally:

```bash
docker run --rm -p 8000:8000 kulasinn/bosancica-frontend:latest
```

Open http://localhost:8000.

Or run it with Docker Compose:

```bash
docker network create bosancica_network
docker compose up --build
```

Push to Docker Hub:

```bash
docker login
docker push YOUR_DOCKER_USERNAME/bosancica-frontend:latest
```

Example:

```bash
docker push kulasinn/bosancica-frontend:latest
```
