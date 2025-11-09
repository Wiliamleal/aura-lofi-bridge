exports.handler = async (event, context) => {
  // Headers CORS para aceitar qualquer origem (só para teste)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-bridge-auth',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Se for preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed', method: event.httpMethod })
    };
  }

  try {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        message: 'Teste de CORS - Requisição recebida com sucesso!',
        origin: event.headers.origin || 'Não informado',
        timestamp: new Date().toISOString(),
        method: event.httpMethod
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', stack: error.stack })
    };
  }
};