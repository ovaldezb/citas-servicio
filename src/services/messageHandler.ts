import { WhatsAppMessage } from '../types/whatsapp.types';
import { UserSession, ConversationState, AppointmentData } from '../types/appointment.types';
import { sendTextMessage, sendButtonMessage } from './whatsapp.service';
import { createAppointment, checkAvailability, cancelAppointment } from './calendar.service';
import { getAppointmentById, cancelAppointmentById } from './database.service';


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

    // Extract message text or button reply ID
    let messageText = '';
    if (incomingMessage.type === 'text') {
        messageText = incomingMessage.text?.body?.trim() || '';
    } else if (incomingMessage.type === 'interactive') {
        messageText = incomingMessage.interactive?.button_reply?.id || '';
    }

    console.log(`Message from ${fromRaw} (normalized: ${fromNormalized}, type: ${incomingMessage.type}): ${messageText}`);


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

    // Check for cancellation command
    if (lowerMessage.startsWith('cancelar')) {
        await handleCancellationRequest(session, message);
        return;
    }

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

        case ConversationState.CANCELLATION_CONFIRMATION:
            await handleCancellationConfirmation(session, lowerMessage);
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
    const availabilityResult = await checkAvailability(
        session.data.appointmentDate!,
        session.data.appointmentTime
    );

    if (availabilityResult.error) {
        await sendTextMessage(
            session.phone,
            `❌ ${availabilityResult.error}\n\nPor favor intenta de nuevo más tarde o contacta al administrador.`
        );
        return;
    }

    if (!availabilityResult.available) {
        await sendTextMessage(
            session.phone,
            'Lo siento, ese horario no está disponible. Por favor selecciona otra hora.'
        );
        return;
    }

    // Show confirmation with buttons
    const confirmationBody = `📋 Resumen de tu cita:\n\n👤 Nombre: ${session.data.customerName}\n📅 Fecha: ${formatDate(session.data.appointmentDate!)}\n⏰ Hora: ${session.data.appointmentTime}\n\n¿Confirmas esta cita?`;

    await sendButtonMessage(
        session.phone,
        confirmationBody,
        [
            { id: 'confirm_yes', title: 'Confirmar ✅' },
            { id: 'confirm_no', title: 'Cancelar ❌' }
        ]
    );
    session.state = ConversationState.CONFIRMATION;
}


/**
 * Handle confirmation
 */
