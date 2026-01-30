import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    createAccount,
    getAccountByPhone,
    getAllAccounts,
    updateAccount,
    deleteAccount,
} from '../services/account.service';
import { CreateAccountRequest, UpdateAccountRequest } from '../types/account.types';

/**
 * Lambda handler for service account CRUD operations
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log('Accounts API - Event:', JSON.stringify(event, null, 2));

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    };

    try {
        const method = event.httpMethod;
        const path = event.path;
        const phone = event.pathParameters?.phone;

        // Handle OPTIONS for CORS
        if (method === 'OPTIONS') {
            return {
                statusCode: 200,
                headers,
                body: '',
            };
        }

        // GET /accounts - List all accounts
        if (method === 'GET' && path === '/accounts') {
            const result = await getAllAccounts();
            return {
                statusCode: result.success ? 200 : 500,
                headers,
                body: JSON.stringify(result),
            };
        }

        // GET /accounts/{phone} - Get specific account
        if (method === 'GET' && phone) {
            const result = await getAccountByPhone(phone);
            return {
                statusCode: result.success ? 200 : 404,
                headers,
                body: JSON.stringify(result),
            };
        }

        // POST /accounts - Create new account
        if (method === 'POST' && path === '/accounts') {
            if (!event.body) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Request body is required',
                    }),
                };
            }

            const data: CreateAccountRequest = JSON.parse(event.body);

            // Validate required fields
            if (!data.receiverPhone || !data.user_name) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'receiverPhone and user_name are required',
                    }),
                };
            }

            const result = await createAccount(data);
            return {
                statusCode: result.success ? 201 : 400,
                headers,
                body: JSON.stringify(result),
            };
        }

        // PUT /accounts/{phone} - Update account
        if (method === 'PUT' && phone) {
            if (!event.body) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Request body is required',
                    }),
                };
            }

            const data: UpdateAccountRequest = JSON.parse(event.body);
            const result = await updateAccount(phone, data);

            return {
                statusCode: result.success ? 200 : 404,
                headers,
                body: JSON.stringify(result),
            };
        }

        // DELETE /accounts/{phone} - Delete account
        if (method === 'DELETE' && phone) {
            const result = await deleteAccount(phone);
            return {
                statusCode: result.success ? 200 : 404,
                headers,
                body: JSON.stringify(result),
            };
        }

        // Route not found
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Route not found',
            }),
        };
    } catch (error) {
        console.error('Error in accounts handler:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            }),
        };
    }
}
