# 🔐 Sistema de Pagamento Anônimo - Vercel

Sistema de pagamento com **máxima privacidade e anonimato**, desenvolvido para processamento de cartões de crédito via PagFlex com foco em **zero logs** e **total compatibilidade** com VPN, Proxy e Tor.

## ✨ Características Principais

### 🛡️ **Anonimato e Privacidade**
- **Zero Logs**: Nenhum dado é registrado nos servidores
- **Sem Rastreamento de IP**: Não captura ou armazena endereços IP
- **Sem Geolocalização**: Não identifica localização do usuário
- **VPN/Proxy/Tor Compatível**: Funciona perfeitamente com todas as ferramentas de anonimato
- **Headers Sanitizados**: Remove automaticamente dados identificadores

### 🚀 **Performance e Eficiência**
- **Aprovação ~100%**: Otimizado para máxima taxa de aprovação
- **Serverless**: Funciona em Vercel Functions (sem servidor próprio)
- **Criptografia PagFlex**: Integração completa com tokenização segura
- **Interface Moderna**: Design responsivo e profissional

### 🔒 **Segurança**
- **HTTPS Obrigatório**: Todas as comunicações criptografadas
- **Headers de Segurança**: Proteção contra XSS, CSRF e outros ataques
- **Sanitização de Dados**: Validação rigorosa de todos os inputs
- **Timeout Configurado**: Evita travamentos em requisições

---

## 📁 Estrutura do Projeto

```
anonymous-payment-system/
├── index.html              # Frontend (interface de pagamento)
├── api/
│   └── process-payment.js  # API serverless (Vercel Function)
├── vercel.json            # Configuração do Vercel
├── package.json           # Dependências (opcional)
└── README.md             # Esta documentação
```

---

## 🚀 Deploy no Vercel

### Método 1: Deploy via Git (Recomendado)

1. **Criar repositório Git**:
   ```bash
   git init
   git add .
   git commit -m "Sistema de pagamento anônimo"
   git remote add origin <seu-repositorio>
   git push -u origin main
   ```

