// netlify/functions/check-video-status.js
// Netlify Function para verificar status de geração de vídeo

const axios = require('axios');

function buildBearerHeader(rawKey) {
  if (!rawKey) return '';
  let key = String(rawKey)
    .replace(/[\r\n\t]/g, '')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '');
  key = key.replace(/^Bearer\s+/i, '');
  return `Bearer ${key}`;
}

exports.handler = async (event, context) => {
  // CORS universal
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
  const origin = event.headers.origin || event.headers.Origin || '';
  let corsOrigin = '*';
  if (origin && (origin.includes('localhost') || allowedOrigins.includes(origin))) {
    corsOrigin = origin;
  }
  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, x-bridge-auth',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed', method: event.httpMethod })
    };
  }

  try {
    // Autenticação
    const authToken = event.headers['x-bridge-auth'];
    if (!authToken || authToken !== process.env.BRIDGE_SECRET_KEY) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized', message: 'Token inválido ou ausente.' })
      };
    }

    // Recebe o generationId
    let generationId = null;
    if (event.httpMethod === 'GET') {
      generationId = (event.queryStringParameters || {}).generationId;
    } else if (event.httpMethod === 'POST') {
      try {
        const body = JSON.parse(event.body || '{}');
        generationId = body.generationId;
      } catch (e) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid JSON', details: e.message })
        };
      }
    }
    if (!generationId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'generationId é obrigatório' })
      };
    }

    // Chama API Leonardo
    const url = `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: buildBearerHeader(process.env.LEONARDO_API_KEY)
      }
    });
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        status: 'ok',
        data: response.data,
        method: event.httpMethod,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message, details: error.response?.data, stack: error.stack })
    };
  }
};
