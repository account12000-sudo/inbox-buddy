/**
 * Maps technical error messages to user-friendly messages
 * This prevents exposing sensitive technical details to users
 */

// Known error patterns and their user-friendly messages
const ERROR_MAPPINGS: Array<{ pattern: RegExp; message: string }> = [
  // Authentication errors
  { pattern: /invalid.*(credentials|password|email)/i, message: 'Invalid email or password. Please try again.' },
  { pattern: /user.*not.*found/i, message: 'Account not found. Please check your email or sign up.' },
  { pattern: /email.*already.*registered/i, message: 'This email is already registered. Please sign in instead.' },
  { pattern: /password.*too.*short/i, message: 'Password must be at least 6 characters.' },
  { pattern: /invalid.*email/i, message: 'Please enter a valid email address.' },
  { pattern: /email.*not.*confirmed/i, message: 'Please verify your email before signing in.' },
  { pattern: /rate.*limit|too.*many.*requests/i, message: 'Too many attempts. Please wait a moment and try again.' },
  
  // SMTP/Email errors
  { pattern: /smtp|mail.*server|connection.*refused/i, message: 'Unable to connect to email server. Please check your SMTP settings.' },
  { pattern: /authentication.*failed|auth.*error/i, message: 'Email authentication failed. Please verify your credentials.' },
  { pattern: /timeout/i, message: 'Connection timed out. Please try again.' },
  
  // Database errors
  { pattern: /unique.*constraint|duplicate.*key/i, message: 'This record already exists.' },
  { pattern: /foreign.*key|reference/i, message: 'Unable to complete this action due to related data.' },
  { pattern: /permission.*denied|not.*authorized/i, message: 'You do not have permission to perform this action.' },
  { pattern: /row.*level.*security/i, message: 'Access denied. Please sign in and try again.' },
  
  // Network errors  
  { pattern: /network|fetch.*failed|cors/i, message: 'Network error. Please check your connection and try again.' },
  { pattern: /502|503|504/i, message: 'Service temporarily unavailable. Please try again later.' },
];

/**
 * Converts a technical error to a user-friendly message
 * @param error - The error object or string
 * @returns A safe, user-friendly error message
 */
export function getSafeErrorMessage(error: unknown): string {
  // Default message for unknown errors
  const defaultMessage = 'Something went wrong. Please try again.';
  
  if (!error) {
    return defaultMessage;
  }
  
  // Extract the error message
  let errorMessage: string;
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (typeof error === 'object' && error !== null && 'message' in error) {
    errorMessage = String((error as { message: unknown }).message);
  } else {
    return defaultMessage;
  }
  
  // Check against known error patterns
  for (const { pattern, message } of ERROR_MAPPINGS) {
    if (pattern.test(errorMessage)) {
      return message;
    }
  }
  
  // For unrecognized errors, return the default message
  // This prevents leaking technical details
  return defaultMessage;
}

/**
 * Maps authentication-specific errors to user-friendly messages
 * @param error - The auth error object
 * @returns A safe, user-friendly error message
 */
export function getAuthErrorMessage(error: unknown): string {
  if (!error) {
    return 'Authentication failed. Please try again.';
  }
  
  let errorMessage: string;
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (typeof error === 'object' && error !== null && 'message' in error) {
    errorMessage = String((error as { message: unknown }).message);
  } else {
    return 'Authentication failed. Please try again.';
  }
  
  // Check for common Supabase auth error codes
  const lowerMessage = errorMessage.toLowerCase();
  
  if (lowerMessage.includes('invalid login credentials')) {
    return 'Invalid email or password. Please try again.';
  }
  if (lowerMessage.includes('user already registered')) {
    return 'This email is already registered. Please sign in instead.';
  }
  if (lowerMessage.includes('email not confirmed')) {
    return 'Please verify your email before signing in.';
  }
  if (lowerMessage.includes('password should be')) {
    return 'Password must be at least 6 characters.';
  }
  if (lowerMessage.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (lowerMessage.includes('signups not allowed')) {
    return 'Signups are currently disabled. Please contact support.';
  }
  
  // Return the generic auth error for unrecognized patterns
  return getSafeErrorMessage(error);
}

/**
 * Maps SMTP/email-specific errors to user-friendly messages
 * @param error - The SMTP error object
 * @returns A safe, user-friendly error message
 */
export function getSmtpErrorMessage(error: unknown): string {
  if (!error) {
    return 'Failed to send email. Please check your settings.';
  }
  
  let errorMessage: string;
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (typeof error === 'object' && error !== null && 'message' in error) {
    errorMessage = String((error as { message: unknown }).message);
  } else {
    return 'Failed to send email. Please check your settings.';
  }
  
  const lowerMessage = errorMessage.toLowerCase();
  
  if (lowerMessage.includes('connection refused') || lowerMessage.includes('unable to connect')) {
    return 'Unable to connect to email server. Please check your SMTP host and port.';
  }
  if (lowerMessage.includes('authentication failed') || lowerMessage.includes('auth error')) {
    return 'Email authentication failed. Please verify your username and password.';
  }
  if (lowerMessage.includes('timeout')) {
    return 'Connection timed out. Please check your SMTP settings and try again.';
  }
  if (lowerMessage.includes('invalid recipient')) {
    return 'Invalid recipient email address.';
  }
  if (lowerMessage.includes('quota') || lowerMessage.includes('limit exceeded')) {
    return 'Email sending limit reached. Please try again later.';
  }
  if (lowerMessage.includes('not configured') || lowerMessage.includes('smtp settings not found')) {
    return 'Email settings not configured. Please set up your SMTP settings first.';
  }
  
  // Return generic email error for unrecognized patterns
  return 'Failed to send email. Please check your settings and try again.';
}
