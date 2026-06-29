# Redis development setup on Windows

TME uses Redis 7 inside the existing Ubuntu WSL2 distribution.

## Installed service

- Package: Ubuntu `redis-server`
- Version verified: Redis 7.0.15
- Service: `redis-server.service`
- Startup: enabled through systemd
- Persistence: append-only file enabled
- Networking: bound inside WSL with password authentication

## Starting the backend

Use:

```powershell
npm run dev:backend
```

The startup script:

1. starts the WSL Redis service;
2. discovers the current WSL address;
3. keeps the WSL VM alive for the backend process lifetime;
4. reads the local ignored Redis password;
5. injects `REDIS_URL`;
6. starts NestJS with the BullMQ driver.

The local command performs a clean backend build before launching the verified
compiled entry point. Automatic source watching is intentionally disabled
until the monorepo build output is split into independently built packages.

This is required because this Windows installation does not reliably forward
WSL localhost ports, and the WSL address can change after reboot.

## Manual checks

```powershell
wsl -d Ubuntu -u root -- systemctl status redis-server
wsl -d Ubuntu -- redis-cli -a <password> ping
```

The expected response is `PONG`.

Production deployments use the Redis container or a managed Redis-compatible
service and do not use the WSL discovery script.
