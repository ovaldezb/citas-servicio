import { MongoClient, Db, Collection } from 'mongodb';
import { AppointmentDocument, AppointmentStatus, SaveAppointmentParams, SaveAppointmentResult } from '../types/database.types';

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
export async function saveAppointment(params: SaveAppointmentParams, appointmentId: string): Promise<SaveAppointmentResult> {
    try {
        const receiverPhone = process.env.RECEIVER_PHONE;
        if (!receiverPhone) {
            throw new Error('RECEIVER_PHONE environment variable is not set');
        }

        const collection = await getAppointmentsCollection();
        const now = new Date();

        const document: Partial<AppointmentDocument> = {
            appointmentId,
            customerName: params.customerName,
            customerPhone: params.customerPhone,
            receiverPhone,
            eventDate: params.eventDate,
            eventTime: params.eventTime,
            eventId: params.eventId,
            status: AppointmentStatus.ACTIVA, // Initial status
            createdAt: now,
            updatedAt: now,
        };

        // Insert new appointment document
        await collection.insertOne(document as AppointmentDocument);

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
        return await collection.findOne({ customerPhone: phone });
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
/**
 * Cancel appointment by updating status to CANCELADA
 */
export async function cancelAppointmentById(appointmentId: string): Promise<{
    success: boolean;
    appointment?: AppointmentDocument | null;
    error?: string;
}> {
    try {
        const collection = await getAppointmentsCollection();
        
        // Find the appointment first (only if it's active)
        const appointment = await collection.findOne({ 
            appointmentId,
            status: AppointmentStatus.ACTIVA
        });
        
        if (!appointment) {
            return {
                success: false,
                error: 'Cita no encontrada o ya está cancelada',
            };
        }

        // Update status to CANCELADA
        const now = new Date();
        await collection.updateOne(
            { appointmentId },
            {
                $set: {
                    status: AppointmentStatus.CANCELADA,
                    cancelledAt: now,
                    updatedAt: now,
                }
            }
        );

        console.log(`Appointment ${appointmentId} cancelled (status updated to CANCELADA)`);

        return {
            success: true,
            appointment,
        };
    } catch (error) {
        console.error('Error cancelling appointment in MongoDB:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Get active appointments by customer phone
 */
export async function getActiveAppointmentsByPhone(phone: string): Promise<AppointmentDocument[]> {
    try {
        const collection = await getAppointmentsCollection();
        return await collection.find({ 
            customerPhone: phone,
            status: AppointmentStatus.ACTIVA 
        }).toArray();
    } catch (error) {
        console.error('Error getting active appointments by phone:', error);
        return [];
    }
}
