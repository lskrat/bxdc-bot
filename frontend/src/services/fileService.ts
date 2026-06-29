import { apiUrl } from './config'
import type { UserFileRecord } from '../types/fileUpload'

const userId = () => localStorage.getItem('user_id')

interface BackendFileItem {
  id: number
  fileName: string   // 对应 original_file_name
  fileType: string
  fileSize: number
  uploadTime: string | null
}

/** GET /api/files/{id} 返回的完整文件信息 */
export interface FileDetail {
  fileId: number
  fileName: string
  fileType: string
  size: number
  uploadTime: string | null
  downloadUrl: string
  status: string
  /** 解析后的 JSON 摘要（解析完成时填充） */
  parsedSummary?: string
}

export const fileService = {
  async listFiles(): Promise<UserFileRecord[]> {
    const res = await fetch(apiUrl('/api/files'), {
      headers: { 'X-User-Id': userId() || '' }
    })
    if (!res.ok) throw new Error(`获取文件列表失败: ${res.status}`)
    const body = await res.json() as { files?: BackendFileItem[] }
    return (body.files || []).map(f => ({
      id: f.id,
      userId: '',
      originalFileName: f.fileName,
      fileName: f.fileName,
      fileSize: f.fileSize,
      fileType: f.fileType,
      uploadTime: f.uploadTime || '',
    }))
  },

  /** 获取单个文件详情（含 parsedSummary） */
  async getFileDetail(id: number): Promise<FileDetail> {
    const res = await fetch(apiUrl(`/api/files/${id}`), {
      headers: { 'X-User-Id': userId() || '' }
    })
    if (!res.ok) throw new Error(`获取文件详情失败: ${res.status}`)
    return res.json()
  },

  async downloadFile(id: number): Promise<void> {
    const url = apiUrl(`/api/files/download/${id}`)
    const res = await fetch(url, {
      headers: { 'X-User-Id': userId() || '' }
    })
    if (!res.ok) throw new Error(`下载失败: ${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    // 从 Content-Disposition header 提取文件名，与 FTP 展示名称保持一致
    const disposition = res.headers.get('Content-Disposition')
    const match = disposition?.match(/filename\*=UTF-8''(.+)/) || disposition?.match(/filename="?([^";]+)"?/)
    a.download = match?.[1] ? decodeURIComponent(match[1]) : 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  },

  async deleteFile(id: number): Promise<void> {
    const res = await fetch(apiUrl(`/api/files/${id}`), {
      method: 'DELETE',
      headers: { 'X-User-Id': userId() || '' }
    })
    if (!res.ok) throw new Error(`删除失败: ${res.status}`)
  },

  async uploadFile(file: File): Promise<UserFileRecord> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(apiUrl('/api/files/upload'), {
      method: 'POST',
      headers: { 'X-User-Id': userId() || '' },
      body: formData
    })
    if (!res.ok) throw new Error(`上传失败: ${res.status}`)
    return res.json()
  }
}
