import { MongoClient, Collection } from 'mongodb';
import {
    ServiceAccountDocument,
    AccountStatus,
    DaySchedule,
    CreateAccountRequest,
    UpdateAccountRequest,
    AccountResponse
} from '../types/account.types';

// Reuse MongoDB client from database.service
let accountsCollection: Collection<ServiceAccountDocument> | null = null;

/**
 * Get default 7-day schedule template
 */
export function getDefaultSchedule(): DaySchedule[] {
    return [
        { day_name: 'Lunes', enabled: true, init_time: '12:00', end_time: '18:00', day_of_week: 1 },
        { day_name: 'Martes', enabled: true, init_time: '12:00', end_time: '18:00', day_of_week: 2 },
        { day_name: 'Miércoles', enabled: true, init_time: '12:00', end_time: '18:00', day_of_week: 3 },
        { day_name: 'Jueves', enabled: true, init_time: '12:00', end_time: '18:00', day_of_week: 4 },
        { day_name: 'Viernes', enabled: true, init_time: '12:00', end_time: '18:00', day_of_week: 5 },
        { day_name: 'Sábado', enabled: true, init_time: '12:00', end_time: '18:00', day_of_week: 6 },
        { day_name: 'Domingo', enabled: true, init_time: '12:00', end_time: '18:00', day_of_week: 7 },
    ];
}

/**
 * Get service accounts collection
 */
async function getAccountsCollection(): Promise<Collection<ServiceAccountDocument>> {
    if (accountsCollection) {
        return accountsCollection;
    }

    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DATABASE;

    if (!uri || !dbName) {
        throw new Error('MongoDB configuration not set');
    }

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    accountsCollection = db.collection<ServiceAccountDocument>('service_accounts');

    return accountsCollection;
}

/**
 * Create a new service account
 */
export async function createAccount(data: CreateAccountRequest): Promise<AccountResponse> {
    try {
        const collection = await getAccountsCollection();
        const now = new Date();

        // Check if account already exists
        const existing = await collection.findOne({ receiverPhone: data.receiverPhone });
        if (existing) {
            return {
                success: false,
                error: 'Account with this phone number already exists',
            };
        }

        const account: ServiceAccountDocument = {
            receiverPhone: data.receiverPhone,
            user_name: data.user_name,
            account_status: data.account_status || AccountStatus.ACTIVE,
            active_days: data.active_days || getDefaultSchedule(),
            createdAt: now,
            updatedAt: now,
        };

        await collection.insertOne(account as any);

        console.log(`Service account created: ${data.receiverPhone}`);

        return {
            success: true,
            account,
            message: 'Account created successfully',
        };
    } catch (error) {
        console.error('Error creating account:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Get account by phone number
 */
export async function getAccountByPhone(phone: string): Promise<AccountResponse> {
    try {
        const collection = await getAccountsCollection();
        const account = await collection.findOne({ receiverPhone: phone });

        if (!account) {
            return {
                success: false,
                error: 'Account not found',
            };
        }

        return {
            success: true,
            account,
        };
    } catch (error) {
        console.error('Error getting account:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Get all service accounts
 */
export async function getAllAccounts(): Promise<AccountResponse> {
    try {
        const collection = await getAccountsCollection();
        const accounts = await collection.find({}).toArray();

        return {
            success: true,
            accounts,
            count: accounts.length,
        };
    } catch (error) {
        console.error('Error getting accounts:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Update service account
 */
export async function updateAccount(phone: string, data: UpdateAccountRequest): Promise<AccountResponse> {
    try {
        const collection = await getAccountsCollection();
        const now = new Date();

        // Check if account exists
        const existing = await collection.findOne({ receiverPhone: phone });
        if (!existing) {
            return {
                success: false,
                error: 'Account not found',
            };
        }

        // Build update object
        const updateData: any = {
            updatedAt: now,
        };

        if (data.user_name !== undefined) {
            updateData.user_name = data.user_name;
        }
        if (data.account_status !== undefined) {
            updateData.account_status = data.account_status;
        }
        if (data.active_days !== undefined) {
            updateData.active_days = data.active_days;
        }

        await collection.updateOne(
            { receiverPhone: phone },
            { $set: updateData }
        );

        // Get updated account
        const updatedAccount = await collection.findOne({ receiverPhone: phone });

        console.log(`Service account updated: ${phone}`);

        return {
            success: true,
            account: updatedAccount || undefined,
            message: 'Account updated successfully',
        };
    } catch (error) {
        console.error('Error updating account:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Delete service account
 */
export async function deleteAccount(phone: string): Promise<AccountResponse> {
    try {
        const collection = await getAccountsCollection();

        // Check if account exists
        const existing = await collection.findOne({ receiverPhone: phone });
        if (!existing) {
            return {
                success: false,
                error: 'Account not found',
            };
        }

        await collection.deleteOne({ receiverPhone: phone });

        console.log(`Service account deleted: ${phone}`);

        return {
            success: true,
            message: 'Account deleted successfully',
        };
    } catch (error) {
        console.error('Error deleting account:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
