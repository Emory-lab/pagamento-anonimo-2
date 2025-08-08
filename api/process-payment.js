// api/process-payment.js - Versão Corrigida PagFlex
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

        // Validações essenciais mais rigorosas
        if (!amount || amount <= 0 || !Number.isInteger(amount)) {
            return res.status(400).json({
                success: false,
                error: 'Valor inválido - deve ser um número inteiro positivo em centavos',
                received: { amount, type: typeof amount }
            });
        }

        if (amount < 100 || amount > 99999999) { // Min R$ 1,00, Max R$ 999.999,99
            return res.status(400).json({
                success: false,
                error: 'Valor deve estar entre R$ 1,00 (100 centavos) e R$ 999.999,99 (99999999 centavos)',
                received: { amount }
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

        // Validações adicionais dos dados do cliente
        if (customer.name.trim().length < 2 || customer.name.trim().length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Nome do cliente deve ter entre 2 e 100 caracteres',
                received: { nameLength: customer.name.length }
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customer.email.trim())) {
            return res.status(400).json({
                success: false,
                error: 'Email inválido',
                received: { email: customer.email }
            });
        }

        // Chaves PagFlex
        const PUBLIC_KEY = "pk_Lb36FpUkSiXw24roWxzJ6jofpb2MvV8A9y8ecIyPZWwRsCKC";
        const SECRET_KEY = "sk_8zwofVumfAPF1HlLoq3VoKrecvUlQ17JR8b2Nos9XdBUPtS-";

        // Preparar documento limpo
        const cleanDocument = customer.document.replace(/[^0-9]/g, '');
        
        // Validar documento
        if (cleanDocument.length !== 11 && cleanDocument.length !== 14) {
            return res.status(400).json({
                success: false,
                error: 'Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ)',
                received: { document: customer.document, cleanLength: cleanDocument.length }
            });
        }

        const documentType = cleanDocument.length === 11 ? 'cpf' : 'cnpj';

        console.log('Documento processado:', { 
            original: customer.document, 
            clean: cleanDocument, 
            length: cleanDocument.length, 
            type: documentType 
        });

        // ID único da transação
        const uniqueId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Payload CORRIGIDO conforme documentação PagFlex
        const pagflexPayload = {
            amount: amount,
            payment_method: "credit_card",
            installments: 1,
            capture: true,
            external_id: uniqueId,
            card: {
                token: token
            },
            customer: {
                name: customer.name.trim(),
                email: customer.email.toLowerCase().trim(),
                document: {
                    type: documentType,
                    number: cleanDocument
                }
            },
            // Billing address simplificado
            billing: {
                name: customer.name.trim(),
                address: {
                    street: "Rua Principal",
                    number: "123",
                    neighborhood: "Centro",
                    city: "São Paulo",
                    state: "SP",
                    zipcode: "01000000",
                    country: "BR"
                }
            }
        };

        console.log('Payload final para PagFlex:', {
            amount: pagflexPayload.amount,
            payment_method: pagflexPayload.payment_method,
            installments: pagflexPayload.installments,
            capture: pagflexPayload.capture,
            external_id: pagflexPayload.external_id,
            customer: {
                name: pagflexPayload.customer.name,
                email: pagflexPayload.customer.email,
                document: {
                    type: pagflexPayload.customer.document.type,
                    number: pagflexPayload.customer.document.number.substring(0, 3) + '***'
                }
            },
            billing: {
                name: pagflexPayload.billing.name,
                address: pagflexPayload.billing.address
            },
            card: { token_length: token.length }
        });

        // Headers para requisição - CORRIGIDO
        const auth = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');
        const headers = {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'PagFlex-Anonymous-System/2.0',
            'Accept-Charset': 'utf-8'
        };

        console.log('Fazendo requisição para PagFlex...');
        console.log('URL:', 'https://api.pagflexbr.com/v1/transactions');
        console.log('Headers:', { 
            ...headers, 
            Authorization: `Basic ${auth.substring(0, 20)}...` 
        });

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
            url: response.url,
            headers: Object.fromEntries(response.headers.entries())
        });

        // Ler resposta como texto primeiro
        const responseText = await response.text();
        console.log('Corpo da resposta (primeiros 1000 chars):', responseText.substring(0, 1000));

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
            console.log('Resultado PagFlex (estrutura):', {
                hasId: !!pagflexResult.id,
                status: pagflexResult.status,
                hasAmount: !!pagflexResult.amount,
                keys: Object.keys(pagflexResult)
            });
        } catch (parseError) {
            console.error('Erro ao parsear JSON da resposta:', parseError.message);
            console.error('Resposta raw:', responseText);
            return res.status(502).json({
                success: false,
                error: 'Resposta inválida do gateway',
                details: {
                    message: 'Gateway retornou dados em formato inválido',
                    parseError: parseError.message,
                    responsePreview: responseText.substring(0, 200),
                    httpStatus: response.status
                }
            });
        }

        // Verificar se foi aprovado - CORRIGIDO
        if (response.ok && pagflexResult && 
            (pagflexResult.status === 'approved' || 
             pagflexResult.status === 'paid' ||
             pagflexResult.status === 'authorized')) {
            
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
                    gateway: 'pagflex',
                    external_id: uniqueId
                }
            });

        } else {
            // Transação rejeitada ou erro - MELHORADO
            console.log('❌ Transação REJEITADA ou com erro');
            console.log('Resultado completo:', pagflexResult);
            
            // Extrair mensagem de erro mais específica
            let errorMessage = 'Transação não autorizada';
            let errorCode = response.status;
            let errorDetails = null;
            
            if (pagflexResult) {
                // Tentar diferentes campos de erro
                if (pagflexResult.message) {
                    errorMessage = pagflexResult.message;
                }
                if (pagflexResult.error_message) {
                    errorMessage = pagflexResult.error_message;
                }
                if (pagflexResult.error && typeof pagflexResult.error === 'string') {
                    errorMessage = pagflexResult.error;
                }
                if (pagflexResult.errors && Array.isArray(pagflexResult.errors) && pagflexResult.errors.length > 0) {
                    const firstError = pagflexResult.errors[0];
                    errorMessage = typeof firstError === 'string' ? firstError : (firstError.message || firstError);
                }
                
                // Códigos de erro
                if (pagflexResult.code || pagflexResult.error_code) {
                    errorCode = pagflexResult.code || pagflexResult.error_code;
                }
                
                // Status específicos
                if (pagflexResult.status) {
                    errorDetails = {
                        gateway_status: pagflexResult.status,
                        reason: pagflexResult.reason || pagflexResult.decline_reason || 'Não especificado'
                    };
                }
            }
            
            // Status HTTP específicos
            const httpStatusMessages = {
                400: 'Dados da requisição inválidos',
                401: 'Credenciais de API inválidas',
                403: 'Acesso negado',
                404: 'Endpoint não encontrado',
                422: 'Dados não processáveis',
                429: 'Muitas requisições, tente novamente',
                500: 'Erro interno do gateway',
                502: 'Gateway temporariamente indisponível',
                503: 'Serviço temporariamente indisponível'
            };
            
            if (httpStatusMessages[response.status]) {
                errorMessage = httpStatusMessages[response.status] + (errorMessage !== 'Transação não autorizada' ? ` - ${errorMessage}` : '');
            }
            
            return res.status(400).json({
                success: false,
                error: 'Transação rejeitada pelo gateway',
                details: {
                    message: errorMessage,
                    code: errorCode,
                    status: pagflexResult?.status,
                    http_status: response.status,
                    gateway_details: errorDetails,
                    gateway_response: pagflexResult
                },
                debug: {
                    httpStatus: response.status,
                    responseOk: response.ok,
                    hasResult: !!pagflexResult,
                    resultKeys: pagflexResult ? Object.keys(pagflexResult) : [],
                    payload_sent: {
                        amount: amount,
                        external_id: uniqueId,
                        document_type: documentType,
                        document_length: cleanDocument.length
                    }
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

        if (error.message?.includes('fetch') || error.message?.includes('network') || error.code === 'ENOTFOUND') {
            return res.status(503).json({
                success: false,
                error: 'Erro de comunicação',
                message: 'Não foi possível conectar ao gateway de pagamento',
                details: { 
                    errorType: 'network',
                    message: error.message,
                    code: error.code
                }
            });
        }

        // Erro de parsing JSON
        if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
            return res.status(502).json({
                success: false,
                error: 'Resposta inválida do gateway',
                message: 'Gateway retornou dados corrompidos',
                details: {
                    errorType: 'parse_error',
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
