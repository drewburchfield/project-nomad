import { RagService } from '#services/rag_service'
import { EmbedFileJob } from '#jobs/embed_file_job'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { randomBytes } from 'node:crypto'
import { sanitizeFilename } from '../utils/fs.js'
import { deleteFileSchema, getJobStatusSchema } from '#validators/rag'
import { DockerService } from '#services/docker_service'
import { OllamaService } from '#services/ollama_service'
import { QueueService } from '#services/queue_service'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import logger from '@adonisjs/core/services/logger'

@inject()
export default class RagController {
  constructor(private ragService: RagService) {}

  /**
   * Health check endpoint for the RAG pipeline.
   * Returns status of Ollama, Qdrant, and the embedding queue.
   */
  public async health({ response }: HttpContext) {
    const dockerService = new DockerService()
    const ollamaService = new OllamaService()
    const queueService = new QueueService()

    const [ollama, qdrant, queue] = await Promise.all([
      this.checkOllama(dockerService, ollamaService),
      this.checkQdrant(dockerService),
      this.checkQueue(queueService),
    ])

    const healthy = ollama.reachable && qdrant.reachable
    return response.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      ollama,
      qdrant,
      queue,
    })
  }

  private async checkOllama(
    dockerService: DockerService,
    ollamaService: OllamaService
  ): Promise<{ reachable: boolean; modelLoaded: boolean }> {
    try {
      const url = await dockerService.getServiceURL(SERVICE_NAMES.OLLAMA)
      if (!url) return { reachable: false, modelLoaded: false }

      const models = await ollamaService.getModels(true)
      const modelLoaded = models.some((m) => m.name.toLowerCase().includes('nomic-embed-text'))
      return { reachable: true, modelLoaded }
    } catch (error) {
      logger.debug(
        '[RAG:health] Ollama check failed: %s',
        error instanceof Error ? error.message : error
      )
      return { reachable: false, modelLoaded: false }
    }
  }

  private async checkQdrant(
    dockerService: DockerService
  ): Promise<{ reachable: boolean; collectionExists: boolean; documentCount: number }> {
    try {
      const url = await dockerService.getServiceURL(SERVICE_NAMES.QDRANT)
      if (!url) return { reachable: false, collectionExists: false, documentCount: 0 }

      const { QdrantClient } = await import('@qdrant/js-client-rest')
      const client = new QdrantClient({ url })

      const collections = await client.getCollections()
      const exists = collections.collections.some(
        (c) => c.name === RagService.CONTENT_COLLECTION_NAME
      )

      let documentCount = 0
      if (exists) {
        const info = await client.getCollection(RagService.CONTENT_COLLECTION_NAME)
        documentCount = info.points_count ?? 0
      }

      return { reachable: true, collectionExists: exists, documentCount }
    } catch (error) {
      logger.debug(
        '[RAG:health] Qdrant check failed: %s',
        error instanceof Error ? error.message : error
      )
      return { reachable: false, collectionExists: false, documentCount: 0 }
    }
  }

  private async checkQueue(
    queueService: QueueService
  ): Promise<{ active: number; waiting: number; delayed: number; failed: number }> {
    try {
      const queue = queueService.getQueue(EmbedFileJob.queue)
      const counts = await queue.getJobCounts('active', 'waiting', 'delayed', 'failed')
      return {
        active: counts.active ?? 0,
        waiting: counts.waiting ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
      }
    } catch (error) {
      logger.debug(
        '[RAG:health] Queue check failed: %s',
        error instanceof Error ? error.message : error
      )
      return { active: 0, waiting: 0, delayed: 0, failed: 0 }
    }
  }

  public async upload({ request, response }: HttpContext) {
    const uploadedFile = request.file('file')
    if (!uploadedFile) {
      return response.status(400).json({ error: 'No file uploaded' })
    }

    const randomSuffix = randomBytes(6).toString('hex')
    const sanitizedName = sanitizeFilename(uploadedFile.clientName)

    const fileName = `${sanitizedName}-${randomSuffix}.${uploadedFile.extname || 'txt'}`
    const fullPath = app.makePath(RagService.UPLOADS_STORAGE_PATH, fileName)

    await uploadedFile.move(app.makePath(RagService.UPLOADS_STORAGE_PATH), {
      name: fileName,
    })

    // Dispatch background job for embedding
    const result = await EmbedFileJob.dispatch({
      filePath: fullPath,
      fileName,
    })

    return response.status(202).json({
      message: result.message,
      jobId: result.jobId,
      fileName,
      filePath: `/${RagService.UPLOADS_STORAGE_PATH}/${fileName}`,
      alreadyProcessing: !result.created,
    })
  }

  public async getActiveJobs({ response }: HttpContext) {
    const jobs = await EmbedFileJob.listActiveJobs()
    return response.status(200).json(jobs)
  }

  public async getJobStatus({ request, response }: HttpContext) {
    const reqData = await request.validateUsing(getJobStatusSchema)

    const fullPath = app.makePath(RagService.UPLOADS_STORAGE_PATH, reqData.filePath)
    const status = await EmbedFileJob.getStatus(fullPath)

    if (!status.exists) {
      return response.status(404).json({ error: 'Job not found for this file' })
    }

    return response.status(200).json(status)
  }

  public async getStoredFiles({ response }: HttpContext) {
    const files = await this.ragService.getStoredFiles()
    return response.status(200).json({ files })
  }

  public async deleteFile({ request, response }: HttpContext) {
    const { source } = await request.validateUsing(deleteFileSchema)
    const result = await this.ragService.deleteFileBySource(source)
    if (!result.success) {
      return response.status(500).json({ error: result.message })
    }
    return response.status(200).json({ message: result.message })
  }

  public async getFailedJobs({ response }: HttpContext) {
    const jobs = await EmbedFileJob.listFailedJobs()
    return response.status(200).json(jobs)
  }

  public async cleanupFailedJobs({ response }: HttpContext) {
    const result = await EmbedFileJob.cleanupFailedJobs()
    return response.status(200).json({
      message: `Cleaned up ${result.cleaned} failed job${result.cleaned !== 1 ? 's' : ''}${result.filesDeleted > 0 ? `, deleted ${result.filesDeleted} file${result.filesDeleted !== 1 ? 's' : ''}` : ''}.`,
      ...result,
    })
  }

  public async scanAndSync({ response }: HttpContext) {
    try {
      const syncResult = await this.ragService.scanAndSyncStorage()
      return response.status(200).json(syncResult)
    } catch (error) {
      return response
        .status(500)
        .json({ error: 'Error scanning and syncing storage', details: error.message })
    }
  }
}
