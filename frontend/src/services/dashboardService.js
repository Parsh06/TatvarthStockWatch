import { apiClient } from './apiClient'

/**
 * Fetches the complete dashboard overview from the backend.
 * The backend aggregates all sources with partial-failure support.
 * @returns {Promise<Object>} normalized dashboard overview
 */
export async function fetchDashboardOverview() {
  return apiClient('/api/dashboard/overview')
}
