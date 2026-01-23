import { WhatsAppMessage } from '../types/whatsapp.types';
import { UserSession, ConversationState, AppointmentData } from '../types/appointment.types';
import { sendTextMessage } from './whatsapp.service';
import { createAppointment, checkAvailability } from './calendar.service';

// In-memory session storage (consider using DynamoDB for production)
const sessions = new Map<string, UserSession>();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Handle incoming WhatsApp message
 */
export async function handleIncomingMessage(message: WhatsAppMessage): Promise<void> {
    const change = message.entry?.[0]?.changes?.[0];
    const value = change?.value;
    const incomingMessage = value?.messages?.[0];

    if (!incomingMessage) {
        return;
    }

    const fromRaw = incomingMessage.from;
    const fromNormalized = normalizePhoneNumber(fromRaw);
    const messageText = incomingMessage.text?.body?.trim() || '';

    console.log(`Message from ${fromRaw} (normalized: ${fromNormalized}): ${messageText}`);

    // Get or create session using normalized phone
    let session = sessions.get(fromNormalized);
    if (!session || Date.now() - session.lastInteraction > SESSION_TIMEOUT) {
        session = {
            sessionKey: fromNormalized,
            phone: fromNormalized, // Use normalized for both session and replies
            state: ConversationState.INITIAL,
            data: {},
            lastInteraction: Date.now(),
        };
        sessions.set(fromNormalized, session);
    }

    // Update last interaction
    session.lastInteraction = Date.now();

    // Process message based on conversation state
    await processMessage(session, messageText);
}

/**
 * Process message based on current conversation state
 */
async function processMessage(session: UserSession, message: string): Promise<void> {
    const lowerMessage = message.toLowerCase();

    switch (session.state) {
        case ConversationState.INITIAL:
            await handleInitialState(session, message);
            break;

        case ConversationState.WAITING_NAME:
            await handleNameInput(session, message);
            break;

        case ConversationState.WAITING_DATE:
            await handleDateInput(session, message);
            break;

        case ConversationState.WAITING_TIME:
            await handleTimeInput(session, message);
            break;

        case ConversationState.CONFIRMATION:
            await handleConfirmation(session, lowerMessage);
            break;

        default:
            await sendTextMessage(session.phone, 'Lo siento, algo salió mal. Escribe "hola" para comenzar de nuevo.');
            session.state = ConversationState.INITIAL;
    }
}

/**
 * Handle initial greeting
 */
async function handleInitialState(session: UserSession, _message: string): Promise<void> {
    const greeting = `¡Hola! 👋 Bienvenido al sistema de citas.\n\nPor favor, dime tu nombre completo para comenzar.`;

    await sendTextMessage(session.phone, greeting);
    session.state = ConversationState.WAITING_NAME;
}

/**
 * Handle name input
 */
async function handleNameInput(session: UserSession, name: string): Promise<void> {
    if (name.length < 2) {
        await sendTextMessage(session.phone, 'Por favor, proporciona tu nombre completo.');
        return;
    }

    session.data.customerName = name;
    session.data.customerPhone = session.phone;

    const datePrompt = `Perfecto, ${name}! 📅\n\nAhora, ¿qué día te gustaría agendar tu cita?\n\nPor favor usa el formato: DD/MM/AAAA\nEjemplo: 25/01/2026`;

    await sendTextMessage(session.phone, datePrompt);
    session.state = ConversationState.WAITING_DATE;
}

/**
 * Handle date input
 */
async function handleDateInput(session: UserSession, dateStr: string): Promise<void> {
    // Parse date in DD/MM/YYYY format
    const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = dateStr.match(dateRegex);

    if (!match) {
        await sendTextMessage(
            session.phone,
            'Formato de fecha inválido. Por favor usa DD/MM/AAAA\nEjemplo: 25/01/2026'
        );
        return;
    }

    const [, day, month, year] = match;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

    // Validate date
    if (isNaN(date.getTime())) {
        await sendTextMessage(session.phone, 'Fecha inválida. Por favor intenta de nuevo.');
        return;
    }

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
        await sendTextMessage(session.phone, 'No puedes agendar una cita en el pasado. Por favor selecciona una fecha futura.');
        return;
    }

    // Store date in ISO format (YYYY-MM-DD)
    session.data.appointmentDate = date.toISOString().split('T')[0];

    const timePrompt = `Excelente! ⏰\n\n¿A qué hora te gustaría tu cita?\n\nPor favor usa el formato de 24 horas: HH:MM\nEjemplo: 14:30`;

    await sendTextMessage(session.phone, timePrompt);
    session.state = ConversationState.WAITING_TIME;
}

