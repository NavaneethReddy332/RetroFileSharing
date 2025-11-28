# RetroSend - 90s-Style File Sharing Application

## Overview

RetroSend is a temporary file-sharing web application that combines a nostalgic 1990s-style user interface with a modern, secure backend architecture. The application allows users to upload files and receive a 6-digit share code for easy sharing. Files are automatically deleted after 24 hours, and the entire experience is wrapped in an authentic retro aesthetic featuring period-appropriate fonts, colors, and design elements.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React with TypeScript for type-safe component development
- Vite as the build tool and development server, configured for both development and production environments
- Wouter for lightweight client-side routing instead of React Router

**UI Component Library**
- shadcn/ui components (Radix UI primitives) for accessible, composable UI elements
- Tailwind CSS for utility-first styling with custom retro-themed design tokens
- Custom retro fonts: VT323, Press Start 2P, and Courier Prime for authentic 90s aesthetics

**State Management**
- TanStack Query (React Query) for server state management, caching, and API interaction
- React Context API for Terminal logging system that displays real-time operation logs in a retro terminal style

**Design System**
- Custom theme variables defined inline in CSS for retro color palette (#c0c0c0 gray, #000080 blue, etc.)
- Component-based architecture with reusable RetroLayout wrapper
- Responsive design considerations with mobile breakpoint detection

### Backend Architecture

**Server Framework**
- Express.js for HTTP server and API routing
- Custom development and production server setups with different static file serving strategies
- Development mode integrates Vite middleware for hot module replacement

**File Upload & Storage**
- Multer middleware for handling multipart/form-data file uploads
- **Backblaze B2 cloud storage** for production file storage (replaced local file system)
- Backblaze service module (server/backblaze.ts) handles upload, download, and delete operations
- Automatic token reauthorization with retry logic for long-lived processes
- 50MB file size limit enforced at the middleware level
- Random 6-digit code generation for file identification
- Orphaned file prevention: B2 files deleted before database records

**Data Layer**
- In-memory storage implementation (MemStorage) for development/testing
- Drizzle ORM configured for PostgreSQL database with schema definitions
- Automatic file cleanup mechanism using setInterval to remove expired files
- Schema includes Users and Files tables with proper relationships and constraints

**Request/Response Handling**
- JSON body parsing with raw body preservation for webhook verification scenarios
- URL-encoded form data support
- Request logging middleware that captures duration, status codes, and response payloads
- CORS and security considerations through Express middleware

### Data Schema

**Files Table**
- Unique 6-digit codes for file retrieval
- Original filename preservation alongside system-generated unique filenames
- File metadata: size, MIME type
- **b2FileId field** for tracking cloud storage files in Backblaze B2
- Timestamp tracking: uploadedAt, expiresAt (24-hour expiration window)
- UUID primary keys with PostgreSQL's gen_random_uuid()

**Users Table**
- Basic authentication structure (username/password)
- Prepared for potential future authentication features

### API Structure

**Endpoints**
- `POST /api/upload` - Accepts file uploads via multipart form data, returns share code and file metadata
  - Rate limited to 10 requests per 15 minutes per IP
  - Validates file types and blocks dangerous executables
  - Validates and whitelists expiration times (1hr, 12hr, 24hr, 7 days)
- `GET /api/file/:code` - Retrieves file metadata for display before download
  - Rate limited to 30 requests per 15 minutes per IP
- `POST /api/verify-password` - Verifies password for protected files
  - Rate limited to 5 attempts per 15 minutes per IP to prevent brute force attacks
- Download functionality integrated through code-based retrieval
  - Rate limited to 20 downloads per 15 minutes per IP

**Security Features (Added November 2025)**
- **Rate Limiting**: IP-based rate limiting on all critical endpoints to prevent abuse
- **File Type Validation**: Blocks dangerous executables (.exe, .bat, .sh, etc.) and detects double-extension bypass attempts
- **Expiration Validation**: Server-side whitelisting of expiration times prevents indefinite file retention
- **Error Handling**: Proper rollback on failed downloads to prevent download count corruption

**Validation**
- Zod schemas generated from Drizzle ORM schemas for runtime type validation
- Input validation using @hookform/resolvers for form handling
- Custom middleware for file type validation (server/middleware/fileValidation.ts)
- Custom middleware for expiration time validation (server/middleware/expirationValidator.ts)
- Rate limiting middleware using express-rate-limit (server/middleware/rateLimiter.ts)

### Development & Build Process

**Development Mode**
- Vite dev server runs on port 5000
- Express backend serves API routes and proxies frontend requests to Vite
- Hot module replacement for instant feedback during development
- Custom Replit plugins for error overlays, cartographer, and dev banner

**Production Build**
- Client builds to `dist/public` using Vite
- Server bundles to `dist/index.js` using esbuild with ESM format
- Static file serving from built client directory
- All routes fall through to index.html for SPA routing

**Database Operations**
- `npm run db:push` - Pushes schema changes to PostgreSQL using Drizzle Kit
- Migration files stored in `/migrations` directory
- Configured for Neon serverless PostgreSQL

## External Dependencies

### Third-Party Services

**Database**
- Neon Serverless PostgreSQL (@neondatabase/serverless) - Cloud PostgreSQL database with connection pooling
- Configured via DATABASE_URL environment variable

**Cloud Storage**
- Backblaze B2 (backblaze-b2) - Cloud object storage for file uploads
- Configured via B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_ID, and B2_BUCKET_NAME secrets
- Automatic token reauthorization and retry logic for production reliability
- Orphaned file prevention through coordinated deletion

**Replit Platform Integration**
- @replit/vite-plugin-runtime-error-modal - Development error overlay
- @replit/vite-plugin-cartographer - Code navigation features
- @replit/vite-plugin-dev-banner - Development environment indicator
- Custom meta images plugin for OpenGraph image handling on Replit deployments

### Key NPM Packages

**Core Framework**
- react, react-dom - UI library
- express - Web server framework
- drizzle-orm - Type-safe ORM for PostgreSQL
- vite - Build tool and dev server

**File Handling**
- multer - Multipart form data and file upload handling
- backblaze-b2 - Cloud storage SDK for Backblaze B2

**UI Components**
- @radix-ui/* - Accessible component primitives (30+ packages)
- class-variance-authority - Component variant styling
- tailwindcss - Utility-first CSS framework
- lucide-react - Icon library

**Developer Experience**
- typescript - Type safety
- tsx - TypeScript execution for development
- esbuild - Fast JavaScript bundler for production
- wouter - Lightweight routing library

**Form & Data Handling**
- react-hook-form - Form state management
- @hookform/resolvers - Form validation
- zod - Schema validation
- @tanstack/react-query - Server state management

### Font Resources

**Google Fonts CDN**
- Press Start 2P - Pixel-style font for headers
- VT323 - Terminal/monospace font
- Courier Prime - Typewriter-style font

### Asset Management

- Custom video assets stored in `/attached_assets/generated_videos/`
- Static assets served from `client/public/`
- Path aliases configured: @/ for client source, @shared for shared code, @assets for attached assets