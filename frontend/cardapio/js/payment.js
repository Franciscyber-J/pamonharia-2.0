// frontend/cardapio/js/payment.js
console.log('[payment.js] Módulo iniciado.');
import { state } from './main.js';
import { dom, showErrorModal, showSuccessScreen } from './ui.js';
import { apiFetch } from './api.js';
import { clearCart } from './cart.js';

export async function initializeCardPaymentForm() {
    console.log('[Payment] Inicializando formulário do cartão de crédito.');
    dom.customPaymentContainer.style.display = 'block';

    if (window.cardForm) {
        try { window.cardForm.unmount(); } catch (e) { console.warn("Não foi possível desmontar o formulário de cartão anterior.", e); }
    }

    try {
        const cardForm = await state.mp.cardForm({
            amount: String(state.orderData.total_price),
            iframe: true,
            form: {
                id: 'card-payment-form',
                cardNumber: { id: 'cardNumber' },
                expirationDate: { id: 'expirationDate' },
                securityCode: { id: 'securityCode' },
                cardholderName: { id: 'cardholderName' },
                cardholderEmail: { id: 'cardholderEmail' },
                identificationType: { id: 'identificationType' },
                identificationNumber: { id: 'identificationNumber' },
                issuer: { id: 'issuer' },
                installments: { id: 'installments' }
            },
            callbacks: {
                onFormMounted: error => { if (error) console.error('Erro ao montar o formulário do Mercado Pago:', error) },
                onSubmit: handleCardFormSubmit,
                onError: (errors) => { 
                    const firstError = errors[0];
                    if (firstError) {
                         showErrorModal('Erro no Cartão', firstError.message);
                    }
                }
            },
        });
        window.cardForm = cardForm;
    } catch (e) {
        console.error('Falha crítica ao inicializar o CardForm:', e);
        showErrorModal('Erro Crítico', 'Não foi possível inicializar o formulário de pagamento. Por favor, recarregue a página.');
    }
}


async function handleCardFormSubmit(event) {
    event.preventDefault();
    console.log('[Payment] Submetendo pagamento com cartão...');
    dom.paymentProcessingOverlay.style.display = 'flex';

    try {
        const {
            paymentMethodId: payment_method_id,
            issuerId: issuer_id,
            cardholderEmail: email,
            amount,
            token,
            installments,
            identificationNumber,
            identificationType,
        } = window.cardForm.getCardFormData();

        const paymentData = {
            order_id: state.currentOrder.id,
            token,
            payment_method_id,
            issuer_id: issuer_id,
            installments: 1, 
            payment_type: 'credit_card',
            payer: {
                email,
                identification: {
                    type: identificationType,
                    number: identificationNumber,
                },
            },
        };
        
        const paymentResponse = await apiFetch('/payments/process', {
            method: 'POST',
            body: JSON.stringify(paymentData)
        });
        console.log('[Payment] Resposta do processamento recebida:', paymentResponse);
        dom.paymentProcessingOverlay.style.display = 'none';

        if (paymentResponse.status === 'approved') {
            showSuccessScreen(
                'Pagamento Aprovado!',
                `O seu pedido #${state.currentOrder.id} foi confirmado com sucesso e já está em preparação.`
            );
            clearCart(false);
        } else {
            showErrorModal('Pagamento Recusado', `Status: ${paymentResponse.status}. Motivo: ${paymentResponse.message || 'Verifique os dados do cartão.'}`);
        }

    } catch (error) {
        dom.paymentProcessingOverlay.style.display = 'none';
        const detail = error.details || error.message || 'Não foi possível processar o pagamento.';
        console.error('[Payment] ❌ Erro ao submeter pagamento:', detail);
        dom.cardPaymentFeedback.textContent = `Erro: ${detail}`;
    }
}


export function handleBackToCart() {
    console.log('[UI] Navegando de volta para o carrinho.');
    dom.onlinePaymentMethodSelection.style.display = 'none';
    dom.orderForm.style.display = 'block';
    dom.submitOrderBtn.disabled = false;
    dom.submitOrderBtn.textContent = 'Finalizar Pedido';
}


export function handleBackToPaymentSelection() {
    console.log('[UI] Navegando de volta para a seleção de método de pagamento.');
    dom.customPaymentContainer.style.display = 'none';
    dom.pixPaymentContainer.style.display = 'none';
    dom.onlinePaymentMethodSelection.style.display = 'flex';
}

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Movida e exportada a função 'handleOnlinePaymentSelection' para este módulo.
export async function handleOnlinePaymentSelection(method) {
    console.log(`[Payment] Método de pagamento online selecionado: ${method}`);
    try {
        dom.onlinePaymentMethodSelection.style.display = 'none';
        
        if (method === 'card') {
            await initializeCardPaymentForm();
        } else if (method === 'pix') {
            dom.paymentProcessingOverlay.style.display = 'flex';
            const paymentData = {
                payment_method_id: 'pix',
                payment_type: 'pix',
                payer: { email: state.orderData.client_name.replace(/\s/g, '').toLowerCase() + '@email.com' },
                order_details: state.orderData
            };
            const paymentResponse = await apiFetch('/payments/process', { method: 'POST', body: JSON.stringify(paymentData) });
            console.log('[Payment] Resposta do PIX recebida:', paymentResponse);
            dom.paymentProcessingOverlay.style.display = 'none';
            dom.pixQrCode.src = `data:image/jpeg;base64,${paymentResponse.qr_code_base64}`;
            dom.pixCopyPaste.value = paymentResponse.qr_code;
            dom.pixPaymentContainer.style.display = 'block';
        }

    } catch (error) {
        dom.paymentProcessingOverlay.style.display = 'none';
        const errorMessage = (error?.details) || error.message || 'Erro desconhecido ao inicializar o pagamento.';
        console.error('[Payment] ❌ Falha na preparação do pagamento:', errorMessage);
        showErrorModal('Falha na Preparação do Pagamento', `Não foi possível iniciar o pagamento. Detalhe: ${errorMessage}`);
        
        dom.orderForm.style.display = 'block';
        dom.onlinePaymentMethodSelection.style.display = 'none';
        dom.submitOrderBtn.disabled = false;
        dom.submitOrderBtn.textContent = 'Finalizar Pedido';
    }
}
// ##################### FIM DA CORREÇÃO ######################