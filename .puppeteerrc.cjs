const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Skip downloading Chrome during npm install in production
  skipDownload: process.env.NODE_ENV === 'production' || process.env.RENDER === 'true',

  // Use system Chrome if available in production
  executablePath: process.env.NODE_ENV === 'production'
    ? '/usr/bin/google-chrome-stable'
    : undefined,

  // Cache directory for development
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};