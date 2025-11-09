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

    // Recebe o generationId de qualquer método (GET: query, POST: body)
    let generationId = null;
    if (event.httpMethod === 'GET') {
      generationId = (event.queryStringParameters || {}).generationId;
    } else if (event.httpMethod === 'POST') {
      try {
        const body = JSON.parse(event.body || '{}');
        generationId = body.generationId;
        // fallback: se não veio no body, tenta pegar da query
        if (!generationId) {
          generationId = (event.queryStringParameters || {}).generationId;
        }
      } catch (e) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid JSON', details: e.message })
        };
      }
    }
    // fallback final: tenta pegar da query mesmo se não for GET/POST
    if (!generationId) {
      generationId = (event.queryStringParameters || {}).generationId;
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

    // LOG DETALHADO DA RESPOSTA PARA DEBUG
    console.log('Leonardo API FULL RESPONSE:', JSON.stringify(response.data, null, 2));

    // Extrair status e URL do vídeo
    const generation = response.data.generations_by_pk || response.data;
    let status = generation?.status || 'processing';
    let videoUrl = null;
    if (generation?.generated_images?.length > 0) {
      // Prioriza motionMP4URL (vídeo)
      if (generation.generated_images[0].motionMP4URL) {
        videoUrl = generation.generated_images[0].motionMP4URL;
      } else if (generation.generated_images[0].video_url) {
        videoUrl = generation.generated_images[0].video_url;
      } else if (generation.generated_images[0].output_url && generation.generated_images[0].output_url.endsWith('.mp4')) {
        videoUrl = generation.generated_images[0].output_url;
      } else {
        // Não retorna imagem como videoUrl
        videoUrl = null;
      }
    }
    if (videoUrl) {
      status = 'completed';
    }

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
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message, details: error.response?.data, stack: error.stack })
    };
  }
};
