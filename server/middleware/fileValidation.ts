// Dangerous file extensions that should be blocked
const BLOCKED_EXTENSIONS = [
  // Executables
  'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'vbs', 'js', 'jse',
  'wsf', 'wsh', 'ps1', 'psm1', 'psc1', 'msh', 'msh1', 'mshxml',
  // Scripts
  'sh', 'bash', 'zsh', 'csh', 'ksh', 'fish',
  // Potentially dangerous archives
  'app', 'deb', 'rpm',
  // System files
  'sys', 'dll', 'drv',
  // Macros and scripts
  'hta', 'cpl', 'msc', 'jar',
];

// Dangerous MIME types to block
const BLOCKED_MIME_TYPES = [
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-bat',
  'application/x-sh',
  'application/x-shellscript',
];

// Size thresholds for warnings
export const FILE_SIZE_WARNING_THRESHOLD = 100 * 1024 * 1024; // 100 MB
export const FILE_SIZE_MAX = 1024 * 1024 * 1024; // 1 GB

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  fileExtension?: string;
  fileName?: string;
}

/**
 * Validates a file based on its name and MIME type
 */
export function validateFile(
  fileName: string,
  mimeType: string,
  fileSize?: number
): FileValidationResult {
  // Extract file extension (handle double extensions like .jpg.exe)
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  
  // Get all extensions from the filename
  const allExtensions = fileName.toLowerCase().split('.').slice(1);
  
  // Check if any extension in the filename is blocked (prevents .jpg.exe bypass)
  const blockedExtension = allExtensions.find(ext => BLOCKED_EXTENSIONS.includes(ext));
  if (blockedExtension) {
    return {
      valid: false,
      error: `File type '.${blockedExtension}' is not allowed for security reasons. Executable files and scripts cannot be uploaded.`,
      fileExtension,
      fileName,
    };
  }
  
  // Also check the final extension
  if (BLOCKED_EXTENSIONS.includes(fileExtension)) {
    return {
      valid: false,
      error: `File type '.${fileExtension}' is not allowed for security reasons. Executable files and scripts cannot be uploaded.`,
      fileExtension,
      fileName,
    };
  }
  
  // Check if MIME type is blocked
  if (BLOCKED_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return {
      valid: false,
      error: `File type '${mimeType}' is not allowed for security reasons.`,
      fileExtension,
      fileName,
    };
  }
  
  // Check file size
  if (fileSize !== undefined) {
    if (fileSize > FILE_SIZE_MAX) {
      return {
        valid: false,
        error: `File size exceeds the maximum limit of 1 GB.`,
        fileExtension,
        fileName,
      };
    }
    
    if (fileSize > FILE_SIZE_WARNING_THRESHOLD) {
      return {
        valid: true,
        warning: `Large file detected (${(fileSize / 1024 / 1024).toFixed(2)} MB). Upload may take a while.`,
        fileExtension,
        fileName,
      };
    }
  }
  
  return {
    valid: true,
    fileExtension,
    fileName,
  };
}

/**
 * Get a user-friendly description of allowed file types
 */
export function getAllowedFileTypesDescription(): string {
  return 'Most file types are allowed except executables, scripts, and system files (.exe, .bat, .sh, .dll, etc.)';
}
