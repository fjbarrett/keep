# Operating Keep on Proxmox

The web app runs in LXC 113 behind a Cloudflare Tunnel in the same container.
Postgres runs in VM 101. The application uses TLS with certificate and hostname
verification; the database address is configured statically in the VM and its
cloud-init settings. A VM address is not a router DHCP reservation: keep that
address outside the router's allocation pool.

## Runtime and release layout

- `/opt/keep/releases/<commit>`: root-owned, immutable application releases.
- `/opt/keep/current`: active release symlink.
- `/opt/keep/previous-release`: previous release path for rollback.
- `/etc/keep/keep.env`: root-only runtime environment, loaded by systemd.
- `/etc/keep/postgres-ca.pem`: the database's public CA certificate.
- `/var/cache/keep/<commit>`: the only writable application directory.
- `/var/lib/keep-build/<commit>`: temporary build directory, removed on failure.

`keep.service` runs as `keep`, with a 1 GiB memory limit and a read-only system
view. Next listens on `127.0.0.1:3000`; cloudflared is the only ingress. Set
`TRUST_PROXY=cloudflare` only with this topology. Never expose port 3000 on the
LAN while trusting that header.

The `keep-build` account receives a placeholder signing secret for compilation,
without database, mail, OAuth, storage, or production signing credentials.
Each release gets a clean install, tests, TypeScript, production audit, and build.
The build has a 2 GiB limit; provision at least 3 GiB for this container so the
current app can continue serving during a build. Build-tool advisories are
visible in install output; the production audit blocks high/critical advisories.

## Provisioning

Use Ubuntu 24.04, Node 22, npm 11.6, and systemd. Create system users `keep` and
`keep-build`, with no login shells. Create `/etc/keep`, `/var/cache/keep`, and
`/opt/keep/releases` as root-owned directories. Put the runtime environment in
`/etc/keep/keep.env` with mode 0600. Install these root-owned files:

| Repository file | Destination | Mode |
| --- | --- | --- |
| `ops/keep.service` | `/etc/systemd/system/keep.service` | 0644 |
| `ops/build-release` | `/usr/local/sbin/keep-build-release` | 0700 |
| `ops/activate-release` | `/usr/local/sbin/keep-activate-release` | 0700 |

Verify the database certificate fingerprint through the Proxmox console before
installing the public certificate. Use a `DATABASE_URL` hostname that matches
its SAN, `sslmode=verify-full`, and `DATABASE_CA_CERT` pointing at the certificate.
An `/etc/hosts` alias is suitable for this private fixed-address deployment.
Do not copy runtime environment files into release directories.

## Deploy and roll back

Run the local verification gates before selecting a revision. With operator
authorization and SSH access to the application container:

```bash
KEEP_HOST=root@<application-host> scripts/deploy.sh <commit>
```

The command uploads a local Git archive, builds it as `keep-build`, and starts
the candidate on loopback port 3001. It expects `/` to return 200, `/api/notes`
to return 401, and an unknown share to return 404 after reaching Postgres. Only
then does it atomically replace `current` and restart Keep. Failed activation
restores the previous symlink and restarts that release. An initial installation
has no previous release; retain a known working release before routine upgrades.

For an explicit rollback, read `previous-release`, inspect its `RELEASE` file,
then run `keep-activate-release <previous-commit>` as root. Database changes must
remain compatible with both releases. This release adds columns, indexes and
quota/reference triggers; rolling back app code does not remove those controls.
The native Google handoff also requires the matching updated native clients.

Previously served static chunks and versioned PDF workers remain in the next
release for open tabs. Keep the current and previous releases; prune older
release/cache directories during maintenance after checking disk usage. Release
retention does not replace database backups.

## CI isolation

The prepared CI container is LXC 114. It has no database or application secrets.
`ops/runner.nft` allows DHCP, DNS through the configured resolver, public HTTP(S),
NTP, and SSH to the application host; other private-network traffic is blocked.
Load and verify the rules before starting a runner. The firewall belongs to this
dedicated container and replaces its ruleset, never the Proxmox host's rules.

Install `runner-deploy` as root-owned `/usr/local/sbin/deploy-keep` there. Its
SSH identity and independently verified host key live under root-only
`/etc/keep-ci/`. Grant `github-runner` sudo access to that exact command with
no arguments. On the application host, a `keep-deploy` account has a root-owned
authorized key with `restrict` and a forced `sudo -n keep-deploy-main` command;
its sudo rule also allows no arguments. Install `deploy-main` at that absolute
path. The caller cannot upload artifacts, select a revision, or get a shell.

The production command selects main from the root-owned repository, reruns the
release gates, and refuses to replace a newer/manual deployment with old main.
Repeated requests are limited to one per ten minutes. A manually deployed local
revision must be published unchanged on main before automatic deployment can
advance it. Squashing that revision into a different SHA requires an explicit
operator deployment of the new main commit.

Runner activation and GitHub publishing require explicit session authorization.
Outside contributors still require workflow approval. A persistent isolated
runner is not an ephemeral runner; rebuild its container if runner integrity is
uncertain. Never restore a runner into the production container.

## Operational checks

Check `systemctl status keep cloudflared`, `journalctl -u keep`, the active
`RELEASE`, public apex/www responses, and a database-backed share route. Check
the database remains primary, a write/read transaction can roll back, and a wrong
TLS hostname is rejected. Do not log connection strings or cookie values.

Keep scheduled encrypted database backups and container backups. Check the
actual backup job and periodically restore into an isolated environment; archive
integrity alone does not prove application-level recovery. Before retiring an
old database, verify every dependent app has migrated and retain a final backup.
