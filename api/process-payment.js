// api/process-payment.js - Implementação correta PagFlex
export default async function handler(req, res) {
    // CORS headers para máxima compatibilidade
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

    // Aplicar todos os headers
    Object.entries({...corsHeaders, ...securityHeaders}).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    // Resposta para OPTIONS (preflight CORS)
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
        console.log('=== INÍCIO PROCESSAMENTO PAGFLEX ===');
        
        const { amount, token, customer } = req.body;

        // Log seguro do payload (sem dados sensíveis)
        console.log('Dados recebidos:', {
            amount: amount,
            hasToken: !!token,
            tokenLength: token?.length || 0,
            customer: customer ? {
                name: customer.name,
                email: customer.email,
                hasDocument: !!customer.document
            } : 'não informado'
        });

        // Validações essenciais
        if (!amount || amount <= 0 || !Number.isInteger(amount)) {
            return res.status(400).json({
                success: false,
                error: 'Valor inválido - deve ser um número inteiro positivo em centavos',
                received: { amount, type: typeof amount }
            });
        }

        if (!token || typeof token !== 'string' || token.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Token do cartão é obrigatório e deve ser uma string válida',
                received: { hasToken: !!token, tokenType: typeof token, tokenLength: token?.length || 0 }
            });
        }

        if (!customer || !customer.name || !customer.email || !customer.document) {
            return res.status(400).json({
                success: false,
                error: 'Dados do cliente são obrigatórios (name, email, document)',
                received: customer
            });
        }

        // Chaves PagFlex
        const PUBLIC_KEY = "pk_Lb36FpUkSiXw24roWxzJ6jofpb2MvV8A9y8ecIyPZWwRsCKC";
        const SECRET_KEY = "sk_8zwofVumfAPF1HlLoq3VoKrecvUlQ17JR8b2Nos9XdBUPtS-";

        // Preparar documento limpo
        const cleanDocument = customer.document.replace(/[^0-9]/g, '');
        const documentType = cleanDocument.length === 11 ? 'cpf' : 'cnpj';

        console.log('Documento processado:', { 
            original: customer.document, 
            clean: cleanDocument, 
            length: cleanDocument.length, 
            type: documentType 
        });

        // Payload CORRIGIDO conforme documentação PagFlex
        const pagflexPayload = {
            amount: amount,
            payment_method: "credit_card",
            card_token: token,
            installments: 1,
            capture: true,
            customer: {
                name: customer.name.trim(),
                email: customer.email.toLowerCase().trim(),
                document: cleanDocument,
                document_type: documentType
            }
        };

        // ID único da transação
        const uniqueId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        pagflexPayload.external_id = uniqueId;

        console.log('Payload final para PagFlex:', {
            amount: pagflexPayload.amount,
            payment_method: pagflexPayload.payment_method,
            installments: pagflexPayload.installments,
            capture: pagflexPayload.capture,
            external_id: pagflexPayload.external_id,
            customer: {
                ...pagflexPayload.customer,
                document: pagflexPayload.customer.document.substring(0, 3) + '***'
            },
            token_length: token.length
        });

        // Headers para requisição
        const auth = 'Basic ' + Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');
        const headers = {
            'Authorization': auth,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'PagFlex-Anonymous-System/1.0'
        };

        console.log('Fazendo requisição para PagFlex...');
        console.log('URL:', 'https://api.pagflexbr.com/v1/transactions');
        console.log('Headers:', { ...headers, Authorization: headers.Authorization.substring(0, 20) + '...' });

        // Requisição com timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.log('Timeout atingido, cancelando requisição');
            controller.abort();
        }, 25000);

        const response = await fetch('https://api.pagflexbr.com/v1/transactions', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(pagflexPayload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log('Resposta PagFlex recebida:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            url: response.url
        });

        // Ler resposta como texto primeiro
        const responseText = await response.text();
        console.log('Corpo da resposta (primeiros 500 chars):', responseText.substring(0, 500));

        if (!responseText) {
            console.error('Resposta vazia do PagFlex');
            return res.status(502).json({
                success: false,
                error: 'Gateway retornou resposta vazia',
                details: {
                    status: response.status,
                    statusText: response.statusText
                }
            });
        }

        // Tentar parsear JSON
        let pagflexResult;
        try {
            pagflexResult = JSON.parse(responseText);
            console.log('JSON parseado com sucesso');
        } catch (parseError) {
            console.error('Erro ao parsear JSON da resposta:', parseError.message);
            return res.status(502).json({
                success: false,
                error: 'Resposta inválida do gateway',
                details: {
                    message: 'Gateway retornou dados em formato inválido',
                    parseError: parseError.message,
                    responsePreview: responseText.substring(0, 200)
                }
            });
        }

        console.log('Resultado PagFlex:', pagflexResult);

        // Verificar se foi aprovado
        if (response.ok && pagflexResult && (pagflexResult.status === 'approved' || pagflexResult.status === 'paid')) {
            console.log('✅ Transação APROVADA');
            
            return res.status(200).json({
                success: true,
                transaction_id: pagflexResult.id || uniqueId,
                status: pagflexResult.status || 'approved',
                amount: pagflexResult.amount || amount,
                data: {
                    id: pagflexResult.id || uniqueId,
                    status: pagflexResult.status || 'approved',
                    amount: pagflexResult.amount || amount,
                    created_at: pagflexResult.created_at || new Date().toISOString(),
                    payment_method: 'credit_card',
                    gateway: 'pagflex'
                }
            });

        } else {
            // Transação rejeitada ou erro
            console.log('❌ Transação REJEITADA ou com erro');
            
            // Extrair mensagem de erro mais específica
            let errorMessage = 'Transação não autorizada';
            let errorCode = response.status;
            
            if (pagflexResult) {
                if (pagflexResult.message) {
                    errorMessage = pagflexResult.message;
                }
                if (pagflexResult.error_message) {
                    errorMessage = pagflexResult.error_message;
                }
                if (pagflexResult.errors && Array.isArray(pagflexResult.errors) && pagflexResult.errors.length > 0) {
                    errorMessage = pagflexResult.errors[0].message || pagflexResult.errors[0];
                }
                if (pagflexResult.code || pagflexResult.error_code) {
                    errorCode = pagflexResult.code || pagflexResult.error_code;
                }
            }
            
            return res.status(400).json({
                success: false,
                error: 'Transação rejeitada pelo gateway',
                details: {
                    message: errorMessage,
                    code: errorCode,
                    status: pagflexResult?.status,
                    gateway_response: pagflexResult
                },
                debug: {
                    httpStatus: response.status,
                    responseOk: response.ok,
                    hasResult: !!pagflexResult,
                    resultKeys: pagflexResult ? Object.keys(pagflexResult) : []
                }
            });
        }

    } catch (error) {
        console.error('=== ERRO GERAL ===');
        console.error('Nome:', error.name);
        console.error('Mensagem:', error.message);
        console.error('Stack trace:', error.stack);

        // Diferentes tipos de erro
        if (error.name === 'AbortError') {
            return res.status(408).json({
                success: false,
                error: 'Timeout na comunicação',
                message: 'O gateway demorou muito para responder. Tente novamente.',
                details: { errorType: 'timeout' }
            });
        }

        if (error.message?.includes('fetch') || error.message?.includes('network')) {
            return res.status(503).json({
                success: false,
                error: 'Erro de comunicação',
                message: 'Não foi possível conectar ao gateway de pagamento',
                details: { 
                    errorType: 'network',
                    message: error.message
                }
            });
        }

        // Erro interno genérico
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: 'Falha no processamento do pagamento',
            details: {
                errorType: 'internal',
                name: error.name,
                message: error.message
            }
        });
        
    } finally {
        console.log('=== FIM DO PROCESSAMENTO ===\n');
    }
}
