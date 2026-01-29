import { MongoClient, Db, Collection } from 'mongodb';
import { AppointmentDocument, SaveAppointmentParams, SaveAppointmentResult } from '../types/database.types';

let mongoClient: MongoClient | null = null;
let db: Db | null = null;

/**
 * Get MongoDB client (singleton pattern for Lambda reuse)
 */
async function getMongoClient(): Promise<MongoClient> {
    if (mongoClient) {
        try {
            // Ping to check if connection is still alive
            await mongoClient.db('admin').command({ ping: 1 });
            return mongoClient;
        } catch (error) {
            console.log('Existing MongoDB connection is stale, reconnecting...');
            mongoClient = null;
        }
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('Connecting to MongoDB...');
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    console.log('MongoDB connected successfully');

    return mongoClient;
}

/**
 * Get MongoDB database instance
 */
async function getDatabase(): Promise<Db> {
    if (db) {
        return db;
    }

    const dbName = process.env.MONGODB_DATABASE;
    if (!dbName) {
        throw new Error('MONGODB_DATABASE environment variable is not set');
    }

    const client = await getMongoClient();
    db = client.db(dbName);
    return db;
}

/**
 * Get appointments collection
 */
async function getAppointmentsCollection(): Promise<Collection<AppointmentDocument>> {
    const collectionName = process.env.MONGODB_COLLECTION;
    if (!collectionName) {
        throw new Error('MONGODB_COLLECTION environment variable is not set');
    }

    const database = await getDatabase();
    return database.collection<AppointmentDocument>(collectionName);
}

/**
 * Generate a unique 6-character alphanumeric appointment ID
 * Uses characters: 0-9, A-Z (excluding ambiguous characters like O, 0, I, 1)
 */
export async function generateAppointmentId(): Promise<string> {
    // Safe characters (excluding O, I, 0, 1 to avoid confusion)
    const chars = '234567899ABCDEFGHJKLMNPQRSTUVWXYZ';
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Generate random 6-character ID
        let id = '';
        for (let i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Check if ID already exists
        const collection = await getAppointmentsCollection();
        const existing = await collection.findOne({ appointmentId: id });

        if (!existing) {
            return id;
        }

        console.log(`Appointment ID collision detected: ${id}, retrying...`);
    }

    throw new Error('Failed to generate unique appointment ID after multiple attempts');
}

/**
 * Save appointment to MongoDB
 */
export async function saveAppointment(params: SaveAppointmentParams): Promise<SaveAppointmentResult> {
    try {
        const receiverPhone = process.env.RECEIVER_PHONE;
        if (!receiverPhone) {
            throw new Error('RECEIVER_PHONE environment variable is not set');
        }

        // Generate unique appointment ID
        const appointmentId = await generateAppointmentId();

        const collection = await getAppointmentsCollection();
        const now = new Date();

        // Use updateOne with upsert to handle potential duplicates
        // If customer books another appointment, it will update the existing record
        await collection.updateOne(
            { _id: params.customerPhone },
            {
                $set: {
                    appointmentId,
                    customerName: params.customerName,
                    customerPhone: params.customerPhone,
                    receiverPhone,
                    eventDate: params.eventDate,
                    eventTime: params.eventTime,
                    eventId: params.eventId,
                    updatedAt: now,
                },
                $setOnInsert: {
                    createdAt: now
                }
            },
            { upsert: true }
        );

        console.log(`Appointment saved successfully with ID: ${appointmentId}`);

        return {
            success: true,
            appointmentId,
        };
    } catch (error) {
        console.error('Error saving appointment to MongoDB:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Get appointment by customer phone number
 */
export async function getAppointmentByPhone(phone: string): Promise<AppointmentDocument | null> {
    try {
        const collection = await getAppointmentsCollection();
        return await collection.findOne({ _id: phone });
    } catch (error) {
        console.error('Error getting appointment by phone:', error);
        return null;
    }
}

/**
 * Get appointment by appointment ID
 */
export async function getAppointmentById(appointmentId: string): Promise<AppointmentDocument | null> {
    try {
        const collection = await getAppointmentsCollection();
        return await collection.findOne({ appointmentId });
    } catch (error) {
        console.error('Error getting appointment by ID:', error);
        return null;
    }
}
