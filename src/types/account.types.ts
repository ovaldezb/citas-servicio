export enum AccountStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export interface DaySchedule {
    day_name: string;           // 'Lunes', 'Martes', etc.
    enabled: boolean;
    init_time: string;          // HH:mm format
    end_time: string;           // HH:mm format
    day_of_week: number;        // 1-7 (Monday-Sunday)
}

export interface ServiceAccountDocument {
    receiverPhone: string;
    user_name: string;
    account_status: AccountStatus;
    active_days: DaySchedule[];
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateAccountRequest {
    receiverPhone: string;
    user_name: string;
    account_status?: AccountStatus;
    active_days?: DaySchedule[];
}

export interface UpdateAccountRequest {
    user_name?: string;
    account_status?: AccountStatus;
    active_days?: DaySchedule[];
}

export interface AccountResponse {
    success: boolean;
    account?: ServiceAccountDocument;
    accounts?: ServiceAccountDocument[];
    count?: number;
    message?: string;
    error?: string;
}
