import { google, calendar_v3 } from 'googleapis';
import { AppointmentData, AppointmentResponse } from '../types/appointment.types';

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

        return {
            success: true,
            eventId: response.data.id || undefined,
            eventLink: response.data.htmlLink || undefined,
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
export async function checkAvailability(date: string, time: string): Promise<boolean> {
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

        console.log(`Checking availability for: ${startStr} to ${endStr} (TZ: America/Mexico_City)`);

        const response = await calendar.events.list({
            calendarId,
            timeMin: `${startStr}Z`, // Adding Z here because list API often expects offset, or we can use offset -06:00
            timeMax: `${endStr}Z`,
            singleEvents: true,
        });

        const events = response.data.items || [];
        console.log(`Found ${events.length} events in this range:`, JSON.stringify(events.map(e => ({
            summary: e.summary,
            start: e.start,
            end: e.end
        })), null, 2));

        return events.length === 0; // Available if no events found
    } catch (error) {
        console.error('Error checking availability:', error);
        return false;
    }
}
