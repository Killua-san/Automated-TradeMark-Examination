/**
 * Normalizes a string description by converting it to lowercase and trimming whitespace.
 * Handles null or undefined inputs gracefully by treating them as empty strings.
 *
 * @param {string|null|undefined} desc - The description string to normalize.
 * @returns {string} The normalized string.
 */
export const normalizeDescription = (desc) => (desc || '').toLowerCase().trim();

// Add other string utility functions here as needed
