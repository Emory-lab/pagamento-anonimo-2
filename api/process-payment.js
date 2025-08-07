// api/process-payment.js - Vercel Serverless Function
// Sistema de pagamento anônimo com PagFlex

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
        if (!customer.name || customer.name.length < 2) {
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

        // Validar items com mais detalhes
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

        // Payload para PagFlex - Formato correto brasileiro
        const pagflexPayload = {
            amount: amount, // Já em centavos
            payment_method: "credit_card", // underscore, não camelCase
            card_token: token, // PagFlex usa 'card_token', não 'token'
            customer: {
                name: customer.name,
                email: customer.email,
                document: customer.document.replace(/[^0-9]/g, ''), // Apenas números
                document_type: customer.document.replace(/[^0-9]/g, '').length === 11 ? "cpf" : "cnpj"
            },
            billing: {
                name: customer.name,
                email: customer.email
            },
            items: items.map(item => ({
                description: item.name || 'Item',
                quantity: item.quantity || 1,
                amount: item.price || amount // PagFlex usa 'amount', não 'price'
            })),
            currency: "BRL" // Moeda obrigatória
        };

        // Adicionar descrição se fornecida
        if (description) {
            pagflexPayload.description = description;
        }

        // Adicionar order_id único
        pagflexPayload.order_id = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Headers para requisição ao PagFlex (sem dados identificadores)
        const pagflexHeaders = {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Anonymous-Payment-System/1.0',
            // Não incluir X-Forwarded-For, X-Real-IP ou outros headers que possam identificar
        };

        // Requisição para PagFlex
        const response = await fetch('https://api.pagflexbr.com/v1/transactions', {
            method: 'POST',
            headers: pagflexHeaders,
            body: JSON.stringify(pagflexPayload),
        });

        // Processar resposta
        if (response.ok) {
            const result = await response.json();
            
            // Sucesso - retornar apenas dados necessários (sem logs)
            return res.status(200).json({
                success: true,
                transaction_id: result.id,
                status: result.status,
                amount: result.amount,
                // Não retornar dados sensíveis do gateway
                data: {
                    id: result.id,
                    status: result.status,
                    amount: result.amount,
                    created_at: result.created_at
                }
            });
        } else {
            // Erro do gateway
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = { message: 'Erro no gateway de pagamento' };
            }

            return res.status(400).json({
                success: false,
                error: 'Pagamento não autorizado',
                details: {
                    message: errorData.message || 'Transação rejeitada',
                    // Não expor detalhes internos do gateway
                }
            });
        }

    } catch (error) {
        // IMPORTANTE: Não logar o erro para manter anonimato
        // Não expor detalhes do erro interno
        
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: 'Tente novamente em alguns instantes'
        });
    } finally {
        // Aplicar headers de resposta
        Object.entries(allHeaders).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
    }
}
