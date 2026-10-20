const dotenv = require('dotenv');
const sqliteAdapter = require('./sqliteDb');

dotenv.config();

const dbClient = (process.env.DB_CLIENT || 'sqlite').toLowerCase();

if (dbClient === 'mysql' && (process.env.DATABASE_URL || process.env.DB_HOST)) {
    const mysql = require('mysql2/promise');
    let poolConfig = {};

    if (process.env.DATABASE_URL) {
        const isCloudHost = !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');
        const useSSL = process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && isCloudHost);

        poolConfig = {
            uri: process.env.DATABASE_URL,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            decimalNumbers: true,
            ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {})
        };
    } else {
        const host = process.env.DB_HOST || process.env.MYSQLHOST || 'localhost';
        const isCloudHost = host && !['localhost', '127.0.0.1'].includes(host);
        const useSSL = process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && isCloudHost);

        poolConfig = {
            host: host,
            port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10) || 3306,
            user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
            password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
            database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'academic_resource_hub',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            decimalNumbers: true,
            ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {})
        };
    }

    const pool = mysql.createPool(poolConfig);
    console.log('🔌 Connected to MySQL Database Pool.');
    module.exports = pool;
} else {
    console.log('⚡ Active Database Engine: SQLite (Embedded & Netlify-Ready)');
    module.exports = sqliteAdapter;
}
