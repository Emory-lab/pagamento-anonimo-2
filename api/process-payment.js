// api/process-payment.js - Versão Debug para identificar problema

export default async function handler(req, res) {
    // Headers CORS e segurança
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    };

    // Aplicar headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    // OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).json({ message: 'OK' });
    }

    // Apenas POST
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Método não permitido'
        });
    }

    try {
        const { amount, token, customer, items, description } = req.body;

        // DEBUG: Log do payload recebido (removemos depois)
        console.log('=== DEBUG PAYLOAD ===');
        console.log('Amount:', amount);
        console.log('Token length:', token?.length);
        console.log('Customer:', customer);
        console.log('Items:', items);
        console.log('=====================');

        // Validações
        if (!amount || !token || !customer || !items) {
            return res.status(400).json({
                success: false,
                error: 'Dados obrigatórios ausentes',
                debug: {
                    amount: !!amount,
                    token: !!token,
                    customer: !!customer,
                    items: !!items
                }
            });
        }

        // Suas chaves PagFlex
        const PUBLIC_KEY = "pk_Lb36FpUkSiXw24roWxzJ6jofpb2MvV8A9y8ecIyPZWwRsCKC";
        const SECRET_KEY = "sk_8zwofVumfAPF1HlLoq3VoKrecvUlQ17JR8b2Nos9XdBUPtS-";

        // Formatar payload exatamente como PagFlex espera
        const pagflexPayload = {
            amount: parseInt(amount), // Garantir que é número
            payment_method: "credit_card", // underscore, não camelCase
            token: token,
            customer: {
                name: String(customer.name).trim(),
                email: String(customer.email).trim().toLowerCase(),
                document: String(customer.document).replace(/[^0-9]/g, '') // só números
            },
            items: items.map(item => ({
                name: String(item.name || 'Produto').trim(),
                quantity: parseInt(item.quantity) || 1,
                price: parseInt(item.price || amount)
            }))
        };

        // Adicionar descrição se houver
        if (description && description.trim()) {
            pagflexPayload.description = String(description).trim();
        }

        // DEBUG: Log do payload formatado
        console.log('=== DEBUG PAGFLEX PAYLOAD ===');
        console.log(JSON.stringify(pagflexPayload, null, 2));
        console.log('=============================');

        // Criar Basic Auth
        const credentials = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');

        // Headers para PagFlex
        const pagflexHeaders = {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
            'User-Agent': 'AnonymousPayment/1.0'
        };

        // Requisição para PagFlex
        console.log('=== FAZENDO REQUISIÇÃO PARA PAGFLEX ===');
        const response = await fetch('https://api.pagflexbr.com/v1/transactions', {
            method: 'POST',
            headers: pagflexHeaders,
            body: JSON.stringify(pagflexPayload),
        });

        // DEBUG: Log da resposta
        console.log('Status:', response.status);
        console.log('Headers:', Object.fromEntries(response.headers.entries()));

        const responseText = await response.text();
        console.log('Response Body:', responseText);

        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.log('Erro ao fazer parse do JSON:', parseError);
            result = { message: responseText };
        }

        if (response.ok) {
            // Sucesso
            return res.status(200).json({
                success: true,
                transaction_id: result.id,
                status: result.status,
                amount: result.amount,
                data: result
            });
        } else {
            // Erro - retornar detalhes para debug
            return res.status(400).json({
                success: false,
                error: 'Pagamento não autorizado',
                debug_info: {
                    status: response.status,
                    pagflex_response: result,
                    sent_payload: pagflexPayload // REMOVER depois do debug
                },
                details: {
                    message: result.message || result.error || 'Requisição com valores inválidos.'
                }
            });
        }

    } catch (error) {
        console.error('Erro na API:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            debug_error: error.message // REMOVER depois do debug
        });
    }
}
