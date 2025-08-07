// api/process-payment.js - Implementação correta baseada na documentação oficial PagFlex
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

        if (!cardData || !cardData.number || !cardData.holderName || !cardData.expMonth || !cardData.expYear || !cardData.cvv) {
            return res.status(400).json({
                success: false,
                error: 'Dados do cartão são obrigatórios (number, holderName, expMonth, expYear, cvv)'
            });
        }

        // Chaves PagFlex
        const PUBLIC_KEY = "pk_Lb36FpUkSiXw24roWxzJ6jofpb2MvV8A9y8ecIyPZWwRsCKC";
        const SECRET_KEY = "sk_8zwofVumfAPF1HlLoq3VoKrecvUlQ17JR8b2Nos9XdBUPtS-";

        // Criar autenticação Basic conforme documentação
        const auth = 'Basic ' + Buffer.from(PUBLIC_KEY + ':' + SECRET_KEY).toString('base64');
        
        console.log('Autenticação criada:', auth.substring(0, 20) + '...');

        // Preparar documento (apenas números)
        const cleanDocument = customer.document.replace(/[^0-9]/g, '');
        
        // Payload corrigido baseado nos erros de validação do PagFlex
        const pagflexPayload = {
            amount: amount, // Valor em centavos
            paymentMethod: 'credit_card',
            installments: 1, // Número de parcelas obrigatório
            token: token, // Token criptografado do cartão
            card: {
                token: token, // Token para segurança
                number: cardData.number.replace(/\s/g, ''), // Número do cartão sem espaços
                holderName: cardData.holderName.trim(), // Nome do titular
                expirationMonth: parseInt(cardData.expMonth), // Mês de expiração
                expirationYear: parseInt(cardData.expYear), // Ano de expiração
                cvv: cardData.cvv // CVV
            },
            customer: {
                name: customer.name.trim(),
                email: customer.email.toLowerCase().trim(),
                document: {
                    number: cleanDocument,
                    type: cleanDocument.length === 11 ? 'cpf' : 'cnpj'
                },
                phone: "5511999999999" // String simples como esperado
            },
            billing: {
                name: customer.name.trim(),
                email: customer.email.toLowerCase().trim()
            },
            items: items.map(item => ({
                title: String(item.name).substring(0, 50), // 'title' em vez de 'name'
                quantity: parseInt(item.quantity) || 1,
                unitPrice: parseInt(item.price) || Math.floor(amount / items.length), // 'unitPrice' em vez de 'amount'
                tangible: true, // Campo obrigatório - produto físico (true) ou digital (false)
                category: "others" // Categoria do produto
            }))
        };

        // Adicionar descrição opcional
        if (description && description.trim()) {
            pagflexPayload.description = description.trim().substring(0, 100);
        }

        // Adicionar ID único da transação
        pagflexPayload.orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log('Payload corrigido para PagFlex:', JSON.stringify(pagflexPayload, null, 2));
        console.log('Validações do payload:');
        console.log('- Customer document é objeto?', typeof pagflexPayload.customer.document === 'object');
        console.log('- Items[0] tem title?', !!pagflexPayload.items[0]?.title);
        console.log('- Items[0] tem unitPrice?', !!pagflexPayload.items[0]?.unitPrice);
        console.log('- Items[0] tem tangible?', pagflexPayload.items[0]?.tangible !== undefined);

        // URL da API conforme documentação
        const apiUrl = 'https://api.pagflexbr.com/v1/transactions';

        // Headers conforme a documentação oficial
        const headers = {
            'Authorization': auth,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'PagFlex-Integration/1.0'
        };

        console.log('Fazendo requisição para:', apiUrl);
        console.log('Headers:', { ...headers, Authorization: headers.Authorization.substring(0, 20) + '...' });

        // Fazer requisição para PagFlex com timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 segundos

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(pagflexPayload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log('Resposta PagFlex:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });

        // Pegar o texto da resposta
        const responseText = await response.text();
        console.log('Corpo da resposta:', responseText);

        if (!responseText) {
            console.log('Resposta vazia do PagFlex');
            return res.status(500).json({
                success: false,
                error: 'Resposta vazia do gateway de pagamento',
                details: {
                    status: response.status,
                    statusText: response.statusText
                }
            });
        }

        // Tentar parsear como JSON
        let pagflexResult;
        try {
            pagflexResult = JSON.parse(responseText);
            console.log('Resposta JSON parseada:', pagflexResult);
        } catch (parseError) {
            console.error('Erro ao parsear JSON:', parseError.message);
            console.log('Conteúdo que falhou:', responseText.substring(0, 200));
            
            return res.status(500).json({
                success: false,
                error: 'Resposta inválida do gateway',
                details: {
                    message: 'Gateway retornou dados em formato inválido',
                    preview: responseText.substring(0, 100)
                }
            });
        }

        // Verificar se a transação foi aprovada
        if (response.ok && pagflexResult) {
            console.log('✅ Transação processada com sucesso');
            
            return res.status(200).json({
                success: true,
                transaction_id: pagflexResult.id || pagflexResult.transactionId || pagflexPayload.orderId,
                status: pagflexResult.status || 'approved',
                amount: pagflexResult.amount || amount,
                data: {
                    id: pagflexResult.id || pagflexResult.transactionId,
                    status: pagflexResult.status || 'approved',
                    amount: pagflexResult.amount || amount,
                    created_at: pagflexResult.createdAt || pagflexResult.created_at || new Date().toISOString(),
                    payment_method: 'credit_card',
                    gateway: 'pagflex'
                }
            });
        } else {
            // Erro na transação
            console.log('❌ Transação rejeitada pelo PagFlex');
            console.log('Detalhes do erro:', pagflexResult);
            
            return res.status(400).json({
                success: false,
                error: 'Transação rejeitada pelo gateway',
                details: {
                    message: pagflexResult.message || pagflexResult.error || 'Transação não autorizada',
                    code: pagflexResult.code || pagflexResult.errorCode || response.status,
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
        if (error.message.includes('fetch')) {
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
