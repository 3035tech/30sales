# Container images

The backend and frontend are built and published as independent OCI images:

- `ghcr.io/3035tech/30sales-back`
- `ghcr.io/3035tech/30sales-front`

Each project has its own Dockerfile and workflow. `.github/workflows/build-back.yml` builds and publishes only the backend image; `.github/workflows/build-front.yml` does the same for the frontend. Pull requests build the affected image without publishing. Pushes publish for `linux/amd64` and `linux/arm64`; tags include the branch or release tag and the full commit SHA (`sha-…`). Workflows only need `packages: write` to publish.

The frontend image is static NGINX running unprivileged on port `8080`. It uses a relative API URL, so frontend and backend share `https://30sales.3035service.com`: `/` routes to the frontend and `/api` (including `/api/auth`) routes to the backend. This keeps browser requests same-origin and requires no `VITE_API_URL` build argument.

The backend listens on port `3000` and exposes `/health`. Runtime configuration remains external to the image; use the Kubernetes Secret `30sales-back-runtime` for the variables in `30sales-back/.env.example`, including database URL, Better Auth secret, Redis URL, SMTP, channel encryption key, and S3 bucket. The runtime image includes the versioned Drizzle migration journal and SQL files. Before listening for requests, `start:prod` applies pending migrations with the Drizzle runtime migrator; if the database is unavailable or a migration fails, the API does not start and Kubernetes keeps the pod unready. This prevents an empty database from appearing healthy while its schema is uninitialized. The current production deployment uses one backend replica; migrations must remain compatible with the previous application revision during a rolling update.

Better Auth uses Redis as shared secondary storage for sessions and keeps the database copy enabled. Redis is required in production and is connected through `REDIS_URL`; use a dedicated key prefix so this application's session keys remain isolated when Redis is shared. The backend checks the Redis connection before opening its HTTP listener and fails closed if Redis is unavailable.

## GitOps and image updates

Argo CD is managed from the separate `3035tech/gitops` repository. The two Applications live under `dublin/30sales-back` and `dublin/30sales-front`; `dublin/kustomization.yaml` includes both, following the existing app-of-apps pattern. Each Application uses the shared `charts/backend` Helm chart and deploys independently into the `apps` namespace. The chart uses the shared `github-app-auth-token` image pull secret.

When a commit reaches `main`, each workflow builds and publishes only its own image with `main` and immutable `sha-…` tags. Argo Image Updater tracks the `main` tag for each separate Application, resolves its digest, and writes the update back to that Application. CI does not commit deployment manifests into the application repository.

The back-end Application routes `/api` to `sales30-back:3000`; the front-end Application routes `/` to `sales30-front:8080` under the same hostname. The backend probes `/health`; a pod only becomes ready after pending Drizzle migrations complete and the API starts.
