# Bosancica: cPanel frontend + Docker API deployment

This document describes the production layout used by Bosancica:

```text
Browser
  https://bosancica.ai
    -> cPanel static frontend (built Vite dist/)
    -> https://api.bosancica.ai:82/api/...
       -> router TCP forwarding (82 -> 192.168.0.4:82)
       -> IIS HTTPS + ARR reverse proxy
       -> Docker Laravel backend (127.0.0.1:8001)
       -> Docker model and queue services on the private Docker network
```

The frontend is not served from Docker in production. Docker runs Laravel, the
queue workers and AI/model services. The frontend Docker service remains useful
only for local development.

## Production addresses

| Component | Address |
| --- | --- |
| Public frontend | `https://bosancica.ai` |
| Public API | `https://api.bosancica.ai:82` |
| IIS-to-Docker backend target | `http://127.0.0.1:8001` |
| Router management address | `192.168.0.1` |
| Docker/IIS machine LAN address | `192.168.0.4` |
| Router WAN and API DNS address | `77.77.236.72` |

Do not publish Docker model ports or the Laravel port directly on the Internet.
IIS is the only public entry point for the API.

## 1. Code configuration

### Frontend

The shared API URL helper is `src/api/client.ts`:

```ts
const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
export const apiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, '');
```

All browser API modules must use `apiBaseUrl`, rather than `localhost` or a
hard-coded Docker port. The cPanel build gets the production value from
`redeploy.php`:

```php
putenv('VITE_API_BASE_URL=https://api.bosancica.ai:82');
```

Vite substitutes that value while building. It is not a runtime server
environment variable, so changing it requires a new frontend build/redeploy.

### Backend CORS and proxy trust

The backend accepts requests from the cPanel frontend in `config/cors.php`:

```php
'allowed_origins' => [
    env('FRONTEND_URL', 'https://bosancica.ai'),
    env('FRONTEND_WWW_URL', 'https://www.bosancica.ai'),
],
```

`bootstrap/app.php` trusts the server HTTPS proxy, so Laravel correctly
recognizes requests forwarded from IIS. Do not add the API URL as a CORS origin:
CORS checks the browser frontend origin (`https://bosancica.ai`), not the API
destination.

## 2. DNS

In the cPanel Zone Editor, keep the normal site records for `bosancica.ai` and
add this API record:

```text
Type: A
Name: api
Value: 77.77.236.72
TTL: default (or 300 while setting up)
```

This is a DNS subdomain only. Do **not** create `api.bosancica.ai` as a cPanel
website/subdomain with a public document root: its web server is IIS on the
Docker machine, not cPanel.

Verify from Windows:

```powershell
Resolve-DnsName api.bosancica.ai
```

The returned address must be `77.77.236.72`.

## 3. Docker host

At the repository root, create/update the non-committed `.env` on the Docker
machine:

```env
PUBLIC_APP_URL=https://api.bosancica.ai:82
BACKEND_HTTP_PORT=8001
```

Start or rebuild the backend/model stack from the repository root:

```powershell
docker compose up -d --build
docker compose ps
```

Expected result: `bosancica-backend`, both Kraken containers and the AI
services are healthy; queue workers are normally simply `Up` while waiting for
jobs. The backend must be bound only to loopback:

```text
127.0.0.1:8001 -> 8001/tcp
```

Check it locally before configuring IIS:

```powershell
curl.exe -i http://127.0.0.1:8001/api/health
```

Expected response:

```json
{"service":"bosancica-backend","ok":true}
```

## 4. Public TLS certificate for the API

The API needs its own certificate because cPanel's certificate for
`bosancica.ai` lives on the cPanel server, while `api.bosancica.ai` terminates
TLS on IIS.

### Install win-acme

Download the 64-bit "pluggable" ZIP from the official win-acme release page,
extract it to `C:\tools\win-acme`, then open PowerShell **as Administrator**:

```powershell
cd C:\tools\win-acme
.\wacs.exe
```

### Request the certificate using manual DNS validation

Use the following choices in win-acme:

```text
M  Create certificate (full options)
2  Manual input
   api.bosancica.ai
Enter  accept the friendly name
4  Single certificate
6  DNS: create verification records manually
2  RSA key
4  Windows Certificate Store (Local Computer)
2  [My] Personal store
5  No additional store steps
1  Create or update bindings in IIS
3  Bosancica API
3  No additional installation step
n  use the default account for the scheduled task
```

When win-acme displays a DNS challenge, for example:

```text
Record:  _acme-challenge.api.bosancica.ai
Type:    TXT
Content: <token supplied by win-acme>
```

add it in cPanel Zone Editor:

```text
Name:   _acme-challenge.api
Type:   TXT
Value:  <exact token>
```

Do not manually add quote characters around the value. Verify it before
pressing Enter in win-acme:

```powershell
Resolve-DnsName -Type TXT _acme-challenge.api.bosancica.ai
```

After issuance, the certificate is visible in **IIS Manager -> server -> Server
Certificates**. It is issued by Let's Encrypt and is valid for roughly 90 days.

Manual DNS validation cannot renew unattended: create the new TXT challenge
again at renewal time, or later configure a DNS-provider API plugin for
win-acme. Remove the old challenge TXT record after issuance if it remains in
the zone.

## 5. IIS and ARR reverse proxy

