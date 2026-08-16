'use strict';

const { compileBlockedFilter, shouldNotify: libShouldNotify } = require('../notificationFilter');

/**
 * Pure, deterministic, side-effect-free notification filter.
 * No DB or network calls.
 *
 * @param {object} params
 * @param {object} params.announcement
 * @param {object} params.classification
 * @param {object} params.preferences
 * @param {string} [params.channel='push']
 * @returns {{ shouldNotify: boolean, reason: string }}
 */
function evaluateNotificationFilter({ announcement, classification, preferences, channel = 'push' }) {
  // FAIL CLOSED POLICY: If preferences fail to load or are invalid, DO NOT send notifications.
  if (!preferences || typeof preferences !== 'object') {
    return { shouldNotify: false, reason: 'PREFERENCES_UNAVAILABLE_FAIL_CLOSED' };
  }

  // Check channel enablement
  if (channel === 'push' && preferences.pushEnabled === false) {
    return { shouldNotify: false, reason: 'PUSH_DISABLED_BY_USER' };
  }
  if (channel === 'telegram' && preferences.telegramEnabled === false) {
    return { shouldNotify: false, reason: 'TELEGRAM_DISABLED_BY_USER' };
  }

  // Compile filter and evaluate via notificationFilter.js logic
  const compiledFilter = compileBlockedFilter(preferences.blockedCategories || []);
  return libShouldNotify({
    compiledFilter,
    classification,
    announcement,
    notificationChannel: channel,
  });
}

module.exports = {
  evaluateNotificationFilter,
};
