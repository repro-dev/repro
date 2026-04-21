type AdminEnv = {
  BUILD_ENV: 'development' | 'testing' | 'production'
  REPRO_WORKSPACE_URL: string
  REPRO_ADMIN_URL: string
  REPRO_API_URL: string
}

const defaultValues: AdminEnv = {
  BUILD_ENV: 'testing',
  REPRO_WORKSPACE_URL: 'http://workspace.test',
  REPRO_ADMIN_URL: 'http://admin.test',
  REPRO_API_URL: 'http://admin.test',
}

export function createDefaultEnv(overrides: Partial<AdminEnv> = {}) {
  return {
    ...defaultValues,
    ...overrides,
  }
}
