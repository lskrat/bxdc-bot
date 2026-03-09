const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:18080'

export async function createTask(content: string, userId?: string): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, userId }),
  })

  if (!response.ok) {
    throw new Error('Failed to create task')
  }

  return response.json()
}

export function getEventSourceUrl(taskId: string): string {
  return `${API_BASE_URL}/api/tasks/${taskId}/events`
}
