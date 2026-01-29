import { google, calendar_v3 } from 'googleapis';
import { AppointmentData, AppointmentResponse } from '../types/appointment.types';
import { saveAppointment } from './database.service';

let calendarClient: calendar_v3.Calendar | null = null;

/**
 * Initialize Google Calendar client with service account credentials
 */
async function getCalendarClient(): Promise<calendar_v3.Calendar> {
    if (calendarClient) {
        return calendarClient;
    }

    try {
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

        if (!email || !privateKey) {
            throw new Error('Google Service Account credentials (email or key) not configured');
        }

        // 1. Aggressive cleaning of the raw string
        // Remove surrounding whitespace and common copy-paste artifacts (quotes, commas)
        let cleanedKey = privateKey.trim()
            .replace(/^["']+/, '')     // Remove leading quotes
            .replace(/[,"]+$/, '')     // Remove trailing quotes and commas
            .trim();

        // 2. Handle potentially escaped newlines
        const formattedKey = cleanedKey.replace(/\\n/g, '\n');

        // Log key info for debugging (masked for security)
        console.log(`Initializing calendar with email: ${email}`);
        console.log(`Key length: ${formattedKey.length}`);
        console.log(`Key starts with: ${formattedKey.substring(0, 35).replace(/\n/g, '\\n')}...`);
        console.log(`Key ends with: ...${formattedKey.substring(formattedKey.length - 35).replace(/\n/g, '\\n')}`);

        // Create JWT auth client
        const auth = new google.auth.JWT({
            email: email,
            key: formattedKey,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });

        calendarClient = google.calendar({ version: 'v3', auth });
        return calendarClient;
    } catch (error) {
        console.error('Error initializing Google Calendar client:', error);
        throw error;
    }
}

/**
 * Create an appointment in Google Calendar
 */
export async function createAppointment(
    appointmentData: AppointmentData
): Promise<AppointmentResponse> {
    try {
        const calendar = await getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        if (!calendarId) {
            throw new Error('GOOGLE_CALENDAR_ID not configured');
        }

        // Parse date and time
        const startDateTimeStr = `${appointmentData.appointmentDate}T${appointmentData.appointmentTime}:00`;
        const startDateTime = new Date(startDateTimeStr);
        const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour duration

        // Helper to format date as YYYY-MM-DDTHH:mm:ss for Google API
        const formatLocal = (d: Date) => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        const startStr = formatLocal(startDateTime);
        const endStr = formatLocal(endDateTime);

        // Create event
        const event: calendar_v3.Schema$Event = {
            summary: `Cita - ${appointmentData.customerName}`,
            description: `Cliente: ${appointmentData.customerName}\nTeléfono: ${appointmentData.customerPhone}\n${appointmentData.serviceType ? `Servicio: ${appointmentData.serviceType}\n` : ''}${appointmentData.notes ? `Notas: ${appointmentData.notes}` : ''}`,
            start: {
                dateTime: startStr,
                timeZone: 'America/Mexico_City',
            },
            end: {
                dateTime: endStr,
                timeZone: 'America/Mexico_City',
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 60 },
                    { method: 'popup', minutes: 1440 }, // 24 hours
                ],
            },
        };

        const response = await calendar.events.insert({
            calendarId,
            requestBody: event,
        });

        console.log('Event created:', response.data);

        // Save appointment to MongoDB
        const dbResult = await saveAppointment({
            customerName: appointmentData.customerName,
            customerPhone: appointmentData.customerPhone,
            eventDate: appointmentData.appointmentDate,
            eventTime: appointmentData.appointmentTime,
            eventId: response.data.id || '',
        });

        // Log if MongoDB save failed, but don't fail the entire operation
        // since the appointment is already in Google Calendar
        if (!dbResult.success) {
            console.error('Failed to save appointment to MongoDB:', dbResult.error);
        }

        return {
            success: true,
            eventId: response.data.id || undefined,
            eventLink: response.data.htmlLink || undefined,
            appointmentId: dbResult.appointmentId,
            message: 'Cita creada exitosamente',
        };
    } catch (error) {
        console.error('Error creating appointment:', error);
        return {
            success: false,
            message: 'Error al crear la cita',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Check if a time slot is available
 */
/**
 * Check if a time slot is available
 */
export async function checkAvailability(date: string, time: string): Promise<{ available: boolean; error?: string }> {

    try {
        const calendar = await getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        if (!calendarId) {
            throw new Error('GOOGLE_CALENDAR_ID not configured');
        }

        const startDateTimeStr = `${date}T${time}:00`;
        const startDateTime = new Date(startDateTimeStr);
        const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

        // Helper to format date as YYYY-MM-DDTHH:mm:ss for Google API
        const formatLocal = (d: Date) => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        const startStr = formatLocal(startDateTime);
        const endStr = formatLocal(endDateTime);
        const offset = '-06:00'; // America/Mexico_City

        console.log(`Checking availability for: ${startStr}${offset} to ${endStr}${offset}`);

        const response = await calendar.events.list({
            calendarId,
            timeMin: `${startStr}${offset}`,
            timeMax: `${endStr}${offset}`,
            singleEvents: true,
        });

        const events = response.data.items || [];

        // Filter out cancelled events and ensure they actually overlap
        const activeEvents = events.filter(e => e.status !== 'cancelled');

        console.log(`Found ${activeEvents.length} active events in this range:`, JSON.stringify(activeEvents.map(e => ({
            summary: e.summary,
            start: e.start,
            end: e.end,
            status: e.status
        })), null, 2));

        return { available: activeEvents.length === 0 };
    } catch (error: any) {
        console.error('Error checking availability:', error);
        // Distinguish between "no events found" and "system error"
        const message = error.response?.data?.error?.message || error.message || 'Unknown error';
        return {
            available: false,
            error: `Error de Google Calendar: ${message}. Verifica que el calendario esté compartido con la Service Account.`
        };
    }
}

