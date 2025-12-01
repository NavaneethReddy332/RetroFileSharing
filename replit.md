# QuickSend - P2P File Transfer Application

## Overview

QuickSend is a peer-to-peer file transfer web application that enables direct, real-time file transfers between users. The application generates a 6-digit code when a sender selects a file, which receivers use to connect and receive the file directly via WebSocket - no cloud storage required. The UI features a clean retro aesthetic with orange and black color scheme.

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
- `id` - UUID primary key
- `code` - Unique 6-digit transfer code
- `file_name` - Original filename
- `file_size` - File size in bytes
- `mime_type` - MIME type
- `status` - Session status (waiting, connected, transferring, completed, expired)
- `created_at` - Creation timestamp
- `expires_at` - Expiration timestamp (30 minutes default)

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

### P2P Transfer Flow

1. **Sender**: Selects file, clicks "Generate Code"
2. **Backend**: Creates session in Turso, returns 6-digit code
3. **Sender**: Connects to WebSocket, waits for receiver
4. **Receiver**: Enters 6-digit code, connects to WebSocket
5. **Backend**: Pairs sender and receiver via code
6. **Transfer**: Sender sends file in chunks via WebSocket
7. **Receiver**: Reconstructs file from chunks, triggers download
8. **Cleanup**: Session marked complete, cleaned up on expiration

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
- Binary WebSocket frames for efficiency (currently base64)
- Zod validation on API endpoints
- WebRTC for true peer-to-peer (currently relayed through server)
- Resume support for interrupted transfers
