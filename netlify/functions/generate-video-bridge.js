// netlify/functions/generate-video-bridge.js

const axios = require("axios");
const FormData = require("form-data");

// Helper para construir o header de autorização
const buildBearerHeader = (key) => {
  if (!key) return '';
  const cleaned = key.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  const withoutBearer = cleaned.replace(/^Bearer\s+/i, '');
  return `Bearer ${withoutBearer}`;
};


// Helper para headers de CORS (inclui x-bridge-auth)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-bridge-auth",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async function(event, context) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  // Log início da requisição
  console.log("[generate-video-bridge] Nova requisição recebida");

  // Autenticação opcional (x-bridge-auth)
  const BRIDGE_SECRET_KEY = process.env.BRIDGE_SECRET_KEY;
  const authHeader = event.headers['x-bridge-auth'] || event.headers['X-Bridge-Auth'];
  if (BRIDGE_SECRET_KEY && (!authHeader || authHeader !== BRIDGE_SECRET_KEY)) {
    console.warn('[generate-video-bridge] Token inválido ou ausente:', authHeader);
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Não autorizado. Token inválido ou ausente.' })
    };
  }

  // Parse body
  let parsedBody;
  try {
    parsedBody = JSON.parse(event.body);
  } catch (e) {
    console.warn('[generate-video-bridge] JSON inválido:', e.message);
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Invalid JSON" })
    };
  }

  // Espera-se: image_base64, ext, prompt, motionStrength
  const { image_base64, ext, prompt, motionStrength } = parsedBody;

  if (!image_base64) {
    console.warn('[generate-video-bridge] Parâmetro image_base64 ausente');
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Parâmetro 'image_base64' é obrigatório." })
    };
  }
  if (!ext) {
    console.warn('[generate-video-bridge] Parâmetro ext ausente');
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Parâmetro 'ext' (extensão da imagem) é obrigatório." })
    };
  }

  const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
  if (!LEONARDO_API_KEY) {
    console.error('[generate-video-bridge] API Key do Leonardo não configurada');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "API Key do Leonardo não configurada no servidor." })
    };
  }

  // --- CONVERTER BASE64 PARA BUFFER BINÁRIO ---
  let imageBuffer;
  try {
    imageBuffer = Buffer.from(image_base64, 'base64');
    console.log(`[generate-video-bridge] Buffer criado: ${imageBuffer.length} bytes`);
  } catch (error) {
    console.warn('[generate-video-bridge] Falha ao decodificar image_base64:', error.message);
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Falha ao decodificar image_base64. Verifique o formato." })
    };
  }

  const mimeType = `image/${ext}`;
  let imageId;
  let uploadTargetUrl;
  let uploadFields;

  // --- PASSO 1: INIT UPLOAD ---
  try {
    const initUrl = "https://cloud.leonardo.ai/api/rest/v1/init-image";
    const initResponse = await axios.post(
      initUrl,
      { extension: ext },
      {
        headers: {
          "Authorization": buildBearerHeader(LEONARDO_API_KEY),
          "Content-Type": "application/json",
        },
      }
    );
    imageId = initResponse.data.uploadInitImage?.id;
    uploadTargetUrl = initResponse.data.uploadInitImage?.url;
    uploadFields = initResponse.data.uploadInitImage?.fields;
    if (!imageId || !uploadTargetUrl || !uploadFields) {
      console.error('[generate-video-bridge] Resposta inválida do init-image:', initResponse.data);
      throw new Error('Resposta inválida do init-image');
    }
    console.log(`[generate-video-bridge] Init upload bem sucedido. ImageId: ${imageId}`);
  } catch (error) {
    console.error('[generate-video-bridge] Falha na inicialização do upload da Leonardo:', error.response?.data || error.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Falha na inicialização do upload da Leonardo.", details: error.response?.data || error.message })
    };
  }

  // --- PASSO 2: UPLOAD PARA S3 ---
  try {
    const parsedFields = JSON.parse(uploadFields);
    const formData = new FormData();
    Object.entries(parsedFields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append('file', imageBuffer, {
      filename: parsedFields.key.split('/').pop(),
      contentType: mimeType,
    });
    await axios.post(uploadTargetUrl, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    console.log(`[generate-video-bridge] Upload S3 concluído para imageId: ${imageId}`);
  } catch (error) {
    console.error('[generate-video-bridge] Falha no upload multipart para S3:', error.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Falha no upload multipart para S3.", details: error.message })
    };
  }

  // --- PASSO 3: GERAR O VÍDEO ---
  try {
    let videoGenUrl, videoBody, endpointType;
    let validMotionStrength = Math.max(1, Math.min(motionStrength || 5, 10));
    if (prompt) {
      // Se vier prompt, usa image-to-video
      videoGenUrl = "https://cloud.leonardo.ai/api/rest/v1/generations-image-to-video";
      videoBody = {
        imageId: imageId,
        imageType: "UPLOADED",
        endFrameImage: { type: "UPLOADED" },
        model: "MOTION2",
        resolution: "RESOLUTION_1080",
        prompt: prompt
      };
      endpointType = 'image-to-video';
    } else {
      // Se não vier prompt, usa generations-motion-svd
      videoGenUrl = "https://cloud.leonardo.ai/api/rest/v1/generations-motion-svd";
      videoBody = {
        imageId: imageId,
        isInitImage: true,
        motionStrength: validMotionStrength
      };
      endpointType = 'motion-svd';
    }

    const videoResponse = await axios.post(videoGenUrl, videoBody, {
      headers: {
        "Authorization": buildBearerHeader(LEONARDO_API_KEY),
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    // Extrair o generationId de acordo com o endpoint
    let generationId = null;
    let apiCreditCost = null;
    if (endpointType === 'image-to-video') {
      generationId =
        videoResponse.data?.imageToVideoMotionJob?.generationId ||
        videoResponse.data?.motionSvdGenerationJob?.generationId ||
        videoResponse.data?.motionGeneration?.id ||
        videoResponse.data?.sdGenerationJob?.generationId ||
        videoResponse.data?.generationId;
      apiCreditCost = videoResponse.data?.imageToVideoMotionJob?.apiCreditCost ||
                     videoResponse.data?.motionSvdGenerationJob?.apiCreditCost ||
                     videoResponse.data?.apiCreditCost;
    } else {
      generationId =
        videoResponse.data?.motionSvdGenerationJob?.generationId ||
        videoResponse.data?.motionGeneration?.id ||
        videoResponse.data?.generationId;
      apiCreditCost = videoResponse.data?.motionSvdGenerationJob?.apiCreditCost ||
                     videoResponse.data?.apiCreditCost;
    }

    if (!generationId) {
      console.error('[generate-video-bridge] Leonardo não retornou generationId:', videoResponse.data);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Leonardo não retornou generationId", response: videoResponse.data })
      };
    }
    console.log(`[generate-video-bridge] Geração de vídeo iniciada com sucesso! GenerationId: ${generationId}`);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        generationId: generationId,
        imageId: imageId,
        apiCreditCost: apiCreditCost,
        message: "Geração de vídeo iniciada com sucesso!",
        motionStrength: validMotionStrength,
        endpoint: endpointType
      })
    };
  } catch (error) {
    console.error('[generate-video-bridge] Falha ao iniciar a geração de vídeo:', error.response?.data || error.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Falha ao iniciar a geração de vídeo.", details: error.response?.data || error.message, imageId: imageId })
    };
  }
};
