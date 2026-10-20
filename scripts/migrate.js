const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
    console.log('🔄 Starting Database Migration...');

    let connectionConfig = {};

    if (process.env.DATABASE_URL) {
        const isCloudHost = !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');
        const useSSL = process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && isCloudHost);

        connectionConfig = {
            uri: process.env.DATABASE_URL,
            multipleStatements: true,
            ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {})
        };
    } else {
        const host = process.env.DB_HOST || process.env.MYSQLHOST || 'localhost';
        const isCloudHost = host && !['localhost', '127.0.0.1'].includes(host);
        const useSSL = process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && isCloudHost);

        connectionConfig = {
            host: host,
            port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10) || 3306,
            user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
            password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
            database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'academic_resource_hub',
            multipleStatements: true,
            ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {})
        };
    }

    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    if (!fs.existsSync(schemaPath)) {
        console.error(`❌ schema.sql not found at ${schemaPath}`);
        process.exit(1);
    }

    let sql = fs.readFileSync(schemaPath, 'utf8');

    // Remove CREATE DATABASE and USE statements to allow running on cloud databases (Aiven, Railway, TiDB, etc.)
    sql = sql.replace(/CREATE\s+DATABASE[^;]+;/gi, '');
    sql = sql.replace(/USE\s+[^;]+;/gi, '');

    try {
        const connection = await mysql.createConnection(connectionConfig);
        console.log('✅ Connected to MySQL database successfully.');

        console.log('⏳ Executing schema and seeding initial data...');
        await connection.query(sql);

        console.log('🎉 Database migration & seeding completed successfully!');
        await connection.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
