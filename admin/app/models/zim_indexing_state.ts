import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

export default class ZimIndexingState extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare file_path: string

  @column()
  declare total_articles: number | null

  @column()
  declare articles_processed: number

  @column()
  declare last_successful_offset: number

  @column({
    prepare: (value: string[]) => JSON.stringify(value),
    consume: (value: string) => {
      if (!value) return []
      if (typeof value !== 'string') return Array.isArray(value) ? value : []
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    },
  })
  declare failed_article_paths: string[]

  @column()
  declare status: 'in_progress' | 'completed' | 'failed' | 'partial'

  @column.dateTime()
  declare started_at: DateTime

  @column.dateTime({ autoUpdate: true })
  declare updated_at: DateTime
}
