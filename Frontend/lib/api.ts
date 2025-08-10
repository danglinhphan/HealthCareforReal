const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// Auth token functions
export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('access_token');
  }
  return null;
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', token);
  }
}

export function removeAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
  }
}

// API call wrapper with auth
async function apiCall(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized
  if (response.status === 401) {
    removeAuthToken();
    // Redirect to login page
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  return response;
}

// Types
export interface User {
  user_id: number;
  username: string;
  emailaddress: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  conversation_id: number;
  user_id: number;
  timestamp: string;
  messages: Message[];
  first_message?: string;
}

export interface LoginResponse {
  message: string;
  access_token: string;
  token_type: string;
  user: User;
}

export interface RegisterResponse {
  message: string;
  user: User;
}

// Auth API functions
export async function loginUser(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: username,
      password: password,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Login failed');
  }

  return response.json();
}

export async function registerUser(userData: {
  username: string;
  emailaddress: string;
  password: string;
}): Promise<RegisterResponse> {
  const response = await fetch(`${API_BASE_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Registration failed');
  }

  return response.json();
}

export async function getCurrentUser(): Promise<{ user: User }> {
  const response = await apiCall('/me');

  if (!response.ok) {
    throw new Error('Failed to get current user');
  }

  return response.json();
}

export async function logoutUser(): Promise<{ message: string }> {
  const response = await apiCall('/logout', {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to logout');
  }

  removeAuthToken();
  return response.json();
}

// Conversation API functions
export async function getConversations(): Promise<Array<{
  conversation_id: number;
  user_id: number;
  timestamp: string;
  first_message: string;
}>> {
  const response = await apiCall('/conversations');

  if (!response.ok) {
    throw new Error('Failed to fetch conversations');
  }

  return response.json();
}

export async function createConversation(firstMessage: string): Promise<Conversation> {
  const response = await apiCall('/conversations', {
    method: 'POST',
    body: JSON.stringify({
      first_message: firstMessage,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create conversation');
  }

  return response.json();
}

export async function getConversation(conversationId: number): Promise<Conversation> {
  const response = await apiCall(`/conversations/${conversationId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch conversation');
  }

  return response.json();
}

export async function deleteConversation(conversationId: number): Promise<{ message: string }> {
  const response = await apiCall(`/conversations/${conversationId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete conversation');
  }

  return response.json();
}

// Message API functions
export async function sendMessage(conversationId: number, content: string): Promise<ReadableStream<Uint8Array> | null> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No auth token available');
  }

  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      content: content,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to send message');
  }

  return response.body;
}

export async function sendMessageNonStream(conversationId: number, content: string): Promise<Conversation> {
  const response = await apiCall(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: content,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to send message');
  }

  return response.json();
}

// Chat streaming function with proper event parsing
export async function streamChat(
  conversationId: number, 
  message: string, 
  onChunk: (chunk: string) => void,
  onComplete?: (fullMessage: string) => void,
  onError?: (error: string) => void
): Promise<void> {
  try {
    const stream = await sendMessage(conversationId, message);
    if (!stream) {
      throw new Error('No stream received');
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullMessage = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '') continue;
            
            try {
              const parsed = JSON.parse(data);
              
              switch (parsed.type) {
                case 'assistant_chunk':
                  if (parsed.content) {
                    fullMessage += parsed.content;
                    onChunk(parsed.content);
                  }
                  break;
                case 'assistant_complete':
                  if (onComplete) {
                    onComplete(fullMessage);
                  }
                  break;
                case 'done':
                  return;
                case 'error':
                  if (onError) {
                    onError(parsed.error);
                  }
                  throw new Error(parsed.error);
                  break;
              }
            } catch (e) {
              // Ignore JSON parsing errors for incomplete chunks
              console.log('Failed to parse chunk:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    console.error('Streaming error:', error);
    if (onError) {
      onError(error instanceof Error ? error.message : 'Unknown streaming error');
    }
    throw error;
  }
}
