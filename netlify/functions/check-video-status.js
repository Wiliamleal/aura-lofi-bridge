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
  // CORS (versão debug - aceita localhost)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
  const origin = event.headers.origin || event.headers.Origin || '';
  
  // Para debug: aceitar qualquer localhost
  let corsOrigin = '*';
  if (origin && (origin.includes('localhost') || allowedOrigins.includes(origin))) {
    corsOrigin = origin;
  }
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, x-bridge-auth',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Autenticação
    const authToken = event.headers['x-bridge-auth'];
    if (!authToken || authToken !== process.env.BRIDGE_SECRET_KEY) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Token inválido' })
      };
    }

    // Extrair generationId do path
    const generationId = event.path.split('/').pop();
    
    if (!generationId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'generationId é obrigatório' })
      };
    }

    const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
    const statusUrl = `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`;

    const response = await axios.get(statusUrl, {
      headers: {
        'Authorization': buildBearerHeader(LEONARDO_API_KEY),
        'Accept': 'application/json'
      }
    });

    const generation = response.data.generations_by_pk;
    const status = generation?.status;

    let videoUrl = null;
    if (status === 'COMPLETE' && generation.generated_images?.length > 0) {
      videoUrl = generation.generated_images[0].motionMP4URL;
    }

    console.log(`📊 Status ${generationId}: ${status}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        status: status,
        videoUrl: videoUrl,
        data: generation
      })
    };

  } catch (error) {
    console.error('❌ Erro ao verificar status:', error);
    
    return {
      statusCode: error.response?.status || 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: error.response?.data?.error || error.message 
      })
    };
  }
};
