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
