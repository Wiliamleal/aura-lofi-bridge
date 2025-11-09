// netlify/functions/health.js
// Health check para verificar se as functions estão funcionando

exports.handler = async (event, context) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-bridge-auth',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed', method: event.httpMethod })
    };
  }

  try {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        status: 'ok',
        message: 'Bridge server ativo no Netlify',
        timestamp: new Date().toISOString(),
        environment: {
          hasLeonardoKey: !!process.env.LEONARDO_API_KEY,
          hasBridgeKey: !!process.env.BRIDGE_SECRET_KEY,
          hasAllowedOrigins: !!process.env.ALLOWED_ORIGINS
        },
        method: event.httpMethod
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        status: 'error',
        message: error.message,
        stack: error.stack
      })
    };
  }
};