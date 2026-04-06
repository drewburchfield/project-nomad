import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'zim_indexing_states'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('file_path').notNullable().unique()
      table.integer('total_articles').nullable()
      table.integer('articles_processed').notNullable().defaultTo(0)
      table.integer('last_successful_offset').notNullable().defaultTo(0)
      table.json('failed_article_paths').nullable()
      table
        .enum('status', ['in_progress', 'completed', 'failed', 'partial'])
        .notNullable()
        .defaultTo('in_progress')
      table.timestamp('started_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
