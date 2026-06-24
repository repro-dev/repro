environment = "production"
base_domain = "repro.dev"

static_origin_target = "static.repro.dev."

# Considerations: DB-DEV-M is the minimum dev-tier node acceptable for production bootstrap.
# Upgrade to a production-tier node (DB-M/DB-L) and set rdb_is_ha_cluster=true before production traffic.
# api_min_scale=1 keeps a warm api-server instance to avoid Scaleway Serverless cold-start latency.
rdb_node_type = "DB-DEV-M"
api_min_scale = 1

# Supply secrets at apply time via TF_VAR_* or a local, uncommitted var file.
# database_password = "..."
# scw_access_key = "..."
# scw_secret_key = "..."
# scw_project_id = "..."
# scw_organization_id = "..."
