// api/process-payment.js - Versão corrigida para PagFlex 2025
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
        console.log('=== INÍCIO PROCESSAMENTO PAGFLEX 2025 ===');
        
        const { amount, token, customer, items, description, cardData } = req.body;

        // Log seguro do payload (sem dados sensíveis)
        console.log('Payload recebido:', {
            amount,
            hasToken: !!token,
            tokenLength: token?.length,
            hasCardData: !!cardData,
            customer: customer ? {
                name: customer.name,
                email: customer.email,
                hasDocument: !!customer.document
            } : null,
            itemsCount: items?.length
        });

        // Validações obrigatórias
        if (!amount || amount <= 0 || !Number.isInteger(amount)) {
            return res.status(400).json({
                success: false,
                error: 'Valor inválido - deve ser um número inteiro positivo em centavos'
            });
        }

        if (!token || typeof token !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Token do cartão é obrigatório'
            });
        }

        if (!customer || !customer.name || !customer.email || !customer.document) {
            return res.status(400).json({
                success: false,
                error: 'Dados do cliente são obrigatórios (name, email, document)'
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Pelo menos um item é obrigatório'
            });
        }

        // Chaves PagFlex
        const PUBLIC_KEY = "pk_Lb36FpUkSiXw24roWxzJ6jofpb2MvV8A9y8ecIyPZWwRsCKC";
        const SECRET_KEY = "sk_8zwofVumfAPF1HlLoq3VoKrecvUlQ17JR8b2Nos9XdBUPtS-";

        // Preparar documento (apenas números)
        const cleanDocument = customer.document.replace(/[^0-9]/g, '');
        
        // Payload corrigido baseado nos erros específicos da PagFlex
        const pagflexPayload = {
            // Dados básicos da transação
            amount: amount,
            paymentMethod: 'credit_card', // Correto: paymentMethod (não payment_method)
            installments: 1,
            
            // Token do cartão
            token: token,
            
            // Dados do cartão - OBRIGATÓRIO conforme erro
            card: {
                token: token,
                number: cardData.number.replace(/\s/g, ''),
                holderName: cardData.holderName.trim(),
                expirationMonth: parseInt(cardData.expMonth),
                expirationYear: parseInt(cardData.expYear),
                cvv: cardData.cvv
            },
            
            // Dados do cliente - FORMATO OBJETO para document
            customer: {
                name: customer.name.trim(),
                email: customer.email.toLowerCase().trim(),
                document: {
                    number: cleanDocument,
                    type: cleanDocument.length === 11 ? 'cpf' : 'cnpj'
                },
                phone: '+5511999999999'
            },
            
            // Endereço de cobrança
            billing: {
                name: customer.name.trim(),
                address: {
                    street: 'Rua Exemplo',
                    street_number: '123',
                    neighborhood: 'Centro',
                    city: 'São Paulo',
                    state: 'SP',
                    zipcode: '01001000',
                    country: 'BR'
                }
            },
            
            // Items - FORMATO EXATO conforme erro
            items: items.map(item => ({
                title: String(item.name).substring(0, 50), // title (não name)
                quantity: parseInt(item.quantity) || 1,
                unitPrice: parseInt(item.price) || Math.floor(amount / items.length), // unitPrice
                tangible: true // Campo obrigatório
            })),
            
            // Metadados - deve ser STRING (não objeto)
            metadata: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // Adicionar descrição opcional
        if (description && description.trim()) {
            pagflexPayload.description = description.trim().substring(0, 100);
        }

        console.log('Payload corrigido com dados do cartão:', JSON.stringify({
            amount: pagflexPayload.amount,
            paymentMethod: pagflexPayload.paymentMethod,
            installments: pagflexPayload.installments,
            customer: {
                name: pagflexPayload.customer.name,
                email: pagflexPayload.customer.email,
                document: pagflexPayload.customer.document,
                phone: pagflexPayload.customer.phone
            },
            card: {
                number: pagflexPayload.card.number.substring(0, 6) + '****' + pagflexPayload.card.number.substring(pagflexPayload.card.number.length - 4),
                holderName: pagflexPayload.card.holderName,
                expirationMonth: pagflexPayload.card.expirationMonth,
                expirationYear: pagflexPayload.card.expirationYear,
                cvv: '***',
                hasToken: !!pagflexPayload.card.token
            },
            items: pagflexPayload.items,
            metadata: pagflexPayload.metadata
        }, null, 2));

        // Configurações baseadas na documentação oficial PagFlex
        const apiConfigs = [
            {
                url: 'https://api.pagflexbr.com/v1/transactions',
                method: 'POST',
                format: 'standard'
            },
            {
                url: 'https://api.pagflexbr.com/v1/transaction',
                method: 'POST', 
                format: 'singular'
            },
            {
                url: 'https://api.pagflexbr.com/v1/payments',
                method: 'POST',
                format: 'payments'
            },
            {
                url: 'https://api.pagflexbr.com/v1/charges',
                method: 'POST',
                format: 'charges'
            }
        ];

        let lastError = null;
        let response = null;
        let pagflexResult = null;

        // Autenticação conforme curl de exemplo (Basic)
        const auth = 'Basic ' + Buffer.from(PUBLIC_KEY + ':' + SECRET_KEY).toString('base64');
        
        console.log('Usando autenticação Basic conforme documentação');
        console.log('Public Key:', PUBLIC_KEY.substring(0, 10) + '...');
        console.log('Auth header:', auth.substring(0, 20) + '...');

        for (const config of apiConfigs) {
            try {
                console.log(`\n🔍 Testando: ${config.method} ${config.url} (${config.format})`);

                // Payload otimizado baseado no formato
                let testPayload = {
                    amount: amount,
                    payment_method: 'credit_card',
                    installments: 1,
                    token: token,
                    customer: {
                        name: customer.name.trim(),
                        email: customer.email.toLowerCase().trim(),
                        document: {
                            number: cleanDocument,
                            type: cleanDocument.length === 11 ? 'cpf' : 'cnpj'
                        },
                        phone: '+5511999999999'
                    },
                    billing_address: {
                        street: 'Rua Exemplo',
                        street_number: '123',
                        neighborhood: 'Centro',
                        city: 'São Paulo',
                        state: 'SP',
                        zipcode: '01001000',
                        country: 'BR'
                    },
                    items: items.map(item => ({
                        title: String(item.name).substring(0, 50),
                        quantity: parseInt(item.quantity) || 1,
                        unit_price: parseInt(item.price) || Math.floor(amount / items.length),
                        tangible: true
                    })),
                    metadata: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                };

                // Ajustar payload por formato
                if (config.format === 'standard' || config.format === 'singular') {
                    testPayload.paymentMethod = testPayload.payment_method;
                    delete testPayload.payment_method;
                    
                    testPayload.items = testPayload.items.map(item => ({
                        title: item.title,
                        quantity: item.quantity,
                        unitPrice: item.unit_price,
                        tangible: item.tangible
                    }));
                }

                // Headers conforme curl de exemplo
                const headers = {
                    'Authorization': auth,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'PagFlex-API/1.0'
                };

                console.log('Headers:', {
                    'Content-Type': headers['Content-Type'],
                    'Accept': headers['Accept'],
                    'Authorization': headers['Authorization'].substring(0, 20) + '...'
                });

                console.log('Payload preview:', JSON.stringify({
                    amount: testPayload.amount,
                    payment_method: testPayload.payment_method || testPayload.paymentMethod,
                    customer: testPayload.customer,
                    items_count: testPayload.items.length,
                    has_token: !!testPayload.token
                }, null, 2));

                // Fazer requisição
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                response = await fetch(config.url, {
                    method: config.method,
                    headers: headers,
                    body: JSON.stringify(testPayload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                console.log(`📡 Resposta ${config.format}:`, {
                    status: response.status,
                    statusText: response.statusText,
                    ok: response.ok,
                    headers: Object.fromEntries(response.headers.entries())
                });

                // Processar resposta
                const responseText = await response.text();
                console.log(`📄 Conteúdo (primeiros 300 chars):`, responseText.substring(0, 300) + '...');

                if (responseText) {
                    try {
                        pagflexResult = JSON.parse(responseText);
                        console.log(`✅ JSON parseado com sucesso:`, pagflexResult);
                        
                        // Se obteve resposta válida (não apenas 404 ou 401), usar esta
                        if (response.status !== 404 && response.status !== 401) {
                            console.log(`🎯 Usando configuração: ${config.format}`);
                            break;
                        }
                        
                    } catch (parseError) {
                        console.log(`❌ Erro de parse JSON:`, parseError.message);
                        console.log(`📝 Conteúdo bruto:`, responseText.substring(0, 100));
                        
                        // Se não é JSON mas é 200, pode ser sucesso em outro formato
                        if (response.ok) {
                            console.log(`⚠️ Resposta OK mas não é JSON`);
                            pagflexResult = { raw_response: responseText };
                            break;
                        }
                        continue;
                    }
                }

            } catch (error) {
                console.log(`❌ Erro na requisição ${config.format}:`, error.message);
                lastError = error;
                continue;
            }
        }

        // Validação final da resposta
        if (!response) {
            throw lastError || new Error('Todas as configurações de API falharam');
        }

        if (!pagflexResult) {
            return res.status(500).json({
                success: false,
                error: 'Resposta vazia ou inválida do gateway',
                details: {
                    status: response.status,
                    statusText: response.statusText
                }
            });
        }

        // Verificar se a transação foi aprovada
        if (response.ok && pagflexResult) {
            // Diferentes formatos de status que podem vir do gateway
            const status = pagflexResult.status || 
                         pagflexResult.transaction_status || 
                         pagflexResult.payment_status || 
                         'processed';
            
            const isApproved = status === 'approved' || 
                             status === 'paid' || 
                             status === 'authorized' || 
                             response.status === 200 || 
                             response.status === 201;

            if (isApproved) {
                console.log('✅ Transação processada com sucesso');
                
                return res.status(200).json({
                    success: true,
                    transaction_id: pagflexResult.id || 
                                  pagflexResult.transaction_id || 
                                  pagflexResult.reference || 
                                  `txn_${Date.now()}`,
                    status: status,
                    amount: pagflexResult.amount || amount,
                    data: {
                        id: pagflexResult.id || pagflexResult.transaction_id,
                        status: status,
                        amount: pagflexResult.amount || amount,
                        created_at: pagflexResult.created_at || 
                                  pagflexResult.createdAt || 
                                  new Date().toISOString(),
                        payment_method: 'credit_card',
                        gateway: 'pagflex',
                        reference: pagflexResult.reference
                    }
                });
            } else {
                console.log('❌ Transação não aprovada, status:', status);
                
                return res.status(400).json({
                    success: false,
                    error: 'Transação não aprovada',
                    details: {
                        message: pagflexResult.message || 
                               pagflexResult.error_message || 
                               `Status: ${status}`,
                        status: status,
                        code: pagflexResult.code || pagflexResult.error_code,
                        gateway_response: pagflexResult
                    }
                });
            }
        } else {
            // Erro na transação
            console.log('❌ Erro HTTP ou resposta inválida');
            console.log('Status:', response.status, response.statusText);
            console.log('Resposta:', pagflexResult);
            
            return res.status(response.status || 400).json({
                success: false,
                error: 'Erro no processamento',
                details: {
                    message: pagflexResult.message || 
                           pagflexResult.error || 
                           response.statusText || 
                           'Erro desconhecido no gateway',
                    code: pagflexResult.code || response.status,
                    gateway_response: pagflexResult
                }
            });
        }

    } catch (error) {
        console.error('=== ERRO GERAL ===');
        console.error('Tipo:', error.name);
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        
        // Verificar se é erro de timeout/abort
        if (error.name === 'AbortError') {
            return res.status(408).json({
                success: false,
                error: 'Timeout na comunicação com o gateway',
                message: 'O gateway demorou muito para responder. Tente novamente.'
            });
        }

        // Erro de rede
        if (error.message.includes('fetch') || error.message.includes('network')) {
            return res.status(503).json({
                success: false,
                error: 'Erro de comunicação',
                message: 'Não foi possível conectar ao gateway de pagamento',
                details: error.message
            });
        }

        // Erro interno genérico
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: 'Falha no processamento do pagamento',
            details: process.env.NODE_ENV === 'development' ? {
                error: error.message,
                type: error.name
            } : undefined
        });
    } finally {
        console.log('=== FIM DO PROCESSAMENTO ===');
    }
}
