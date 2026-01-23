export interface AppointmentData {
    customerName: string;
    customerPhone: string;
    appointmentDate: string; // ISO 8601 format
    appointmentTime: string; // HH:mm format
    serviceType?: string;
    notes?: string;
}

export interface AppointmentResponse {
    success: boolean;
    eventId?: string;
    eventLink?: string;
    meetLink?: string;
    message: string;
    error?: string;
}

export enum ConversationState {
    INITIAL = 'INITIAL',
    WAITING_NAME = 'WAITING_NAME',
    WAITING_DATE = 'WAITING_DATE',
    WAITING_TIME = 'WAITING_TIME',
    WAITING_SERVICE = 'WAITING_SERVICE',
    CONFIRMATION = 'CONFIRMATION',
    COMPLETED = 'COMPLETED',
}

export interface UserSession {
    sessionKey: string; // The normalized phone number used for the map key
    phone: string;      // The original phone number used for WhatsApp API
    state: ConversationState;
    data: Partial<AppointmentData>;
    lastInteraction: number;
}
