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
docker build -t kulasinn/bosancica-ai:bosancica-frontend .
```

Run it locally:

```bash
docker run --rm -p 8000:8000 kulasinn/bosancica-ai:bosancica-frontend
```

Open http://localhost:8000.

Or run it with Docker Compose from the repository root:

```powershell
docker network inspect bosancica_network *> $null
if ($LASTEXITCODE -ne 0) { docker network create bosancica_network }
docker compose -f frontend/docker-compose.yml up --build
```

Stop it with:

```powershell
docker compose -f frontend/docker-compose.yml down
```

## Expose with port forwarding

The Docker container listens through the host on port `8000`.

Use these addresses:

```text
Public IP for DNS:         77.77.236.72
Windows LAN IP for router: 192.168.0.3
Router gateway:            192.168.0.1
```

In cPanel DNS for `qla.dev`, set `bosancica.qla.dev` to your public IP:

```text
Name: bosancica
Type: A
Record: 77.77.236.72
```

In the router at http://192.168.0.1, add this port-forwarding rule:

```text
External port: 80
Internal IP:   192.168.0.3
Internal port: 8000
Protocol:      TCP
```

Use `192.168.0.3`, not the Docker/WSL adapter IPs like `172.21.128.1` or `192.168.208.1`.

Allow inbound TCP traffic to port `8000` in Windows Firewall if it is blocked:

```powershell
New-NetFirewallRule -DisplayName "Bosancica frontend 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

Then test from mobile data, not Wi-Fi:

```text
http://77.77.236.72
http://bosancica.qla.dev
```

Testing `http://77.77.236.72` from the same Wi-Fi network can fail if the router does not support NAT loopback. Fix it in one of these ways:

- Enable `NAT loopback`, `hairpin NAT`, or `NAT reflection` in the router if that option exists.
- Use the LAN URL while connected to Wi-Fi: `http://192.168.0.3:8000`.
- On this Windows machine only, add `127.0.0.1 bosancica.qla.dev` to `C:\Windows\System32\drivers\etc\hosts`, then open `http://bosancica.qla.dev:8000`.
- For all devices on Wi-Fi, add a local DNS override in the router or a local DNS server: `bosancica.qla.dev -> 192.168.0.3`, then open `http://bosancica.qla.dev:8000`.

Use mobile data to test the public path.

If it does not open, check the router WAN/Internet IP. It must be `77.77.236.72`. If the WAN IP is `10.x.x.x`, `100.64.x.x`, or `192.168.x.x`, the ISP is using CGNAT and router port forwarding will not work until they give you a real public IPv4.

Push to Docker Hub:

Use a private Docker Hub repository named `bosancica-ai` if this should match the `tagnet` repository pattern.

```bash
docker login
docker push YOUR_DOCKER_USERNAME/bosancica-ai:bosancica-frontend
```

Example:

```bash
docker push kulasinn/bosancica-ai:bosancica-frontend
```
