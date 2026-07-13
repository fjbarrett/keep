# Security

## Reporting a vulnerability

Please use a private [GitHub security advisory](https://github.com/fjbarrett/keep/security/advisories/new).
Include the affected route or client, reproduction steps, and likely impact. Do
not put credentials, private notes, or an unpatched exploit in a public issue.

## Deployment checklist

- Set a strong `AUTH_SECRET` and the exact HTTPS `AUTH_URL`.
- Keep Postgres on a private network. TLS verifies system CAs by default; use
  `DATABASE_CA_CERT` for a private CA. `DATABASE_TLS_INSECURE=true` is only for
  loopback development with `sslmode=no-verify`.
- Keep attachment storage private. S3 deployments should enable Block Public
  Access and grant the application only object read/write/delete permissions
  under the `keep/` prefix.
- Set `DEPLOY_KNOWN_HOSTS` to a separately verified SSH host-key line. Deployment
  fails closed when the host key changes.
- Leave `AI_METADATA_ENABLED=false` unless sending authenticated note text to
  Anthropic is acceptable and disclosed to users. Provider and account budgets
  should also be configured outside the application.
- Back up Postgres and object storage with encryption at rest and tested restore
  procedures. Restrict production logs and database access to operators who need
  them.

## Data boundaries

Keep is not end-to-end encrypted. The server can read note content. Signed-in
web clients keep account-scoped offline copies in IndexedDB until explicit
sign-out or site-data removal; guest notes remain in localStorage. Native
Spotlight integration indexes titles, summaries, and tags, but not note bodies.

Public shares are bearer links. Random links carry 128 bits of entropy; vanity
links are public names with a 16-character minimum. Revocation stops page,
download, and attachment access immediately.

## Upgrade note for public attachments

Releases before the private-upload change wrote attachments with public-read
storage permissions and embedded their provider URLs in notes. New uploads are
private and use `/api/uploads/<id>`. Operators upgrading an existing deployment
should inventory old `keep/` objects, remove public ACLs after deciding how to
handle legacy note links, and delete unreferenced public objects.
