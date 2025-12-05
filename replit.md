# RETRO SEND - P2P File Transfer Application

## Overview

RETRO SEND is a peer-to-peer file transfer web application that enables direct, real-time file transfers between users. The application generates a 6-digit code when a sender selects a file, which receivers use to connect and receive the file directly via WebSocket - no cloud storage required. The UI features a unique minimal dark theme with cyan (#00ffff) accent color and glow effects.

## User Preferences

Preferred communication style: Simple, everyday language.
UI preference: Clean retro theme without terminal, video, or marquee sections.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing

**UI Component Library**
- shadcn/ui components (Radix UI primitives) for accessible UI elements
- Tailwind CSS with custom retro-themed design tokens
- Lucide React for icons

**Key Components**
- `RetroLayout.tsx` - Wrapper component with retro styling (header, main content, footer)
- `Home.tsx` - Send page with drag-and-drop file selection, code generation, and progress logs
- `Receive.tsx` - Receive page with 6-digit code entry and file download

**State Management**
- React useState/useEffect for component-level state
- TanStack Query for API interactions
- WebSocket connections for real-time P2P transfer

### Backend Architecture

**Server Framework**
- Express.js for HTTP server and API routing
- WebSocket Server (ws) for real-time signaling and file chunk transfer
- Development mode integrates Vite middleware for hot module replacement

**WebSocket Signaling Server**
- Manages sender-receiver pairing via 6-digit codes
- Forwards file chunks from sender to receiver in real-time
- Handles progress updates and connection lifecycle
- Cleans up sessions on completion or disconnect

**Data Layer**
- **Turso database** (LibSQL/SQLite) for session metadata only (no file storage)
- Drizzle ORM configured for Turso with SQLite-compatible schema
- Sessions automatically expire after configured duration
- Periodic cleanup removes expired sessions

### Data Schema

**Transfer Sessions Table**
- `id` - Auto-increment primary key
- `code` - Unique 6-digit transfer code
- `file_name` - Original filename
- `file_size` - File size in bytes
- `mime_type` - MIME type
- `status` - Session status (waiting, connected, transferring, completed, expired)
- `created_at` - Creation timestamp
- `expires_at` - Expiration timestamp (10 minutes default)
- `completed_at` - When transfer was completed (stored permanently)

### API Structure

**Endpoints**
- `POST /api/session` - Creates new transfer session, returns 6-digit code
- `GET /api/session/:code` - Retrieves session metadata for receivers
- `PUT /api/session/:code` - Updates session status

**WebSocket Messages**
- `sender-ready` - Sender has file ready and waiting
- `receiver-joined` - Receiver connected with matching code
- `chunk` - Base64-encoded file chunk (32KB default)
- `progress` - Transfer progress percentage
- `transfer-complete` - File transfer finished
- `error` - Error message

### P2P Transfer Flow (WebRTC)

1. **Sender**: Selects file, clicks "Generate Code"
2. **Backend**: Creates session in Turso, returns 6-digit code
3. **Sender**: Connects to WebSocket, waits for receiver
4. **Receiver**: Enters 6-digit code, connects to WebSocket
5. **Backend**: Pairs sender and receiver via code, relays WebRTC signaling
6. **WebRTC Handshake**: SDP offer/answer and ICE candidates exchanged
7. **Direct P2P**: Data channel established for binary ArrayBuffer streaming
8. **Transfer**: Binary chunks stream directly peer-to-peer (server not involved)
9. **Receiver**: Reconstructs file from ArrayBuffer chunks, triggers download
10. **Cleanup**: Session marked complete, cleaned up on expiration

### Development & Build Process

**Development Mode**
- `npm run dev` - Starts Express + Vite dev server on port 5000
- Hot module replacement for instant feedback
- WebSocket server runs on same port with `/ws` path

**Production Build**
- Client builds to `dist/public` using Vite
- Server bundles to `dist/index.js` using esbuild
- Static file serving from built client directory

**Database Operations**
- Table created via direct SQL execution
- Configured for Turso (LibSQL) database

## External Dependencies

### Third-Party Services

**Database**
- Turso (LibSQL) - Edge SQLite database with global replication
- @libsql/client for database connectivity
- Required secrets: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`

**Replit Platform Integration**
- @replit/vite-plugin-runtime-error-modal - Development error overlay
- @replit/vite-plugin-cartographer - Code navigation features
- @replit/vite-plugin-dev-banner - Development environment indicator

### Key NPM Packages

**Core Framework**
- react, react-dom - UI library
- express - Web server framework
- ws - WebSocket library for real-time communication
- drizzle-orm - Type-safe ORM for Turso/SQLite
- vite - Build tool and dev server

**UI Components**
- @radix-ui/* - Accessible component primitives
- tailwindcss - Utility-first CSS framework
- lucide-react - Icon library

**Developer Experience**
- typescript - Type safety
- tsx - TypeScript execution for development
- esbuild - Fast JavaScript bundler for production
- wouter - Lightweight routing library

## Recent Updates

### December 5, 2025 - Sender Cancellation Handling Improvements

**Bug Fixes**
- Added "sender-cancelled" WebSocket message type for clean sender cancellation notification
- Receiver now shows single "cancelled by sender" message instead of multiple error messages
- Suppressed duplicate error handling when sender cancels (channel error, peer disconnected, etc.)
- Added `cancelledBySenderRef` in Receive.tsx to prevent cascading error displays
- Updated useWebRTC channel.onerror handler to not log errors when transfer was cancelled
- Server performs proper room cleanup when sender cancels (deletes room, clears receivers)
- Session status updated to "cancelled" in database when sender cancels
- `cancelledBySenderRef` reset at start of new receive attempt to prevent suppressing future errors

**Technical Details**
- Server routes.ts sender-cancelled case now performs full cleanup:
  - Clears receivers map (multishare) or receiver reference (single share)
  - Removes sender reference and authentication state
  - Deletes room from rooms map
  - Updates session status to "cancelled" in database
- Receive.tsx handles sender-cancelled case with clean status transition to 'cancelled'
- `cancelledBySenderRef` reset in startReceiving() for clean state on new attempts
- WebRTC channel.onclose handler checks isCancelledRef before rejecting
- Error callback checks cancelledBySenderRef to avoid duplicate error logs

**Files Modified**
- `server/routes.ts` - Added sender-cancelled message dispatch with full room cleanup
- `client/src/pages/Receive.tsx` - Added sender-cancelled handler, error suppression, ref reset
- `client/src/hooks/useWebRTC.ts` - Improved channel error/close handling

### December 4, 2025 - QR Code and Folder Transfer Features

**New Features**
- QR Code display for easy mobile scanning of 6-digit transfer code
- Folder selection button for transferring entire directories (auto-zipped)

**QR Code Implementation**
- Uses qrcode.react library (QRCodeSVG component)
- Displays after LOG section when transfer code is generated
- Links to receive page with pre-filled code parameter
- SSR-safe implementation with typeof window guard

**Folder Transfer Implementation**
- Added folder button with FolderOpen icon next to send button
- Uses webkitdirectory attribute for folder selection
- Multiple files and folders are automatically compressed to ZIP
- Drop zone text updated to indicate files/folders support

**Files Modified**
- `client/src/pages/Home.tsx` - QR code display and folder selection UI

### December 4, 2025 - P2P Transfer Speed Optimization

**Problem Addressed**
- Users experiencing slow transfer speeds (under 10Mbps) despite having 100+ Mbps internet

**Optimizations Implemented**
- Increased chunk sizes: 64KB (normal) and 256KB (fast mode) for better throughput
- Added batch file reading: reads 8-16 chunks in parallel using Promise.all
- Replaced slow FileReader with native blob.arrayBuffer() for faster file reading
- Optimized buffer thresholds: 4MB high threshold, 1MB low threshold for smoother flow control
- Updated speed display to 100ms intervals for more responsive feedback

**Technical Changes**
- `CHUNK_SIZE`: 32KB → 64KB
- `FAST_CHUNK_SIZE`: 64KB → 256KB  
- `HIGH_BUFFER_THRESHOLD`: New 4MB threshold for batch sending
- `LOW_BUFFER_THRESHOLD`: 8MB → 1MB for faster buffer drain
- Batch reading: Reads multiple chunks simultaneously before sending

**Expected Performance**
- Same WiFi: 40-100+ Mbps
- Same LAN: 80-200+ Mbps
- Different networks: 20-50+ Mbps (limited by actual bandwidth)

**Files Modified**
- `client/src/hooks/useWebRTC.ts` - Core transfer optimizations

### December 4, 2025 - Security Hardening & Code Consolidation

**Security Improvements**
- HMAC token authentication for WebSocket connections (both sender and receiver)
- Token is generated on session creation and verified on WebSocket join
- Rate limiting on API endpoints (20 requests/min for session creation, 30 for lookup)
- Rate limiting on WebSocket connections (50/min per IP)
- Zod validation on all API request bodies with proper error messages
- File size validation (4GB limit) enforced on client-side and server-side

**Code Consolidation**
- Extracted shared utility functions to `client/src/lib/utils.ts`:
  - formatFileSize, formatTime, formatTimeRemaining, formatHistoryDate
  - getLogColor, getStatusColor for consistent log styling
  - validateFiles with size limit enforcement
- Removed duplicate code from Home.tsx and Receive.tsx

**Authentication Flow**
1. POST /api/session returns code + token for sender
2. GET /api/session/:code returns session info + token for receiver
3. WebSocket join-sender/join-receiver verify HMAC token before pairing
4. Both peers must be authenticated before P2P signaling begins

**Files Modified**
- `server/lib/security.ts` - HMAC token generation and verification
- `server/routes.ts` - Token in responses, WebSocket verification
- `client/src/lib/utils.ts` - Shared utility functions
- `client/src/pages/Home.tsx` - Uses shared utils, sends token on WS join
- `client/src/pages/Receive.tsx` - Uses shared utils, sends token on WS join

### December 3, 2025 - Fast Mode with Data Integrity

**Feature Added**
- Added Fast Mode toggle for maximum transfer speed with unreliable UDP-like transfer
- Yellow/gold color scheme distinguishes Fast Mode from standard cyan theme
- Warning dialog explains safety measures before enabling

**Technical Implementation**
- Uses `ordered: false, maxRetransmits: 0` for UDP-like unordered delivery
- 12-byte chunk header: sequence number (4) + data length (4) + CRC32 checksum (4)
- Separate "control" channel for reliable verification/retransmission messages
- Receiver tracks missing chunks AND invalid chunks (checksum failures)
- Up to 5 retransmission rounds before explicit failure

**Data Integrity Guarantees**
- CRC32 checksum validation on every chunk (polynomial 0xEDB88320)
- Payload length verification against header
- Missing chunk detection and retransmission
- Invalid chunk (corruption) detection and retransmission
- Both sender and receiver timeout with explicit failure messages
- No silent success - transfer only completes after explicit verification

**Files Modified**
- `client/src/hooks/useWebRTC.ts` - Fast mode WebRTC implementation
- `client/src/pages/Home.tsx` - Fast Mode toggle UI and warning dialog

### December 3, 2025 - WebRTC Transfer Speed Optimizations

**Optimizations Implemented**
- Reduced chunk size from 64KB to 32KB (optimal for most networks)
- Added `iceCandidatePoolSize: 10` for better NAT hole punching
- Replaced busy-wait polling loop with native `onbufferedamountlow` event
- Added `bufferedAmountLowThreshold` for proper backpressure control
- Improved cancellation handling during buffer waits

**Technical Details**
- `CHUNK_SIZE = 32KB` - Optimal balance between overhead and buffer pressure
- `MAX_BUFFER_SIZE = 16MB` - Keeps pipeline full without overflow
- `LOW_BUFFER_THRESHOLD = 8MB` - Triggers send when buffer is half empty
- Uses event-driven buffer management instead of busy polling
- Channel state validation before sends for better error handling

**Expected Performance**
- Same WiFi: 20-60 Mbps
- Same LAN: 40-150 Mbps
- Different networks: 10-30 Mbps

### December 3, 2025 - Multi-File ZIP Performance Optimization

**Problem Fixed**
- System and website lagging when sending multiple files
- Very slow transfer speeds for multi-file ZIP creation compared to single files

**Solution Implemented**
- Created Web Worker (`client/src/workers/zipWorker.ts`) to offload ZIP compression off the main UI thread
- Reduced compression level from 6 to 1 for faster processing
- Throttled progress updates to 200ms intervals to reduce React re-render overhead
- Added yield-to-main mechanism during file reading to keep UI responsive
- Implemented proper cancel message flow for clean cancellation

**Technical Details**
- ZIP compression now runs in a separate thread, preventing UI freezing
- Progress bar shows during compression with phase indicators
- Cancel button properly signals the worker before terminating
- File reading yields control back to the main thread between files

### December 3, 2025 - Turso Database Migration

**Database Changes**
- Migrated from PostgreSQL to Turso (LibSQL/SQLite) exclusively
- Removed all PostgreSQL dependencies and automatic Replit database provisioning
- Project now uses only Turso for session metadata storage
- When forked to other accounts, the project will NOT automatically change databases

**Required Secrets**
- `TURSO_DATABASE_URL` - Turso database connection URL
- `TURSO_AUTH_TOKEN` - Turso authentication token

**Technical Notes**
- Dates stored as ISO strings in SQLite (text columns)
- Schema uses SQLite-compatible types (sqliteTable, integer with autoIncrement)
- Drizzle ORM configured with `dialect: "turso"` driver

### December 1, 2025 - P2P File Transfer System

**Major Rewrite**
- Converted from cloud storage (Backblaze B2) to P2P WebSocket transfer
- Files transfer directly between sender and receiver browsers
- Database only stores session metadata, not file contents
- Clean retro UI without terminal, video, or marquee sections

**New Features**
- Real-time file transfer via WebSocket
- 6-digit code generation for easy sharing
- Drag-and-drop file selection
- Progress logs displayed under upload button
- File chunk transfer with progress tracking
- Automatic session cleanup on expiration

**UI Changes**
- Removed terminal window component
- Removed video feed section
- Removed marquee banner
- Clean, minimal retro styling with orange accents

## Architecture Notes

**Why P2P?**
- No file storage costs
- Faster transfers (direct connection)
- Enhanced privacy (files don't touch server storage)
- Simplified infrastructure

**Limitations**
- Both sender and receiver must be online simultaneously
- Large files may time out on slow connections
- WebSocket connection required throughout transfer

**Future Improvements**
- Zod validation on API endpoints
- TURN server support for NAT traversal in restricted networks
- Resume support for interrupted transfers
