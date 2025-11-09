// netlify/functions/generate-video-bridge.js
// Netlify Serverless Function para geração de vídeo Leonardo AI

const axios = require('axios');
const FormData = require('form-data');

// Helper para construir header Bearer
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

// Rate limiting simples (em memória)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minuto
const MAX_REQUESTS = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }
  
  // Limpar timestamps antigos
  const timestamps = requestCounts.get(ip).filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (timestamps.length >= MAX_REQUESTS) {
    return false; // Rate limit excedido
  }
  
  timestamps.push(now);
  requestCounts.set(ip, timestamps);
  return true;
}

// Handler principal da Netlify Function
exports.handler = async (event, context) => {
  // Configurar CORS (versão debug - aceita localhost)
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

  // LOG: Corpo recebido para debug
  try {
    const debugBody = JSON.parse(event.body || '{}');
    console.log('🪵 [DEBUG] Corpo recebido:', debugBody);
  } catch (e) {
    console.log('🪵 [DEBUG] Erro ao parsear body:', e);
  }

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // Apenas POST permitido
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // 1. Autenticação
    const authToken = event.headers['x-bridge-auth'];
    const BRIDGE_SECRET_KEY = process.env.BRIDGE_SECRET_KEY;
    
    if (!authToken || authToken !== BRIDGE_SECRET_KEY) {
      console.warn('⚠️  Tentativa de acesso não autorizado');
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Token de autenticação inválido ou ausente' })
      };
    }

    // 2. Rate Limiting
    const clientIp = event.headers['x-forwarded-for']?.split(',')[0] || 
                     event.headers['client-ip'] || 
                     context.ip || 
                     'unknown';
    
    if (!checkRateLimit(clientIp)) {
      console.warn(`🚫 Rate limit excedido para IP: ${clientIp}`);
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Muitas requisições. Aguarde 1 minuto.' })
      };
    }

    // 3. Processar requisição
    let parsedBody = {};
    try {
      parsedBody = JSON.parse(event.body || '{}');
    } catch (e) {
      console.log('🪵 [DEBUG] Erro ao parsear body:', e);
    }
    const image_base64 = parsedBody.image_base64;
    const ext = parsedBody.ext;
  // Aceitar motionStrength se vier, senão usar 5
  const motionStrength = typeof parsedBody.motionStrength === 'number' ? parsedBody.motionStrength : 5;
  // Prompt obrigatório para API Leonardo
  // MOTION2 não exige prompt

    if (!image_base64 || !ext) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'image_base64 e ext são obrigatórios' })
      };
    }

    const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
    if (!LEONARDO_API_KEY) {
      throw new Error('LEONARDO_API_KEY não configurada');
    }

    console.log('📥 Nova requisição de geração de vídeo (Netlify Function)');

    // ===== PASSO 1: Init Image Upload =====
    const buffer = Buffer.from(image_base64, 'base64');
    console.log(`✅ Buffer criado: ${buffer.length} bytes`);

    const initResponse = await axios.post(
      'https://cloud.leonardo.ai/api/rest/v1/init-image',
      { extension: ext },
      {
        headers: {
          'Authorization': buildBearerHeader(LEONARDO_API_KEY),
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    const uploadData = initResponse.data.uploadInitImage;
    const imageId = uploadData.id;
    const uploadUrl = uploadData.url;
    const uploadFields = JSON.parse(uploadData.fields);

    console.log(`✅ Init upload: ImageId ${imageId}`);

    // ===== PASSO 2: Upload S3 =====
    const formData = new FormData();
    
    Object.entries(uploadFields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append('file', buffer, {
      filename: `${imageId}.${ext}`,
      contentType: uploadFields['Content-Type']
    });

    await axios.post(uploadUrl, formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    console.log(`✅ Upload S3 concluído: ${imageId}`);

    // ===== PASSO 3: Gerar Vídeo com VEO3 =====
    const videoPayload = {
      imageId: imageId,
      imageType: "UPLOADED",
      endFrameImage: { type: "UPLOADED" },
      model: "MOTION2",
      resolution: "RESOLUTION_1080"
    };

    console.log('🎬 Iniciando geração de vídeo VEO3...');

    const videoResponse = await axios.post(
      'https://cloud.leonardo.ai/api/rest/v1/generations-image-to-video',
      videoPayload,
      {
        headers: {
          'Authorization': buildBearerHeader(LEONARDO_API_KEY),
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    const generationId = videoResponse.data.imageToVideoMotionJob?.generationId;
    
    if (!generationId) {
      throw new Error('GenerationId não retornado pela API');
    }

    console.log(`✅ Vídeo iniciado: ${generationId}`);

    // Retornar sucesso
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        generationId: generationId,
        message: 'Vídeo em processamento',
        imageId: imageId,
        motionStrength: motionStrength
      })
    };

  } catch (error) {
    console.error('❌ Erro na Netlify Function:', error);
    
    let errorMessage = 'Erro desconhecido';
    let statusCode = 500;
    
    if (error.response) {
      errorMessage = error.response.data?.error || error.response.statusText;
      statusCode = error.response.status;
      console.error('Detalhes do erro:', error.response.data);
    } else {
      errorMessage = error.message;
    }

    return {
      statusCode: statusCode,
      headers: corsHeaders,
      body: JSON.stringify({ error: errorMessage })
    };
  }
};
