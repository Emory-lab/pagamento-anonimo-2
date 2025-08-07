// api/process-payment.js - Vercel Serverless Function
// Sistema de pagamento anônimo com PagFlex - CORRIGIDO

export default async function handler(req, res) {
    // CORS headers para máxima compatibilidade (incluindo VPN/Proxy)
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Forwarded-For, X-Real-IP',
        'Access-Control-Max-Age': '86400',
    };

    // Headers de segurança e anonimato
    const securityHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-cache, no-store, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Robots-Tag': 'noindex, nofollow, nosnippet, noarchive',
    };

    // Combinar headers
    const allHeaders = { ...corsHeaders, ...securityHeaders };

    // Aplicar headers imediatamente
    Object.entries(allHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    // Resposta para OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).json({ message: 'OK' });
    }

    // Apenas POST permitido
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).json({
            success: false,
            error: 'Método não permitido'
        });
    }

    try {
        // ANONIMATO: Não capturar IP, User-Agent ou outros dados identificadores
        // Não logar nenhuma informação da requisição
        
        const { amount, token, customer, items, description } = req.body;

        // Validar amount (deve ser positivo e inteiro)
        if (!amount || amount <= 0 || !Number.isInteger(amount)) {
            return res.status(400).json({
                success: false,
                error: 'Valor inválido - deve ser um número inteiro positivo em centavos'
            });
        }

        // Validar token
        if (!token || typeof token !== 'string' || token.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Token do cartão inválido'
            });
        }

        // Validar customer com mais rigor
        if (!customer || !customer.name || customer.name.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Nome do cliente deve ter pelo menos 2 caracteres'
            });
        }

        if (!customer.email || !customer.email.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'E-mail do cliente inválido'
            });
        }

        if (!customer.document) {
            return res.status(400).json({
                success: false,
                error: 'Documento do cliente obrigatório'
            });
        }

        // Validar CPF/CNPJ
        const cleanDocument = customer.document.replace(/[^0-9]/g, '');
        if (cleanDocument.length !== 11 && cleanDocument.length !== 14) {
            return res.status(400).json({
                success: false,
                error: 'Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)'
            });
        }

        // Validar items
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Pelo menos um item é obrigatório'
            });
        }

        // Validar cada item
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.name || !item.price || !item.quantity) {
                return res.status(400).json({
                    success: false,
                    error: `Item ${i + 1}: nome, preço e quantidade são obrigatórios`
                });
            }
            if (!Number.isInteger(item.price) || item.price <= 0) {
                return res.status(400).json({
                    success: false,
                    error: `Item ${i + 1}: preço deve ser um número inteiro positivo em centavos`
                });
            }
            if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
                return res.status(400).json({
                    success: false,
                    error: `Item ${i + 1}: quantidade deve ser um número inteiro positivo`
                });
            }
        }

        // Chaves PagFlex
        const PUBLIC_KEY = "pk_Lb36FpUkSiXw24roWxzJ6jofpb2MvV8A9y8ecIyPZWwRsCKC";
        const SECRET_KEY = "sk_8zwofVumfAPF1HlLoq3VoKrecvUlQ17JR8b2Nos9XdBUPtS-";

        // Criar Basic Auth
        const credentials = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');

        // Payload para PagFlex - Formato correto segundo a documentação
        const pagflexPayload = {
            amount: amount, // Valor em centavos
            card_token: token, // Token do cartão criptografado
            customer: {
                name: customer.name,
                email: customer.email,
                document: cleanDocument, // Apenas números
                document_type: cleanDocument.length === 11 ? "cpf" : "cnpj"
            },
            billing: {
                name: customer.name,
                email: customer.email
            },
            items: items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                amount: item.price // PagFlex usa 'amount' para preço do item
            })),
            currency: "BRL",
            payment_method: "credit_card"
        };

        // Adicionar descrição se fornecida
        if (description) {
            pagflexPayload.description = description.substring(0, 100);
        }

        // Adicionar order_id único
        pagflexPayload.order_id = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Headers para requisição ao PagFlex
        const pagflexHeaders = {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Anonymous-Payment-System/1.0'
        };

        // Endpoint correto do PagFlex
        const pagflexEndpoint = 'https://api.pagflexbr.com/v1/sales';

        console.log('Enviando para PagFlex:', JSON.stringify({
            endpoint: pagflexEndpoint,
            payload: pagflexPayload
        }, null, 2));

        // Requisição para PagFlex
        const response = await fetch(pagflexEndpoint, {
            method: 'POST',
            headers: pagflexHeaders,
            body: JSON.stringify(pagflexPayload),
            timeout: 25000 // 25 segundos de timeout
        });

        const responseText = await response.text();
        console.log('Resposta PagFlex (raw):', responseText);

        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Erro ao parsear resposta:', parseError);
            return res.status(500).json({
                success: false,
                error: 'Resposta inválida do gateway',
                details: {
                    message: 'Erro na comunicação com o gateway de pagamento'
                }
            });
        }

        // Processar resposta
        if (response.ok && result) {
            // Sucesso - retornar apenas dados necessários (sem logs)
            return res.status(200).json({
                success: true,
                transaction_id: result.id || result.transaction_id,
                status: result.status,
                amount: result.amount,
                data: {
                    id: result.id || result.transaction_id,
                    status: result.status,
                    amount: result.amount,
                    created_at: result.created_at || new Date().toISOString()
                }
            });
        } else {
            // Erro do gateway
            console.error('Erro PagFlex:', {
                status: response.status,
                statusText: response.statusText,
                result: result
            });

            return res.status(400).json({
                success: false,
                error: 'Pagamento não autorizado',
                details: {
                    message: result?.message || result?.error || 'Transação rejeitada',
                    code: result?.code || response.status
                }
            });
        }

    } catch (error) {
        // Log do erro para debugging (remover em produção para manter anonimato)
        console.error('Erro interno:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: 'Tente novamente em alguns instantes',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
