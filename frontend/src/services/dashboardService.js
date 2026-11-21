import { apiClient } from './apiClient'

/**
 * Fetches the complete dashboard overview from the backend.
 * The backend aggregates all sources with partial-failure support.
 * @param {{ force?: boolean }} [options={}]
 * @returns {Promise<Object>} normalized dashboard overview
 */
export async function fetchDashboardOverview(options = {}) {
  const query = options?.force ? '?force=true' : ''
  return apiClient(`/api/dashboard/overview${query}`)
}
