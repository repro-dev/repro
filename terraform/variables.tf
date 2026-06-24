variable "environment" {
  type        = string
  description = "Deployment environment name (staging or production)."
}

variable "base_domain" {
  type        = string
  description = "Primary DNS zone for the environment, such as reproqa.dev or repro.dev."
}

variable "static_origin_target" {
  type        = string
  description = "DNS target for static app records."
}

variable "api_image_name" {
  type        = string
  description = "Container Registry image name for api-server."
  default     = "repro"
}

variable "api_image_tag" {
  type        = string
  description = "Container image tag used by the api-server deployment."
  default     = "latest"
}

variable "api_container_port" {
  type        = number
  description = "Container port exposed by api-server."
  default     = 3000
}

variable "api_cpu_limit" {
  type        = number
  description = "CPU limit in millicores for api-server."
  default     = 1000
}

variable "api_memory_limit" {
  type        = number
  description = "Memory limit in megabytes for api-server."
  default     = 1024
}

variable "api_timeout" {
  type        = number
  description = "Request timeout in seconds for api-server."
  default     = 300
}

variable "api_min_scale" {
  type        = number
  description = "Minimum number of api-server instances."
  default     = 0
}

variable "api_max_scale" {
  type        = number
  description = "Maximum number of api-server instances."
  default     = 1
}

variable "rdb_node_type" {
  type        = string
  description = "Scaleway RDB node type for PostgreSQL 17."
}

variable "rdb_volume_size_gb" {
  type        = number
  description = "RDB storage volume size in GiB."
  default     = 20
}

variable "rdb_is_ha_cluster" {
  type        = bool
  description = "Enable PostgreSQL HA cluster. Requires a production-tier node type; dev-tier nodes do not support HA."
  default     = false
}

variable "database_name" {
  type        = string
  description = "Default database name for api-server."
  default     = "repro"
}

variable "database_user" {
  type        = string
  description = "Database user name for api-server."
  default     = "repro"
}

variable "database_password" {
  type        = string
  description = "Database password stored in Secret Manager and used for the RDB user."
  sensitive   = true
}

variable "scw_access_key" {
  type        = string
  description = "Scaleway access key used by the provider and backend bootstrap."
  sensitive   = true
}

variable "scw_secret_key" {
  type        = string
  description = "Scaleway secret key used by the provider and backend bootstrap."
  sensitive   = true
}

variable "scw_project_id" {
  type        = string
  description = "Scaleway project ID for the target environment."
}

variable "scw_organization_id" {
  type        = string
  description = "Scaleway organization ID for the target environment."
}

variable "region" {
  type        = string
  description = "Scaleway region used by the environment."
  default     = "fr-par"
}

variable "zone" {
  type        = string
  description = "Scaleway zone used by the environment."
  default     = "fr-par-1"
}

variable "static_bucket_name" {
  type        = string
  description = "Optional override for the static asset bucket name."
  default     = ""
}

variable "registry_namespace_name" {
  type        = string
  description = "Optional override for the Container Registry namespace name."
  default     = ""
}

variable "container_namespace_name" {
  type        = string
  description = "Optional override for the serverless container namespace name."
  default     = ""
}

variable "container_name" {
  type        = string
  description = "Optional override for the api-server container name."
  default     = ""
}

variable "rdb_instance_name" {
  type        = string
  description = "Optional override for the PostgreSQL instance name."
  default     = ""
}

variable "marketing_domain" {
  type        = string
  description = "Optional override for the marketing site URL."
  default     = ""
}
