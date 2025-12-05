# RETRO SEND - P2P File Transfer Application

## Overview
RETRO SEND is a peer-to-peer file transfer web application enabling direct, real-time file transfers between users. It generates a 6-digit code for senders to initiate transfers, which receivers use to connect and receive files via WebSocket, bypassing cloud storage. The application features a minimal dark theme with a cyan accent and glow effects. The business vision is to provide a cost-effective, private, and fast file transfer solution, eliminating the need for intermediaries.

## User Preferences
Preferred communication style: Simple, everyday language.
UI preference: Clean retro theme without terminal, video, or marquee sections.

## System Architecture

### Frontend
- **Frameworks**: React with TypeScript, Vite, Wouter for routing.
- **UI/UX**: shadcn/ui (Radix UI primitives), Tailwind CSS with retro-themed design tokens, Lucide React for icons.
- **Key Components**: `RetroLayout`, `Home` (send page with drag-and-drop, code generation), `Receive` (code entry, download).
- **State Management**: React `useState`/`useEffect`, TanStack Query for API, WebSocket for real-time P2P.

### Backend
- **Server**: Express.js for HTTP and API routing, WebSocket Server (`ws`) for signaling and file chunk transfer.
- **WebSocket Signaling**: Manages sender-receiver pairing, forwards file chunks, handles progress and connection lifecycle, cleans up sessions.
- **P2P Transfer (WebRTC)**: Utilizes WebRTC data channels for direct peer-to-peer binary streaming of `ArrayBuffer` chunks, avoiding server involvement in file transfer.
  - **Optimization**: Increased chunk sizes (64KB, 256KB for fast mode), batch file reading, optimized buffer thresholds, `onbufferedamountlow` event for backpressure.
  - **Fast Mode**: Optional UDP-like transfer (`ordered: false, maxRetransmits: 0`) with CRC32 checksums, sequence numbers, and retransmission logic for data integrity.
- **Folder Transfer**: Uses `webkitdirectory` to select folders, which are automatically zipped in a Web Worker to prevent UI freezing.
- **Security**: HMAC token authentication for WebSockets, rate limiting on API and WebSocket connections, Zod validation for API requests, server-side file size validation (4GB limit).

### Data Layer
- **Database**: Turso (LibSQL/SQLite) for session metadata only.
- **ORM**: Drizzle ORM configured for Turso.
- **Schema**: `Transfer Sessions` table includes `id`, `code`, `file_name`, `file_size`, `mime_type`, `status`, `created_at`, `expires_at`, `completed_at`.

### API Structure
- **Endpoints**:
    - `POST /api/session`: Creates new session, returns 6-digit code.
    - `GET /api/session/:code`: Retrieves session metadata.
    - `PUT /api/session/:code`: Updates session status.
- **WebSocket Messages**: `sender-ready`, `receiver-joined`, `chunk`, `progress`, `transfer-complete`, `error`, `sender-cancelled`.

## External Dependencies

### Third-Party Services
- **Database**: Turso (LibSQL) - Edge SQLite database for session metadata.
    - `@libsql/client`
    - Environment variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- **Cloud Storage (Optional)**: Backblaze B2 - For optional "Save to Cloud" feature.
    - **Upload Method**: Server-proxied uploads (files sent to server which uploads to B2). This approach was chosen because B2's upload endpoints do not support CORS for direct browser uploads.
    - **Size Limit**: 500MB max for cloud uploads (larger files should use P2P transfer).
    - **UI Behavior**: When "Save to Cloud" is enabled:
        - Toggle is highlighted with glowing border and animated cloud icon
        - Fast Mode and Multi-Share options are hidden (disabled)
        - Upload starts immediately when files are selected
        - Progress shown in floating bottom-left panel with cancel/retry options
        - Supports multi-file uploads (auto-zipped before upload)
    - Environment variables: `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_ID`, `B2_BUCKET_NAME`
- **Replit Platform Integration**:
    - `@replit/vite-plugin-runtime-error-modal`
    - `@replit/vite-plugin-cartographer`
    - `@replit/vite-plugin-dev-banner`

### Key NPM Packages
- **Core**: `react`, `react-dom`, `express`, `ws`, `drizzle-orm`, `vite`, `wouter`.
- **UI**: `@radix-ui/*`, `tailwindcss`, `lucide-react`, `qrcode.react`.
- **Developer Experience**: `typescript`, `tsx`, `esbuild`.