/**
 * In-memory cache & request deduplication store for NSE / BSE market movers.
 */
class NseCache {
  constructor(ttlMs = 30000) {
    this.ttlMs = ttlMs;
    this.store = new Map();
    this.inFlightRequests = new Map();
  }

  /**
   * Get cached item if valid and not expired.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    const isExpired = Date.now() - entry.timestamp > this.ttlMs;
    return {
      data: entry.data,
      csv: entry.csv,
      timestamp: entry.timestamp,
      isStale: isExpired,
    };
  }

  /**
   * Set cache entry with timestamp.
   */
  set(key, data, csv = null) {
    this.store.set(key, {
      data,
      csv,
      timestamp: Date.now(),
    });
  }

  /**
   * Get active in-flight request Promise for deduplication.
   */
  getInFlight(key) {
    return this.inFlightRequests.get(key);
  }

  /**
   * Register in-flight request Promise.
   */
  setInFlight(key, promise) {
    this.inFlightRequests.set(key, promise);
  }

  /**
   * Clear in-flight request registration.
   */
  clearInFlight(key) {
    this.inFlightRequests.delete(key);
  }

  /**
   * Clear all store entries.
   */
  clear() {
    this.store.clear();
    this.inFlightRequests.clear();
  }
}

module.exports = new NseCache(30000); // 30-second TTL
