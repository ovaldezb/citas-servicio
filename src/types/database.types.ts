export interface AppointmentDocument {
    appointmentId: string; // Unique 6-character alphanumeric ID
    customerName: string;
    customerPhone: string; // Customer's phone number
    receiverPhone: string; // Professional/business phone receiving the appointment
    eventDate: string; // ISO format date (YYYY-MM-DD)
    eventTime: string; // HH:mm format
    eventId: string; // Google Calendar event ID
    createdAt: Date;
    updatedAt: Date;
}

export interface SaveAppointmentParams {
    customerName: string;
    customerPhone: string;
    eventDate: string;
    eventTime: string;
    eventId: string;
}

export interface SaveAppointmentResult {
    success: boolean;
    appointmentId?: string;
    error?: string;
}
