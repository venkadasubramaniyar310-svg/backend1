const serverless = require('serverless-http');

// Set serverless runtime flags
process.env.NETLIFY = 'true';
process.env.DB_CLIENT = 'sqlite';

const app = require('../../server');

const handler = serverless(app);

exports.handler = async (event, context) => {
    // Prevent Lambda container freeze
    context.callbackWaitsForEmptyEventLoop = false;

    // Preflight OPTIONS handler
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Origin, Accept',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
            },
            body: ''
        };
    }

    try {
        return await handler(event, context);
    } catch (error) {
        console.error('Netlify Backend API error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Internal Netlify Serverless API Error',
                message: error.message
            })
        };
    }
};
