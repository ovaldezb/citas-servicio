export interface WhatsAppMessage {
    object: string;
    entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
    id: string;
    changes: WhatsAppChange[];
}

export interface WhatsAppChange {
    value: WhatsAppValue;
    field: string;
}

export interface WhatsAppValue {
    messaging_product: string;
    metadata: WhatsAppMetadata;
    contacts?: WhatsAppContact[];
    messages?: WhatsAppIncomingMessage[];
    statuses?: WhatsAppStatus[];
}

export interface WhatsAppMetadata {
    display_phone_number: string;
    phone_number_id: string;
}

export interface WhatsAppContact {
    profile: {
        name: string;
    };
    wa_id: string;
}

export interface WhatsAppIncomingMessage {
    from: string;
    id: string;
    timestamp: string;
    type: 'text' | 'interactive' | 'button';
    text?: {
        body: string;
    };
    interactive?: {
        type: string;
        button_reply?: {
            id: string;
            title: string;
        };
    };
}

export interface WhatsAppStatus {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipient_id: string;
}
