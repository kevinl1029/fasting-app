require('dotenv').config();

const usePostgres = !!process.env.DATABASE_URL;

if (usePostgres) {
  console.log('Using PostgreSQL database');
  module.exports = require('./pg-db');
} else {
  console.log('Using SQLite database');
  module.exports = require('./db');
}
