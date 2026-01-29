# Sistema de Citas por WhatsApp

Sistema automatizado para agendar citas a través de WhatsApp con integración a Google Calendar.

## 🚀 Características

- ✅ Bot conversacional de WhatsApp
- 📅 Integración con Google Calendar
- 🗄️ Persistencia de datos con MongoDB
- 🆔 Identificadores únicos de cita (6 caracteres alfanuméricos)
- ⚡ Serverless con AWS Lambda
- 🔒 Credenciales seguras con AWS Secrets Manager
- 💬 Flujo de conversación intuitivo
- ✨ Validación de disponibilidad en tiempo real

## 📋 Requisitos Previos

- Node.js 20.x o superior
- Cuenta de AWS con permisos para Lambda y Secrets Manager
- Cuenta de Meta Business (WhatsApp Business API)
- Cuenta de Google Cloud con Calendar API habilitada
- MongoDB Atlas (o instancia de MongoDB)
- Serverless Framework instalado globalmente

## 🛠️ Instalación

1. **Clonar el repositorio**
```bash
cd citas-servicios
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

4. **Configurar Google Calendar**
   - Crear un proyecto en Google Cloud Console
   - Habilitar Google Calendar API
   - Crear una cuenta de servicio y descargar el JSON de credenciales
   - Compartir tu calendario con el email de la cuenta de servicio

5. **Configurar MongoDB**
   - Crear un cluster en MongoDB Atlas (o usar instancia propia)
   - Crear una base de datos y colección para las citas
   - Obtener la cadena de conexión (URI)
   - Agregar las variables `MONGODB_URI`, `MONGODB_DATABASE`, y `MONGODB_COLLECTION` al archivo `.env`
   - Configurar `RECEIVER_PHONE` con el número del profesional/empresa que recibe las citas

6. **Subir credenciales a AWS Secrets Manager** (opcional)
```bash
aws secretsmanager create-secret \
  --name citas-servicios/google-credentials \
  --secret-string file://google-credentials.json \
  --region us-east-1
```

## 🚀 Despliegue

```bash
# Desarrollo
npm run deploy -- --stage dev

# Producción
npm run deploy -- --stage prod
```

Después del despliegue, obtendrás una URL del webhook. Configúrala en Meta Business:
1. Ve a tu app de WhatsApp en Meta for Developers
2. Configura el webhook con la URL proporcionada
3. Usa el WHATSAPP_VERIFY_TOKEN configurado en .env

## 📱 Uso

Los usuarios pueden interactuar con el bot enviando un mensaje de WhatsApp. El flujo es:

1. **Saludo inicial**: El usuario envía "hola"
2. **Nombre**: El bot solicita el nombre del cliente
3. **Fecha**: Solicita la fecha de la cita (DD/MM/AAAA)
4. **Hora**: Solicita la hora (HH:MM formato 24h)
5. **Confirmación**: Muestra resumen y solicita confirmación
6. **Creación**: Crea el evento en Google Calendar y guarda en MongoDB
7. **ID Único**: El usuario recibe un ID de cita único de 6 caracteres (ej: A3B7C9)

### 🆔 Identificador Único de Cita

Cada cita confirmada recibe un identificador único alfanumérico de 6 caracteres que:
- Se genera automáticamente después de confirmar la cita
- Se muestra en el mensaje de confirmación al usuario
- Se almacena en MongoDB junto con los datos de la cita
- Permite identificar y referenciar la cita fácilmente
- Es único en todo el sistema

## 🏗️ Estructura del Proyecto

```
citas-servicios/
├── src/
│   ├── handlers/
│   │   └── webhook.ts          # Lambda handler principal
│   ├── services/
│   │   ├── whatsapp.service.ts # Integración WhatsApp API
│   │   ├── calendar.service.ts # Integración Google Calendar
│   │   ├── database.service.ts # Integración MongoDB
│   │   └── messageHandler.ts   # Lógica de conversación
│   └── types/
│       ├── whatsapp.types.ts   # Tipos WhatsApp
│       ├── appointment.types.ts # Tipos de citas
│       └── database.types.ts   # Tipos de MongoDB
├── serverless.yml              # Configuración Serverless
├── tsconfig.json              # Configuración TypeScript
└── package.json               # Dependencias
```

## 🔧 Configuración

### Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `WHATSAPP_VERIFY_TOKEN` | Token para verificación del webhook |
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso de WhatsApp API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de teléfono de WhatsApp |
| `GOOGLE_CALENDAR_ID` | ID del calendario de Google |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email de la cuenta de servicio de Google |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Clave privada de la cuenta de servicio |
| `MONGODB_URI` | Cadena de conexión a MongoDB Atlas |
| `MONGODB_DATABASE` | Nombre de la base de datos en MongoDB |
| `MONGODB_COLLECTION` | Nombre de la colección de citas |
| `RECEIVER_PHONE` | Número de teléfono del profesional/empresa que recibe citas |

## 🧪 Desarrollo Local

```bash
# Compilar TypeScript
npm run build

# Modo watch
npm run watch

# Ejecutar localmente con serverless-offline
npm run dev
```

## 📝 Scripts Disponibles

- `npm run build` - Compilar TypeScript
- `npm run watch` - Compilar en modo watch
- `npm run deploy` - Desplegar a AWS
- `npm run lint` - Ejecutar ESLint
- `npm run format` - Formatear código con Prettier

## 🔐 Seguridad

- Las credenciales de Google se almacenan en AWS Secrets Manager
- Los tokens de WhatsApp se configuran como variables de entorno
- No se almacenan datos sensibles en el código

## 📄 Licencia

MIT

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request
