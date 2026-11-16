# Container images

The backend and frontend are built and published as independent OCI images:

- `ghcr.io/3035tech/30sales-back`
- `ghcr.io/3035tech/30sales-front`

Each project has its own Dockerfile and GitHub Actions matrix job. Pull requests build both images without publishing. Pushes build and publish both images for `linux/amd64` and `linux/arm64`; tags include the branch or release tag and the full commit SHA (`sha-…`). The workflow uses the repository `GITHUB_TOKEN` with `packages: write` only in the publish job.

The frontend image is static NGINX running unprivileged on port `8080`. It uses a relative API URL by default so an Ingress can route `/api` and `/api/auth` to the backend and all other paths to the frontend. Set `VITE_API_URL` as a build argument only if a separate API origin is intentionally chosen.

The backend listens on port `3000` by default and exposes `/health` for the image health check. Runtime configuration remains external to the image; use Kubernetes Secrets/ConfigMaps for the variables in `30sales-back/.env.example`. The container does not apply database migrations at startup.

GHCR packages may be private by default. Before Argo deploys them, grant the cluster an image pull credential with read access to both packages, or deliberately change package visibility. GitOps should reference the two image names separately and pin a commit SHA or image digest. Each project will have its own Argo CD Application and deployment lifecycle.

## Workflow

`.github/workflows/build-images.yml` builds on pull requests and publishes on pushes and version tags. It runs only when a project, its Docker build files, or the workflow changes.
