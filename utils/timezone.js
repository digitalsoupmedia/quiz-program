// Timezone utility functions for consistent date handling across the application
const moment = require('moment-timezone');

// Verify timezone data is loaded
if (!moment.tz.zone('Asia/Kolkata')) {
    console.error('Timezone data not loaded properly for Asia/Kolkata');
} else {
    console.log('Timezone data loaded successfully for Asia/Kolkata');
}

// Get application timezone from environment variable, default to Asia/Kolkata
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

/**
 * Create a timezone-aware date from date and time strings
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {string} timeString - Time in HH:MM format
 * @param {string} timezone - Timezone (optional, defaults to APP_TIMEZONE)
 * @returns {Date} Date object in the specified timezone
 */
function createTimezoneDate(dateString, timeString, timezone = APP_TIMEZONE) {
    const dateTimeString = `${dateString}T${timeString}:00`;
    
    console.log(`[Timezone] Debug before parsing:`, {
        input: dateTimeString,
        requestedTimezone: timezone,
        momentVersion: moment.version,
        availableZones: moment.tz.names().filter(z => z.includes('Kolkata')),
        zoneExists: !!moment.tz.zone(timezone)
    });
    
    // Try alternative approach if timezone data is missing
    if (!moment.tz.zone(timezone)) {
        console.warn(`[Timezone] Zone ${timezone} not found, falling back to manual offset`);
        // Asia/Kolkata is UTC+5:30
        const localDateTime = new Date(`${dateTimeString}+05:30`);
        console.log(`[Timezone] Fallback result:`, {
            input: dateTimeString,
            fallbackResult: localDateTime.toISOString()
        });
        return localDateTime;
    }
    
    // Use moment to parse with timezone awareness
    const momentDate = moment.tz(dateTimeString, timezone);
    
    // Get the actual timezone data for debugging
    const zone = moment.tz.zone(timezone);
    
    console.log(`[Timezone] Creating date:`, {
        input: dateTimeString,
        timezone: timezone,
        momentParsed: momentDate.format(),
        momentUtc: momentDate.clone().utc().format(), // Use clone() to avoid mutating original
        jsDate: momentDate.toDate(),
        jsDateIso: momentDate.toDate().toISOString(),
        timezoneOffset: momentDate.utcOffset(),
        timezoneOffsetMinutes: momentDate.utcOffset(),
        zoneName: momentDate.tz(),
        isDST: momentDate.isDST(),
        utcOffsetFormatted: momentDate.format('Z'),
        zoneData: zone ? {
            name: zone.name,
            offsets: zone.offsets,
            untils: zone.untils,
            currentOffset: zone.utcOffset(Date.now())
        } : 'Zone not found'
    });
    
    return momentDate.toDate();
}

/**
 * Convert a UTC date to the application timezone
 * @param {Date} utcDate - UTC date
 * @param {string} timezone - Target timezone (optional, defaults to APP_TIMEZONE)
 * @returns {moment.Moment} Moment object in the specified timezone
 */
function convertToTimezone(utcDate, timezone = APP_TIMEZONE) {
    return moment.utc(utcDate).tz(timezone);
}

/**
 * Get current time in the application timezone
 * @param {string} timezone - Timezone (optional, defaults to APP_TIMEZONE)
 * @returns {moment.Moment} Current moment in the specified timezone
 */
function nowInTimezone(timezone = APP_TIMEZONE) {
    return moment().tz(timezone);
}

/**
 * Format a date for display in the application timezone
 * @param {Date} date - Date to format
 * @param {string} format - Moment format string (optional, defaults to 'YYYY-MM-DD HH:mm:ss')
 * @param {string} timezone - Timezone (optional, defaults to APP_TIMEZONE)
 * @returns {string} Formatted date string
 */
function formatInTimezone(date, format = 'YYYY-MM-DD HH:mm:ss', timezone = APP_TIMEZONE) {
    return moment(date).tz(timezone).format(format);
}

/**
 * Get timezone offset information
 * @param {string} timezone - Timezone (optional, defaults to APP_TIMEZONE)
 * @returns {Object} Timezone information
 */
function getTimezoneInfo(timezone = APP_TIMEZONE) {
    const now = moment().tz(timezone);
    return {
        timezone: timezone,
        offset: now.format('Z'),
        offsetMinutes: now.utcOffset(),
        abbreviation: now.format('z'),
        isDST: now.isDST()
    };
}

module.exports = {
    APP_TIMEZONE,
    createTimezoneDate,
    convertToTimezone,
    nowInTimezone,
    formatInTimezone,
    getTimezoneInfo
};