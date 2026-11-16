# Container images

The backend and frontend are built and published as independent OCI images:

- `ghcr.io/3035tech/30sales-back`
- `ghcr.io/3035tech/30sales-front`

Each project has its own Dockerfile and workflow. `.github/workflows/build-back.yml` builds and publishes only the backend image; `.github/workflows/build-front.yml` does the same for the frontend. Pull requests build the affected image without publishing. Pushes publish for `linux/amd64` and `linux/arm64`; tags include the branch or release tag and the full commit SHA (`sha-…`). Each workflow uses the repository `GITHUB_TOKEN` with `packages: write` only in its publish job.

The frontend image is static NGINX running unprivileged on port `8080`. It uses a relative API URL by default so an Ingress can route `/api` and `/api/auth` to the backend and all other paths to the frontend. Set `VITE_API_URL` as a build argument only if a separate API origin is intentionally chosen.

The backend listens on port `3000` by default and exposes `/health` for the image health check. Runtime configuration remains external to the image; use Kubernetes Secrets/ConfigMaps for the variables in `30sales-back/.env.example`. The container does not apply database migrations at startup.

GHCR packages may be private by default. The Kubernetes namespace needs an `ghcr-pull` image pull secret with read access to both packages. The backend also needs a `30sales-backend-runtime` Secret with its runtime configuration. Do not commit either Secret.

## GitOps and promotion

`gitops/argocd/root-application.yaml` is the bootstrap Argo CD Application. It tracks `main` and reconciles the two child Application definitions from `gitops/argocd/apps/`. The child Applications point independently to `gitops/backend/` and `gitops/frontend/`, each with its own Deployment, Service and Kustomize image reference. Child sync is manual so an image promotion does not deploy code before its runtime secrets, ingress and database migrations are ready.

When a commit reaches `main`, each workflow publishes its own image with an immutable `sha-…` tag and updates only that component's `newTag` in GitOps. The GitOps change is committed back to `main`; Argo detects the changed desired state. Backend and frontend can therefore be promoted and synced independently. The namespace is `30sales`; both deployments expect the private image pull secret `ghcr-pull`.

Bootstrap once with the Argo CD CLI or UI after the Argo CD server and repository access are configured:

```sh
argocd app create 30sales-apps \
  --file gitops/argocd/root-application.yaml \
  --upsert
```

The root Application creates/updates the two child Applications. Sync the backend and frontend child Applications separately when prerequisites are ready. Add the environment-specific Ingress outside these generic manifests: route `/api` and `/api/auth` to `30sales-back:3000`, and other paths to `30sales-front:80`. Set `BETTER_AUTH_URL` and `FRONTEND_URL` to the real public origin. Apply pending Drizzle migrations through the approved operational process before syncing a backend release that requires them; the image never runs migrations at startup.