async function handleConfirmation(session: UserSession, response: string): Promise<void> {
    if (response === 'confirm_yes' || response === 'si' || response === 'sí' || response === 'confirmar') {

        // Create appointment
        const appointmentData: AppointmentData = {
            customerName: session.data.customerName!,
            customerPhone: session.data.customerPhone!,
            appointmentDate: session.data.appointmentDate!,
            appointmentTime: session.data.appointmentTime!,
        };

        const result = await createAppointment(appointmentData);

        if (result.success) {
            let successMessage = `✅ ¡Cita confirmada!\n\n`;

            // Add appointment ID if available
            if (result.appointmentId) {
                successMessage += `📋 ID de Cita: ${result.appointmentId}\n\n`;
            }

            successMessage += `Tu cita ha sido agendada exitosamente para el ${formatDate(appointmentData.appointmentDate)} a las ${appointmentData.appointmentTime}.\n\nRecibirás un recordatorio antes de tu cita.\n\n¡Gracias! 😊`;

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
    } else if (response === 'confirm_no' || response === 'no' || response === 'cancelar') {

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

/**
 * Handle cancellation request
 */
async function handleCancellationRequest(session: UserSession, message: string): Promise<void> {
    // Extract appointment ID from message
    // Expected format: "cancelar A3B7C9" or just "cancelar A3B7C9"
    const parts = message.trim().split(/\s+/);

    if (parts.length < 2) {
        await sendTextMessage(
            session.phone,
            'Para cancelar una cita, envía: cancelar [ID]\n\nEjemplo: cancelar A3B7C9'
        );
        return;
    }

    const appointmentId = parts[1].toUpperCase();

    // Validate appointment ID format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(appointmentId)) {
        await sendTextMessage(
            session.phone,
            'ID de cita inválido. Debe ser de 6 caracteres.\n\nEjemplo: A3B7C9'
        );
        return;
    }

    // Get appointment from database
    const appointment = await getAppointmentById(appointmentId);

    if (!appointment) {
        await sendTextMessage(
            session.phone,
            `❌ No se encontró ninguna cita con el ID: ${appointmentId}\n\nVerifica el ID e intenta de nuevo.`
        );
        return;
    }

    // Verify the appointment belongs to this user
    if (appointment.customerPhone !== session.phone) {
        await sendTextMessage(
            session.phone,
            `❌ Esta cita no te pertenece.`
        );
        return;
    }

    // Check if appointment is already cancelled
    if (appointment.status === 'CANCELADA') {
        await sendTextMessage(
            session.phone,
            `❌ Esta cita ya fue cancelada anteriormente.`
        );
        return;
    }

    // Store appointment ID in session for confirmation
    session.data.appointmentId = appointmentId;

    // Ask for confirmation
    const confirmationMessage = `📋 Cita encontrada:\n\n` +
        `ID: ${appointment.appointmentId}\n` +
        `Nombre: ${appointment.customerName}\n` +
        `Fecha: ${formatDate(appointment.eventDate)}\n` +
        `Hora: ${appointment.eventTime}\n\n` +
        `¿Estás seguro de que deseas cancelar esta cita?`;

    await sendButtonMessage(
        session.phone,
        confirmationMessage,
        [
            { id: 'cancel_yes', title: 'Sí, cancelar' },
            { id: 'cancel_no', title: 'No' }
        ]
    );

    session.state = ConversationState.CANCELLATION_CONFIRMATION;
}

/**
 * Handle cancellation confirmation
 */
async function handleCancellationConfirmation(session: UserSession, response: string): Promise<void> {
    console.log(`handleCancellationConfirmation called with response: "${response}", session state: ${session.state}`);

    if (response === 'cancel_yes' || response === 'si' || response === 'sí') {
        const appointmentId = session.data.appointmentId;

        if (!appointmentId) {
            await sendTextMessage(session.phone, 'Error: No se encontró el ID de la cita.');
            session.state = ConversationState.INITIAL;
            return;
        }

        console.log(`Cancelling appointment: ${appointmentId}`);

        // Update status to CANCELADA in MongoDB
        const dbResult = await cancelAppointmentById(appointmentId);

        if (!dbResult.success || !dbResult.appointment) {
            await sendTextMessage(
                session.phone,
                `❌ Error al cancelar la cita: ${dbResult.error || 'Unknown error'}`
            );
            session.state = ConversationState.INITIAL;
            return;
        }

        console.log(`MongoDB updated successfully, now deleting from Calendar`);

        // Delete from Google Calendar
        const calendarResult = await cancelAppointment(dbResult.appointment.eventId);

        if (calendarResult.success) {
            console.log(`Calendar event deleted successfully`);
            await sendTextMessage(
                session.phone,
                `✅ Tu cita ${appointmentId} ha sido cancelada exitosamente.\n\n` +
                `La cita ha sido eliminada de tu calendario.\n\n` +
                `Si necesitas agendar una nueva cita, escribe "hola".`
            );
        } else {
            console.log(`Calendar deletion failed: ${calendarResult.error}`);
            await sendTextMessage(
                session.phone,
                `⚠️ La cita fue marcada como cancelada, pero hubo un problema al eliminarla del calendario.\n\n` +
                `Por favor contacta al administrador.`
            );
        }

        // Reset session
        session.state = ConversationState.COMPLETED;
        sessions.delete(session.phone);
        console.log(`Session deleted, cancellation complete`);
    } else if (response === 'cancel_no' || response === 'no') {
        await sendTextMessage(
            session.phone,
            'Cancelación abortada. Tu cita sigue activa.\n\nEscribe "hola" si necesitas ayuda.'
        );
        session.state = ConversationState.INITIAL;
        sessions.delete(session.phone);
    } else {
        console.log(`Unexpected response in cancellation confirmation: "${response}"`);
        await sendTextMessage(
            session.phone,
            'Por favor responde "si" para confirmar la cancelación o "no" para mantener la cita.'
        );
    }
}