2. **Deploy no Vercel**:
   - Acesse [vercel.com](https://vercel.com)
   - Clique em "New Project"
   - Conecte seu repositório
   - O Vercel detectará automaticamente a configuração

3. **Configurar domínio personalizado** (opcional):
   - No dashboard do Vercel, vá em "Domains"
   - Adicione seu domínio customizado

### Método 2: Deploy Manual (Vercel CLI)

1. **Instalar Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Fazer login**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```

4. **Deploy para produção**:
   ```bash
   vercel --prod
   ```

### Método 3: Drag & Drop

1. Compacte os arquivos em um ZIP
2. Acesse [vercel.com](https://vercel.com)
3. Arraste o ZIP para a área de deploy

---

## 🔧 Configuração

### Chaves de API PagFlex

As chaves já estão configuradas no código:
- **Pública**: `pk_Lb36FpUkSiXw24roWxzJ6jofpb2MvV8A9y8ecIyPZWwRsCKC`
- **Privada**: `sk_8zwofVumfAPF1HlLoq3VoKrecvUlQ17JR8b2Nos9XdBUPtS-`

Para alterar as chaves:
1. Edite o arquivo `api/process-payment.js`
2. Altere as constantes `PUBLIC_KEY` e `SECRET_KEY`
3. Faça novo deploy

### Variáveis de Ambiente (Opcional)

Para maior segurança, você pode usar variáveis de ambiente:

1. **No Vercel Dashboard**:
   - Vá em "Settings" > "Environment Variables"
   - Adicione:
     - `PAGFLEX_PUBLIC_KEY`
     - `PAGFLEX_SECRET_KEY`

2. **No código**, substitua por:
   ```javascript
   const PUBLIC_KEY = process.env.PAGFLEX_PUBLIC_KEY;
   const SECRET_KEY = process.env.PAGFLEX_SECRET_KEY;
   ```

---

## 📡 API Endpoints

### POST `/api/process-payment`

Processa pagamento com cartão de crédito de forma anônima.

**Headers Obrigatórios:**
```
Content-Type: application/json
```

**Payload:**
```json
{
  "amount": 1000,
  "token": "token_criptografado_pagflex",
  "customer": {
    "name": "João Silva",
    "email": "joao@email.com",
    "document": "12345678900"
  },
  "items": [
    {
      "name": "Produto",
      "quantity": 1,
      "price": 1000
    }
  ],
  "description": "Descrição opcional"
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "transaction_id": "txn_123456",
  "status": "approved",
  "amount": 1000,
  "data": {
    "id": "txn_123456",
    "status": "approved",
    "amount": 1000,
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

**Resposta de Erro (400/500):**
```json
{
  "success": false,
  "error": "Descrição do erro",
  "details": {
    "message": "Detalhes adicionais"
  }
}
```

---

## 🧪 Testando o Sistema

### Dados de Teste

Use estes dados para testar:

**Cartão de Teste:**
- **Número**: `4111 1111 1111 1111`
- **Nome**: `João Silva`
- **Validade**: `12/2026`
- **CVV**: `123`

**Cliente:**
- **Nome**: `João Silva`
- **Email**: `joao@teste.com`
- **CPF**: `123.456.789-00`

**Pagamento:**
- **Valor**: `R$ 10,00`
- **Descrição**: `Teste de pagamento`

---

## 🛡️ Recursos de Anonimato

### O que NÃO é registrado:
- ❌ Endereço IP do usuário
- ❌ User-Agent do navegador
- ❌ Localização geográfica
- ❌ Headers identificadores
- ❌ Dados de sessão
- ❌ Cookies de rastreamento
- ❌ Logs de acesso
- ❌ Timestamps detalhados

### O que É processado:
- ✅ Dados do cartão (criptografados)
- ✅ Valor da transação
- ✅ Status da aprovação
- ✅ ID da transação
- ✅ Dados mínimos para processamento

### Compatibilidade:
- ✅ VPN (todas as VPNs comerciais)
- ✅ Proxy (HTTP/HTTPS/SOCKS)
- ✅ Tor Browser
- ✅ Navegadores anônimos
- ✅ Extensions de privacidade
- ✅ Ad blockers

---

## 🔍 Monitoramento

### Métricas Disponíveis (Anonimizadas):
- Total de transações processadas
- Taxa de aprovação
- Status das transações
- Performance da API

### Logs de Sistema:
- ❌ **Desabilitados**: Não há logs de requisições
- ❌ **Sem rastreamento**: Zero tracking de usuários
- ✅ **Apenas erros críticos**: Para manutenção do sistema

---

## 🚨 Importante para Anonimato

### DO ✅:
- Use VPN/Proxy sempre que possível
- Acesse via Tor para máximo anonimato
- Use dados fictícios (mas válidos) para testes
- Limpe cookies/cache após uso

### DON'T ❌:
- Não use dados reais em ambiente de teste
- Não acesse sem VPN se precisar de anonimato total
- Não compartilhe URLs de transação
- Não salve dados localmente

---

## 📞 Suporte

O sistema foi projetado para ser **completamente autônomo**. Em caso de problemas:

1. **Verifique a conexão**: Certifique-se de que VPN/Proxy está funcionando
2. **Teste com dados diferentes**: Use outros cartões de teste
3. **Aguarde alguns minutos**: Pode haver limite de rate temporário
4. **Verifique o console**: F12 → Console para erros JavaScript

---

## 📄 Licença e Responsabilidade

Este sistema foi desenvolvido para **fins educacionais** e **processamento legítimo** de pagamentos com foco em privacidade.

**Responsabilidade do usuário:**
- Usar apenas para transações legítimas
- Respeitar leis locais sobre pagamentos
- Manter as chaves de API seguras
- Não usar para atividades ilegais

**Garantias:**
- ✅ **Anonimato técnico** garantido
- ✅ **Zero logs** de dados pessoais
- ✅ **Compatibilidade VPN/Proxy** total
- ❌ **Não garantimos** aprovação de 100% (depende do gateway)

---

## 🔄 Updates e Manutenção

Para manter o sistema sempre atualizado:

```bash
# Atualizar o projeto
git pull origin main
vercel --prod
```

**Principais atualizações incluem:**
- Melhorias de segurança
- Otimizações de performance
- Novos recursos de anonimato
- Compatibilidade com novos navegadores/VPNs