import axios from 'axios';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

/**
 * Send a text message via WhatsApp
 */
export async function sendTextMessage(to: string, message: string): Promise<void> {
    try {
        const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`;

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: {
                preview_url: false,
                body: message,
            },
        };

        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
        });

        console.log('Message sent successfully:', response.data);
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error('WhatsApp API Error Response:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('Error sending WhatsApp message:', error);
        throw error;
    }
}

/**
 * Send an interactive button message
 */
export async function sendButtonMessage(
    to: string,
    bodyText: string,
    buttons: { id: string; title: string }[]
): Promise<void> {
    try {
        const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`;

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: bodyText,
                },
                action: {
                    buttons: buttons.map((btn) => ({
                        type: 'reply',
                        reply: {
                            id: btn.id,
                            title: btn.title,
                        },
                    })),
                },
            },
        };

        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
        });

        console.log('Button message sent successfully:', response.data);
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error('WhatsApp API Error Response:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('Error sending button message:', error);
        throw error;
    }
}

/**
 * Mark a message as read
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
    try {
        const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`;

        const payload = {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
        };

        await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
        });

        console.log('Message marked as read:', messageId);
    } catch (error) {
        console.error('Error marking message as read:', error);
        // Don't throw - this is not critical
    }
}
