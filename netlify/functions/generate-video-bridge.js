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

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }
}

  // Parse body
  let parsedBody;
  try {
    parsedBody = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" })
    };
  }

  // Espera-se: image_base64, ext, prompt, motionStrength
  const { image_base64, ext, prompt, motionStrength } = parsedBody;

  if (!image_base64) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Parâmetro 'image_base64' é obrigatório." })
    };
  }
  if (!ext) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Parâmetro 'ext' (extensão da imagem) é obrigatório." })
    };
  }

  const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
  if (!LEONARDO_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API Key do Leonardo não configurada no servidor." })
    };
  }

  // --- CONVERTER BASE64 PARA BUFFER BINÁRIO ---
  let imageBuffer;
  try {
    imageBuffer = Buffer.from(image_base64, 'base64');
  } catch (error) {
    return {
      statusCode: 400,
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
      throw new Error('Resposta inválida do init-image');
    }
  } catch (error) {
    return {
      statusCode: 500,
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
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Falha no upload multipart para S3.", details: error.message })
    };
  }

  // --- PASSO 3: GERAR O VÍDEO COM MOTION2 ---
  try {
    const videoGenUrl = "https://cloud.leonardo.ai/api/rest/v1/generations-image-to-video";
    const validMotionStrength = Math.max(1, Math.min(motionStrength || 5, 10));
    const videoBody = {
      imageId: imageId,
      imageType: "UPLOADED",
      endFrameImage: { type: "UPLOADED" },
      model: "MOTION2",
      resolution: "RESOLUTION_1080",
      motionStrength: validMotionStrength
    };
    const videoResponse = await axios.post(videoGenUrl, videoBody, {
      headers: {
        "Authorization": buildBearerHeader(LEONARDO_API_KEY),
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });
    const generationId =
      videoResponse.data?.imageToVideoMotionJob?.generationId ||
      videoResponse.data?.motionSvdGenerationJob?.generationId ||
      videoResponse.data?.motionGeneration?.id ||
      videoResponse.data?.sdGenerationJob?.generationId ||
      videoResponse.data?.generationId;
    if (!generationId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Leonardo não retornou generationId", response: videoResponse.data })
      };
    }
    const apiCreditCost = videoResponse.data?.imageToVideoMotionJob?.apiCreditCost ||
                         videoResponse.data?.motionSvdGenerationJob?.apiCreditCost ||
                         videoResponse.data?.apiCreditCost;
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        generationId: generationId,
        imageId: imageId,
        apiCreditCost: apiCreditCost,
        message: "Geração de vídeo iniciada com sucesso!",
        motionStrength: validMotionStrength
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Falha ao iniciar a geração de vídeo.", details: error.response?.data || error.message, imageId: imageId })
    };
  }
