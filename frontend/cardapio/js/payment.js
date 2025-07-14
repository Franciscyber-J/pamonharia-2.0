// frontend/cardapio/js/payment.js
console.log('[payment.js] Módulo iniciado.');
import { state } from './main.js';
// #################### INÍCIO DA CORREÇÃO ####################
// A importação de toggleCartModal foi removida daqui, pois não é usada.
// A lógica de UI é tratada por ui.js ou main.js.
import { dom, showErrorModal } from './ui.js';
// ##################### FIM DA CORREÇÃO ######################
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
            dom.cartWrapper.style.display = 'none';
            dom.successMessage.style.display = 'block';
            dom.successMessage.innerHTML = `<h3>Pagamento Aprovado!</h3><p>Pedido #${state.currentOrder.id} confirmado.</p>`;
            clearCart();
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