import { apiUrl } from './config'

export async function createTask(content: string, userId?: string, history?: any[]): Promise<{ id: string }> {
  const response = await fetch(apiUrl('/api/tasks'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, userId, history }),
  })

  if (!response.ok) {
    throw new Error('Failed to create task')
  }

  return response.json()
}

export function getEventSourceUrl(taskId: string): string {
  return apiUrl(`/api/tasks/${taskId}/events`)
}
