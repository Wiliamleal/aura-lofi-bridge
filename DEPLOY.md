# 🚀 Deploy do Bridge Server no Netlify - Guia Rápido

## Você já tem conta Netlify ✅

Vamos criar um **NOVO site separado** apenas para o bridge server.

---

## 📋 Passos para Deploy

### 1. Criar Novo Repositório GitHub

1. Ir para https://github.com/new
2. Nome do repositório: `aura-lofi-bridge`
3. Descrição: "Bridge server for Leonardo AI video generation"
4. **Público** ou Privado (sua escolha)
5. **NÃO** inicializar com README
6. Clicar em "Create repository"

### 2. Preparar e Fazer Push do Código

Abra o PowerShell e execute:

```powershell
# Navegar para o diretório netlify-bridge
cd "netlify-bridge"

# Inicializar Git
git init

# Adicionar todos os arquivos
git add .

# Fazer commit
git commit -m "Initial commit - Netlify bridge server"

# Adicionar remote (SUBSTITUA SEU-USUARIO pelo seu username do GitHub)
git remote add origin https://github.com/SEU-USUARIO/aura-lofi-bridge.git

# Push
git branch -M main
git push -u origin main
```

### 3. Conectar no Netlify

1. Ir para https://app.netlify.com
2. Clicar em "**Add new site**" → "**Import an existing project**"
3. Escolher "**Deploy with GitHub**"
4. Autorizar Netlify (se solicitado)
5. Procurar e selecionar: **`aura-lofi-bridge`**
6. Configurações:
   - **Branch to deploy:** `main`
   - **Build command:** (deixar vazio)
   - **Publish directory:** `.`
   - **Functions directory:** `netlify/functions` (auto-detectado)
7. Clicar em "**Deploy aura-lofi-bridge**"

### 4. Configurar Variáveis de Ambiente

Enquanto o deploy está acontecendo:

1. Ir para **Site settings** → **Environment variables**
2. Clicar em "**Add a variable**"
3. Adicionar cada uma:

```
Key: LEONARDO_API_KEY
Value: bfaf2742-ad75-4bc5-9c20-2586ac3c4753

Key: BRIDGE_SECRET_KEY  
Value: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6

Key: ALLOWED_ORIGINS
Value: https://auralofiai.com,https://www.auralofiai.com,https://aura-lofi-ia-app.firebaseapp.com,https://aura-lofi-ia-app.web.app
```

4. Clicar em "**Save**" em cada uma

### 5. Copiar URL do Site

Após o deploy concluir (~2 minutos):

1. Você verá uma URL como: `https://aura-lofi-bridge-abc123.netlify.app`
2. **COPIAR ESSA URL** - você vai precisar dela!

### 6. (Opcional) Personalizar Nome do Site

1. **Site settings** → **Site details** → **Change site name**
2. Escolher nome: `aura-lofi-bridge` (se disponível)
3. URL fica: `https://aura-lofi-bridge.netlify.app`

---

## ⚙️ Atualizar Frontend

Editar o arquivo `.env` do seu projeto principal:

```env
# Bridge Server URL - Netlify Functions
VITE_BRIDGE_SERVER_URL=https://aura-lofi-bridge.netlify.app/.netlify/functions

# Chave secreta (mesma do backend)
VITE_BRIDGE_SECRET_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

Salvar e **rebuildar** o frontend:

```powershell
npm run build
firebase deploy --only hosting
```

---

## ✅ Testar as Functions

### Teste 1: Health Check

Criar arquivo `netlify-bridge/netlify/functions/health.js`:

```javascript
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ok',
      message: 'Bridge server ativo',
      timestamp: new Date().toISOString()
    })
  };
};
```

Testar no navegador:
```
https://aura-lofi-bridge.netlify.app/.netlify/functions/health
```

### Teste 2: Gerar Vídeo

Testar no seu app Aura Lofi:
1. Fazer login
2. Ir para Editor
3. Carregar uma imagem
4. Clicar em "Gerar Vídeo"
5. Verificar se funciona!

---

## 🐛 Troubleshooting

### Erro: "Function not found"

**Solução:** Verificar que o diretório é `netlify/functions` (não `netlify-functions`)

### Erro: "Module not found: axios"

**Solução:** 
1. Ir para `netlify-bridge/package.json`
2. Verificar dependencies:
```json
{
  "dependencies": {
    "axios": "^1.13.2",
    "form-data": "^4.0.0"
  }
}
```
3. Re-deploy: commit e push

### Erro: "CORS blocked"

**Solução:** Adicionar seu domínio em `ALLOWED_ORIGINS` nas variáveis de ambiente

---

## 📊 Ver Logs

1. Dashboard Netlify → Seu site
2. **Functions** tab
3. Clicar em `generate-video-bridge` ou `check-video-status`
4. Ver logs em tempo real

---

## 💰 Custo

**FREE tier do Netlify:**
- ✅ 125,000 function invocations/mês
- ✅ 100 GB bandwidth
- ✅ HTTPS gratuito
- ✅ Deployments ilimitados

**Custo: $0/mês** (suficiente para começar!)

---

## 🎯 URLs Finais

Suas Netlify Functions estarão em:

```
POST https://aura-lofi-bridge.netlify.app/.netlify/functions/generate-video-bridge
GET  https://aura-lofi-bridge.netlify.app/.netlify/functions/check-video-status/{id}
```

---

**Pronto!** Qualquer dúvida, consulte os logs no painel do Netlify. 🚀