/**
 * Handle time input
 */
async function handleTimeInput(session: UserSession, timeStr: string): Promise<void> {
    // Parse time in HH:MM format
    const timeRegex = /^(\d{1,2}):(\d{2})$/;
    const match = timeStr.match(timeRegex);

    if (!match) {
        await sendTextMessage(
            session.phone,
            'Formato de hora inválido. Por favor usa HH:MM (formato 24 horas)\nEjemplo: 14:30'
        );
        return;
    }

    const [, hours, minutes] = match;
    const hour = parseInt(hours);
    const minute = parseInt(minutes);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        await sendTextMessage(session.phone, 'Hora inválida. Por favor intenta de nuevo.');
        return;
    }

    session.data.appointmentTime = `${hours.padStart(2, '0')}:${minutes}`;

    // Check availability
    const isAvailable = await checkAvailability(
        session.data.appointmentDate!,
        session.data.appointmentTime
    );

    if (!isAvailable) {
        await sendTextMessage(
            session.phone,
            'Lo siento, ese horario no está disponible. Por favor selecciona otra hora.'
        );
        return;
    }

    // Show confirmation
    const confirmationMessage = `📋 Resumen de tu cita:\n\n👤 Nombre: ${session.data.customerName}\n📅 Fecha: ${formatDate(session.data.appointmentDate!)}\n⏰ Hora: ${session.data.appointmentTime}\n\n¿Confirmas esta cita?\nResponde "si" para confirmar o "no" para cancelar.`;

    await sendTextMessage(session.phone, confirmationMessage);
    session.state = ConversationState.CONFIRMATION;
}

/**
 * Handle confirmation
 */
async function handleConfirmation(session: UserSession, response: string): Promise<void> {
    if (response === 'si' || response === 'sí' || response === 'confirmar') {
        // Create appointment
        const appointmentData: AppointmentData = {
            customerName: session.data.customerName!,
            customerPhone: session.data.customerPhone!,
            appointmentDate: session.data.appointmentDate!,
            appointmentTime: session.data.appointmentTime!,
        };

        const result = await createAppointment(appointmentData);

        if (result.success) {
            const successMessage = `✅ ¡Cita confirmada!\n\nTu cita ha sido agendada exitosamente para el ${formatDate(appointmentData.appointmentDate)} a las ${appointmentData.appointmentTime}.\n\nRecibirás un recordatorio antes de tu cita.\n\n¡Gracias! 😊`;

            await sendTextMessage(session.phone, successMessage);
        } else {
            await sendTextMessage(
                session.phone,
                `❌ Lo siento, hubo un error al crear tu cita: ${result.message}\n\nPor favor intenta de nuevo más tarde.`
            );
        }

        // Reset session
        session.state = ConversationState.COMPLETED;
        sessions.delete(session.phone);
    } else if (response === 'no' || response === 'cancelar') {
        await sendTextMessage(
            session.phone,
            'Cita cancelada. Escribe "hola" si deseas agendar una nueva cita.'
        );
        session.state = ConversationState.INITIAL;
        sessions.delete(session.phone);
    } else {
        await sendTextMessage(
            session.phone,
            'Por favor responde "si" para confirmar o "no" para cancelar.'
        );
    }
}

/**
 * Format date for display
 */
function formatDate(isoDate: string): string {
    const date = new Date(isoDate + 'T00:00:00');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Normalize phone number to handle WhatsApp specific prefixes
 * Example: Mexican mobile numbers often come as 521XXXXXXXXXX but should be 52XXXXXXXXXX
 */
function normalizePhoneNumber(phone: string): string {
    let normalized = phone.replace(/\D/g, '');

    // Handle Mexico mobile prefix (52 + 1 + 10 digits)
    if (normalized.startsWith('521') && normalized.length === 13) {
        normalized = '52' + normalized.substring(3);
    }

    return normalized;
}
