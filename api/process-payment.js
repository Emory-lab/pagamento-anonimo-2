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

        // Validações básicas
        if (!amount || !token || !customer || !items) {
            return res.status(400).json({
                success: false,
                error: 'Dados obrigatórios ausentes'
            });
        }

        // Validar customer
        if (!customer.name || !customer.email || !customer.document) {
            return res.status(400).json({
                success: false,
                error: 'Dados do cliente incompletos'
            });
        }

        // Validar items
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Items são obrigatórios'
            });
        }

        // Chaves PagFlex
        const PUBLIC_KEY = "pk_Lb36FpUkSiXw24roWxzJ6jofpb2MvV8A9y8ecIyPZWwRsCKC";
        const SECRET_KEY = "sk_8zwofVumfAPF1HlLoq3VoKrecvUlQ17JR8b2Nos9XdBUPtS-";

        // Criar Basic Auth
        const credentials = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');

        // Payload para PagFlex
        const pagflexPayload = {
            amount,
            paymentMethod: "credit_card",
            token,
            customer: {
                name: customer.name,
                email: customer.email,
                document: customer.document,
                // Não enviar dados de localização ou IP
            },
            items: items.map(item => ({
                name: item.name || 'Item',
                quantity: item.quantity || 1,
                price: item.price || amount
            }))
        };

        // Adicionar descrição se fornecida
        if (description) {
            pagflexPayload.description = description;
        }

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