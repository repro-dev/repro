# Scaleway Terraform bootstrap

This directory provisions the shared Scaleway infrastructure used by CI/CD.

## Files

- `backend.tf` — remote state backend declaration
- `backends/*.hcl.example` — sample backend configs for state stored in Scaleway Object Storage
- `env/*.tfvars` — per-environment inputs for staging and production

## Bootstrap

1. Copy one backend example to a real file:
   - `terraform/backends/staging.hcl.example` → `terraform/backends/staging.hcl`
   - `terraform/backends/production.hcl.example` → `terraform/backends/production.hcl`
2. Fill in the backend bucket and the Scaleway credentials for state access.
3. Initialize Terraform:
   - `terraform -chdir=terraform init -backend-config=backends/staging.hcl`
4. Apply the matching environment variables:
   - `terraform -chdir=terraform apply -var-file=env/staging.tfvars`

Provide the sensitive values separately with `TF_VAR_database_password`, `TF_VAR_scw_access_key`, `TF_VAR_scw_secret_key`, `TF_VAR_scw_project_id`, and `TF_VAR_scw_organization_id` (or an uncommitted var file).

Repeat with the production files for the production environment.

## CI mapping

Use the outputs from `terraform output` to populate GitHub Actions secrets:

- `SCW_STATIC_BUCKET_NAME` → `static_bucket_name`
- `CONTAINER_REGISTRY_ENDPOINT` → `registry_endpoint`
- `CONTAINER_REGISTRY_USERNAME` → Scaleway registry username
- `CONTAINER_REGISTRY_PASSWORD` → Scaleway registry password
- `SCW_API_CONTAINER_ID` → `api_container_id`
- `SCW_REGION` GitHub variable → the Scaleway region, usually `fr-par`
- `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` / `SCW_DEFAULT_PROJECT_ID` / `SCW_DEFAULT_ORGANIZATION_ID` → provider credentials

The `api_url`, `workspace_static_url`, `admin_static_url`, and `marketing_static_url` outputs are the canonical deployment URLs for CI and release notes.
`api_container_domain` is the native Scaleway domain used as the DNS target for `api.${base_domain}`.

## Operational notes

### Container image tag drift

`terraform/main.tf` sets `registry_image` on the api-server container to `.../repro:latest` as a bootstrap placeholder. CI owns the running image tag: the `containerize` job pushes `.../repro:${GITHUB_SHA}` and `deploy-api-server` calls `scw container container update --registry-image <SHA>` on every merge to main. Terraform manages the container *definition* (CPU, memory, scaling, port, domain) while CI is the source of truth for `registry_image`. Re-running `terraform apply` resets the image tag to `latest`; this is expected and harmless because the next deploy overwrites it. The container is created with `deploy = false` so terraform never serves traffic directly.

### Database password

The PostgreSQL password is set directly on `scaleway_rdb_instance.api` via `password_wo`. Scaleway Secret Manager adoption (storing the password in `scaleway_secret` and reading it from the api-server container) is tracked in REP-1461; until then the RDB-managed password is the sole secret store. Terraform validation in CI (`fmt -check` + `validate`) is tracked in REP-1462.
