output "static_bucket_name" {
  value = scaleway_object_bucket.static_assets.name
}

output "registry_endpoint" {
  value = scaleway_registry_namespace.api.endpoint
}

output "registry_namespace_name" {
  value = scaleway_registry_namespace.api.name
}

output "api_container_id" {
  value = scaleway_container.api.id
}

output "api_container_name" {
  value = scaleway_container.api.name
}

output "api_container_domain" {
  value = scaleway_container.api.public_endpoint
}

output "api_url" {
  value = "https://${local.api_domain}"
}

output "workspace_static_url" {
  value = "https://${local.app_domain}"
}

output "admin_static_url" {
  value = "https://${local.admin_domain}"
}

output "marketing_static_url" {
  value = "https://${local.marketing_domain}"
}
