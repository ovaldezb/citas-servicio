import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { WhatsAppMessage } from '../types/whatsapp.types';
import { handleIncomingMessage } from '../services/messageHandler'

/**
 * Lambda handler for WhatsApp webhook
 * Handles both GET (verification) and POST (messages) requests
 */
export const handler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    console.log('Webhook event:', JSON.stringify(event, null, 2));

    try {
        // Handle GET request for webhook verification
        if (event.httpMethod === 'GET') {
            return handleVerification(event);
        }

        // Handle POST request for incoming messages
        if (event.httpMethod === 'POST') {
            return await handleWebhookPost(event);
        }

        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    } catch (error) {
        console.error('Error processing webhook:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};

/**
 * Handle webhook verification from WhatsApp
 */
function handleVerification(event: APIGatewayProxyEvent): APIGatewayProxyResult {
    const mode = event.queryStringParameters?.['hub.mode'];
    const token = event.queryStringParameters?.['hub.verify_token'];
    const challenge = event.queryStringParameters?.['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('Webhook verified successfully');
        return {
            statusCode: 200,
            body: challenge || '',
        };
    }

    console.error('Webhook verification failed');
    return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Forbidden' }),
    };
}

/**
 * Handle incoming WhatsApp messages
 */
async function handleWebhookPost(
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing request body' }),
        };
    }

    const body: WhatsAppMessage = JSON.parse(event.body);

    // WhatsApp sends status updates and messages
    // We only process messages, not statuses
    if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
        await handleIncomingMessage(body);
    }

    // Always return 200 to acknowledge receipt
    return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
    };
}
