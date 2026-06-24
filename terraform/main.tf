locals {
  resource_prefix = "repro-${var.environment}"

  static_bucket_name       = var.static_bucket_name != "" ? var.static_bucket_name : "${local.resource_prefix}-static-assets"
  registry_namespace_name  = var.registry_namespace_name != "" ? var.registry_namespace_name : "${local.resource_prefix}-registry"
  container_namespace_name = var.container_namespace_name != "" ? var.container_namespace_name : "${local.resource_prefix}-api"
  container_name           = var.container_name != "" ? var.container_name : "api-server"
  rdb_instance_name        = var.rdb_instance_name != "" ? var.rdb_instance_name : "${local.resource_prefix}-postgres"

  app_domain       = "app.${var.base_domain}"
  admin_domain     = "admin.${var.base_domain}"
  api_domain       = "api.${var.base_domain}"
  marketing_domain = var.marketing_domain != "" ? var.marketing_domain : var.base_domain

}

resource "scaleway_object_bucket" "static_assets" {
  name       = local.static_bucket_name
  region     = var.region
  project_id = var.scw_project_id
}

resource "scaleway_registry_namespace" "api" {
  name       = local.registry_namespace_name
  project_id = var.scw_project_id
  region     = var.region
}

resource "scaleway_rdb_instance" "api" {
  name              = local.rdb_instance_name
  node_type         = var.rdb_node_type
  engine            = "PostgreSQL-17"
  is_ha_cluster     = var.rdb_is_ha_cluster
  disable_backup    = false
  volume_type       = "bssd"
  volume_size_in_gb = var.rdb_volume_size_gb
  user_name           = var.database_user
  password_wo         = var.database_password
  password_wo_version = 1
  project_id          = var.scw_project_id
  region              = var.region
}

resource "scaleway_rdb_database" "api" {
  instance_id = scaleway_rdb_instance.api.id
  name        = var.database_name
}

resource "scaleway_container_namespace" "api" {
  name       = local.container_namespace_name
  project_id = var.scw_project_id
  region     = var.region
}

resource "scaleway_container" "api" {
  namespace_id   = scaleway_container_namespace.api.id
  name           = local.container_name
  description    = "api-server container for ${var.environment}"
  registry_image = "${scaleway_registry_namespace.api.endpoint}/${var.api_image_name}:${var.api_image_tag}"
  port           = var.api_container_port
  cpu_limit      = var.api_cpu_limit
  memory_limit   = var.api_memory_limit
  timeout        = var.api_timeout
  min_scale      = var.api_min_scale
  max_scale      = var.api_max_scale
  privacy        = "private"
  deploy         = false
}

resource "scaleway_container_domain" "api" {
  container_id = scaleway_container.api.id
  hostname     = local.api_domain
  region       = var.region
}

resource "scaleway_domain_record" "app" {
  dns_zone = var.base_domain
  name     = "app"
  type     = "CNAME"
  data     = var.static_origin_target
  ttl      = 3600
}

resource "scaleway_domain_record" "admin" {
  dns_zone = var.base_domain
  name     = "admin"
  type     = "CNAME"
  data     = var.static_origin_target
  ttl      = 3600
}

resource "scaleway_domain_record" "api" {
  dns_zone = var.base_domain
  name     = "api"
  type     = "CNAME"
  data     = "${scaleway_container.api.domain_name}."
  ttl      = 3600
}