Prerequisites: IIS, **Application Request Routing (ARR)** and **URL Rewrite**
must be installed on the Docker/IIS machine.

1. Open `inetmgr` as Administrator.
2. At the server level open **Application Request Routing Cache -> Server Proxy
   Settings** and enable proxy.
3. Create or use the `Bosancica API` IIS site and its separate application pool.
4. In that site, open **URL Rewrite -> Add Rule(s) -> Reverse Proxy** and use:

   ```text
   http://127.0.0.1:8001
   ```

5. Open **Sites -> Bosancica API -> Bindings...**. The final binding must be:

   ```text
   Type: https
   IP address: All Unassigned
   Port: 82
   Host name: api.bosancica.ai
   Require Server Name Indication: enabled
   SSL certificate: [Manual] api.bosancica.ai (or the current renewal)
   ```

win-acme may initially create a port 443 binding. Edit **only the Bosancica API
binding** and change its port to `82`; do not edit the NFFIS binding.

Test directly on the Windows machine:

```powershell
curl.exe -vk --resolve "api.bosancica.ai:82:127.0.0.1" "https://api.bosancica.ai:82/api/health"
```

The response must be `200 OK` and contain the backend health JSON. A header
such as `X-Powered-By: ARR/3.0` confirms IIS performed the proxying.

## 6. Windows Firewall and router forwarding

Open the IIS HTTPS port in Windows Firewall from Administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Bosancica API HTTPS (TCP 82)" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 82 -Profile Any
```

In router port-forward settings add this active rule, then click **Apply/Save**:

```text
Protocol:      TCP
External port: 82
Internal IP:   192.168.0.4
Internal port: 82
```

`192.168.0.1` is the router management page, not the forwarding target. Confirm
the Windows machine's current LAN address before relying on the rule:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -match '^192\.168\.0\.' }
```

The router's WAN/Internet IPv4 must match the API DNS record (`77.77.236.72`).
Addresses such as `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`, or
`100.64-127.x.x` on the WAN side indicate double NAT/CGNAT and require router
or ISP changes before forwarding can work.

Test from a phone using mobile data, not Wi-Fi:

```text
https://api.bosancica.ai:82/api/health
```

## 7. cPanel frontend deployment

The cPanel document root contains public build files only:

```text
<document-root>/
  redeploy.php
  .htaccess
  dist/
```

On its first run, `redeploy.php` clones the complete Git repository into a
sibling hidden source folder and builds there. For a document root such as
`/home/tagnetba/public_html/bosancica.ai`, its checkout is:

```text
/home/tagnetba/public_html/.bosancica-frontend-source
```

The checkout is not served by the `bosancica.ai` document root. The script then
publishes only the new `dist/` plus the root `.htaccess`.

### One-time setup

1. Upload `redeploy.php` and the root `.htaccess` from this repository to the
   cPanel document root.
2. Ensure cPanel has Git, Node.js 20+ and npm available. The script locates the
   standard cPanel/Alt Node locations automatically.
3. Open:

   ```text
   https://bosancica.ai/redeploy.php
   ```

### Every later frontend release

```text
1. Commit and push frontend changes to GitHub main.
2. Open https://bosancica.ai/redeploy.php.
3. Wait for “Bosancica frontend redeploy completed successfully”.
4. Hard-refresh the browser and test the application.
```

The script sets `VITE_API_BASE_URL` before `npm run build`, so a separate
frontend `.env.production` file is not needed on cPanel.

`redeploy.php` can execute Git and npm commands. Restrict access to it with
cPanel directory protection, an IP allow-list, or another authentication method
after the initial setup; it should not be a permanently public deployment
endpoint.

## 8. Final acceptance tests

1. Open `https://bosancica.ai` in a private window or use `Ctrl+F5`.
2. In browser Developer Tools -> Network, confirm browser API requests use:

   ```text
   https://api.bosancica.ai:82/api/...
   ```

3. Perform a real workflow such as upload/OCR, not just a page load.
4. Confirm the API CORS preflight when needed:

   ```powershell
   curl.exe -isS -X OPTIONS --resolve "api.bosancica.ai:82:127.0.0.1" `
     "https://api.bosancica.ai:82/api/health" `
     -H "Origin: https://bosancica.ai" `
     -H "Access-Control-Request-Method: GET"
   ```

   It must include `Access-Control-Allow-Origin: https://bosancica.ai`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `git pull`: not a Git repository on cPanel | Upload the current bootstrap-capable `redeploy.php`; it clones the source checkout on its first run. |
| `api.bosancica.ai:82` times out externally | Verify IIS listener, Windows Firewall, router rule, click router **Apply**, then verify router WAN IP equals DNS IP. |
| Health endpoint works locally but not externally | Test from mobile data. Local testing by public hostname may fail when the router has no NAT loopback. |
| Frontend works on mobile data but API times out on the same LAN | Enable router **NAT loopback/Hairpin NAT**, or add `192.168.0.4 api.bosancica.ai` to the local computer's hosts file. |
| Browser shows CORS error | Check `config/cors.php`, clear Laravel config cache/rebuild backend, and ensure the frontend origin is `https://bosancica.ai`. |
| Browser shows a certificate warning | Check the IIS binding hostname, port 82, SNI and certificate selection; the cPanel certificate does not cover the API host. |
| `npm` not found during cPanel redeploy | Enable/install Node.js 20+ in cPanel. |

