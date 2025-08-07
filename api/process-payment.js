// api/process-payment.js - Vercel Serverless Function
// Sistema de pagamento anônimo com PagFlex - VERSÃO CORRIGIDA

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
        console.log('=== INÍCIO DO PROCESSAMENTO ===');
        
        const { amount, token, customer, items, description } = req.body;

        // Log do payload recebido (sem dados sensíveis)
        console.log('Payload recebido:', {
            amount,
            hasToken: !!token,
            tokenLength: token?.length,
            customer: customer ? {
                name: customer.name,
                email: customer.email,
                documentLength: customer.document?.length
            } : null,
            itemsCount: items?.length
        });

        // Validações básicas
        if (!amount || amount <= 0 || !Number.isInteger(amount)) {
            return res.status(400).json({
                success: false,
                error: 'Valor inválido - deve ser um número inteiro positivo em centavos'
            });
        }

        if (!token || typeof token !== 'string' || token.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Token do cartão inválido'
            });
        }

        if (!customer || !customer.name || !customer.email || !customer.document) {
            return res.status(400).json({
                success: false,
                error: 'Dados do cliente incompletos'
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Items são obrigatórios'
            });
        }

        // Chaves PagFlex
        const PUBLIC_KEY = "pk_Lb36FpUkSiXw24roWxzJ6jofpb2MvV8A9y8ecIyPZWwRsCKC";
        const SECRET_KEY = "sk_8zwofVumfAPF1HlLoq3VoKrecvUlQ17JR8b2Nos9XdBUPtS-";

        // Limpar documento (apenas números)
        const cleanDocument = customer.document.replace(/[^0-9]/g, '');

        // Determinar tipo de documento
        const documentType = cleanDocument.length === 11 ? "cpf" : "cnpj";

        // Payload para PagFlex - baseado na documentação oficial
        const pagflexPayload = {
            amount: amount,
            card_token: token,
            customer: {
                name: customer.name.trim(),
                email: customer.email.toLowerCase().trim(),
                document: cleanDocument,
                document_type: documentType
            },
            billing: {
                name: customer.name.trim(),
                email: customer.email.toLowerCase().trim()
            },
            items: items.map(item => ({
                name: String(item.name).substring(0, 50),
                quantity: parseInt(item.quantity) || 1,
                amount: parseInt(item.price) || amount
            })),
            currency: "BRL",
            payment_method: "credit_card",
            order_id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // Adicionar descrição se fornecida
        if (description && description.trim()) {
            pagflexPayload.description = description.trim().substring(0, 100);
        }

        console.log('Payload para PagFlex:', JSON.stringify(pagflexPayload, null, 2));

        // Criar autenticação Basic
        const credentials = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');

        // Headers para PagFlex
        const pagflexHeaders = {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'PagFlex-Integration/1.0'
        };

        // Tentar diferentes endpoints
        const possibleEndpoints = [
            'https://api.pagflexbr.com/v1/sales',
            'https://api.pagflexbr.com/v1/transactions',
            'https://api.pagflexbr.com/sales',
            'https://pagflexbr.com/api/v1/sales'
        ];

        let lastError = null;
        let responseData = null;

        for (const endpoint of possibleEndpoints) {
            try {
                console.log(`Tentando endpoint: ${endpoint}`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 25000);

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: pagflexHeaders,
                    body: JSON.stringify(pagflexPayload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                console.log(`Resposta do endpoint ${endpoint}:`, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries())
                });

                // Pegar o texto bruto da resposta
                const responseText = await response.text();
                console.log(`Texto da resposta (${endpoint}):`, responseText.substring(0, 500));

                if (!responseText) {
                    console.log(`Resposta vazia do endpoint ${endpoint}`);
                    continue;
                }

                // Tentar parsear como JSON
                let parsedResponse;
                try {
                    parsedResponse = JSON.parse(responseText);
                } catch (parseError) {
                    console.log(`Erro ao parsear JSON do endpoint ${endpoint}:`, parseError.message);
                    console.log('Conteúdo que falhou ao parsear:', responseText);
                    continue;
                }

                if (response.ok) {
                    console.log(`Sucesso no endpoint ${endpoint}:`, parsedResponse);
                    responseData = parsedResponse;
                    break;
                } else {
                    console.log(`Erro HTTP ${response.status} no endpoint ${endpoint}:`, parsedResponse);
                    lastError = {
                        endpoint,
                        status: response.status,
                        error: parsedResponse
                    };
                }

            } catch (fetchError) {
                console.log(`Erro na requisição para ${endpoint}:`, fetchError.message);
                lastError = {
                    endpoint,
                    error: fetchError.message
                };
                continue;
            }
        }

        // Se chegou até aqui e não tem responseData, houve erro
        if (!responseData) {
            console.log('Todos os endpoints falharam. Último erro:', lastError);

            return res.status(400).json({
                success: false,
                error: 'Falha na comunicação com o gateway de pagamento',
                details: {
                    message: lastError?.error?.message || 'Não foi possível processar o pagamento',
                    code: lastError?.status || 'GATEWAY_ERROR',
                    endpoint_tested: possibleEndpoints.length
                }
            });
        }

        // Sucesso - processar resposta
        console.log('Processamento concluído com sucesso:', responseData);

        return res.status(200).json({
            success: true,
            transaction_id: responseData.id || responseData.transaction_id || responseData.order_id,
            status: responseData.status || 'processing',
            amount: responseData.amount || amount,
            data: {
                id: responseData.id || responseData.transaction_id,
                status: responseData.status || 'approved',
                amount: responseData.amount || amount,
                created_at: responseData.created_at || new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('=== ERRO GERAL ===');
        console.error('Tipo do erro:', error.constructor.name);
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: 'Falha no processamento do pagamento',
            details: {
                error_type: error.constructor.name,
                message: error.message
            }
        });
    } finally {
        console.log('=== FIM DO PROCESSAMENTO ===');
    }
}
